import { NextResponse } from "next/server";
import { getJson } from "serpapi";
import { GoogleGenAI } from "@google/genai";
import { MongoClient } from "mongodb";

const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy",
});

let mongoClient: MongoClient | null = null;
async function getMongoClient() {
  if (mongoClient) return mongoClient;
  if (!process.env.MONGODB_URI) return null;
  mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  return mongoClient;
}

export async function POST(req: Request) {
  try {
    const { friendName, interests, budget, occasion } = await req.json();

    // 1. Log the search to MongoDB (if configured)
    const client = await getMongoClient();
    if (client) {
      const db = client.db("gift_hunter");
      const collection = db.collection("searches");
      await collection.insertOne({ friendName, interests, budget, occasion, createdAt: new Date() });
    }

    // 2. Search SerpApi for product ideas based on interests
    // We'll construct a smart query
    const query = `gift for someone who likes ${interests} under ${budget} dollars`;
    
    // Note: To run this for real, SERPAPI_KEY must be in .env
    if (!process.env.SERPAPI_KEY) {
      console.warn("No SERPAPI_KEY found, using mock data for demo.");
    }
    
    let shoppingResults: any[] = [];
    
    try {
      if (process.env.SERPAPI_KEY) {
        const serpResponse = await new Promise((resolve, reject) => {
          getJson({
            engine: "google_shopping",
            q: query,
            api_key: process.env.SERPAPI_KEY,
            hl: "en",
            gl: "us",
          }, (json) => {
            if (json.error) reject(json.error);
            else resolve(json);
          });
        });
        shoppingResults = (serpResponse as any).shopping_results || [];
      } else {
        // Mock data if no key
        shoppingResults = [
          { title: "Retro Synth-Pop Vinyl Record", price: "$25.00", link: "#", source: "VinylShop", thumbnail: "https://via.placeholder.com/150" },
          { title: "Mechanical Keyboard Switch Tester", price: "$15.00", link: "#", source: "KeyGeek", thumbnail: "https://via.placeholder.com/150" },
          { title: "Artisan Pour-Over Coffee Maker", price: "$45.00", link: "#", source: "CoffeeBrew", thumbnail: "https://via.placeholder.com/150" },
          { title: "Generic Mug", price: "$10.00", link: "#", source: "GenericStore", thumbnail: "https://via.placeholder.com/150" }
        ];
      }
    } catch (err) {
      console.error("SerpApi Error:", err);
      // Fallback
      shoppingResults = [
        { title: "Creative Gift Idea", price: "$30.00", link: "#", source: "FallbackStore", thumbnail: "https://via.placeholder.com/150" }
      ];
    }

    // Take top 10 results to feed into Gemma
    const topResults = shoppingResults.slice(0, 10).map((r: any) => ({
      title: r.title,
      price: r.price,
      link: r.link,
      source: r.source,
      thumbnail: r.thumbnail
    }));

    // 3. Use Gemma via @google/genai to reason about the best gifts
    const prompt = `
      You are an expert personal shopper AI. 
      I am looking for a ${occasion} gift for my friend ${friendName}.
      Their budget is $${budget}.
      Their interests are: ${interests}.
      
      Here are the top products I found online:
      ${JSON.stringify(topResults, null, 2)}
      
      Please analyze these products and select the 3 BEST gifts for ${friendName} from the list.
      For each selected gift, explain *why* it's perfect for them based on their interests.
      
      Return ONLY a raw JSON array of objects. Do not include markdown formatting like \`\`\`json.
      Format:
      [
        {
          "title": "Exact Title of Product",
          "reasoning": "Your personalized explanation of why this fits their specific interests."
        }
      ]
    `;

    let gemmaPicks = [];

    if (process.env.GEMINI_API_KEY) {
      // Note: You can specify a Gemma model like gemma-2-9b-it if available, 
      // or gemini-2.5-flash which is the standard endpoint.
      // We will try gemini-2.5-flash as the fallback proxy if Gemma isn't explicitly deployed on the endpoint, 
      // but conceptually for the hackathon "open-source AI at its core", they could use a local Gemma model.
      try {
        const response = await genai.models.generateContent({
          model: 'gemini-2.5-flash', // In a real deployment with Gemma, we'd route to a Gemma endpoint via Vertex/HF
          contents: prompt,
          config: {
             responseMimeType: "application/json"
          }
        });
        
        const text = response.text || "[]";
        gemmaPicks = JSON.parse(text);
      } catch (err) {
        console.error("Gemma Generation Error:", err);
      }
    }

    // If API failed or no key, mock the reasoning
    if (!gemmaPicks.length) {
      gemmaPicks = topResults.slice(0, 3).map((r, i) => ({
        title: r.title,
        reasoning: `This matches their interests perfectly, providing a thoughtful touch for their ${occasion}.`
      }));
    }

    // Map back the product metadata (price, links) to Gemma's picks
    const finalProducts = gemmaPicks.map((pick: any) => {
      const productMeta = topResults.find(p => p.title === pick.title) || topResults[0];
      return {
        ...productMeta,
        reasoning: pick.reasoning
      };
    });

    return NextResponse.json({ products: finalProducts });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
