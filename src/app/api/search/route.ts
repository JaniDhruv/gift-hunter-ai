import { NextResponse } from "next/server";
import axios from "axios";
import { getJson } from "serpapi";
import { GoogleGenAI, Type } from "@google/genai";

type GiftDirection = { id: string; title: string; category: string; estimatedPrice: string; whyItFits: string; personalTouch: string; searchQuery: string; searchPriority: number };
type GiftPlan = { recipientSummary: string; giftStrategy: string; directions: GiftDirection[] };
type ShoppingResult = { title: string; price: string; product_link?: string; link?: string; source?: string; thumbnail?: string };
type Product = { title: string; price: string; link: string; linkLabel: string; source: string; thumbnail?: string; directionId: string; directionTitle: string };
type ShoppingOutcome = { products: Product[]; searched: boolean };

const directionSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    title: { type: Type.STRING },
    category: { type: Type.STRING },
    estimatedPrice: { type: Type.STRING },
    whyItFits: { type: Type.STRING },
    personalTouch: { type: Type.STRING },
    searchQuery: { type: Type.STRING },
    searchPriority: { type: Type.INTEGER },
  },
  required: ["id", "title", "category", "estimatedPrice", "whyItFits", "personalTouch", "searchQuery", "searchPriority"],
};

const giftPlanSchema = {
  type: Type.OBJECT,
  properties: {
    recipientSummary: { type: Type.STRING },
    giftStrategy: { type: Type.STRING },
    directions: { type: Type.ARRAY, items: directionSchema },
  },
  required: ["recipientSummary", "giftStrategy", "directions"],
};

const shoppingCache = new Map<string, { expiresAt: number; products: Product[] }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function cleanJson(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("invalid_json");
  return JSON.parse(raw.slice(start, end + 1));
}

function parseBudget(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseListingPrice(value?: string) {
  const match = value?.replace(/,/g, "").match(/(?:US)?\$\s*(\d+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsPhrase(text: string, phrase: string) {
  const normalizedText = ` ${normalizeWords(text)} `;
  const normalizedPhrase = normalizeWords(phrase);
  return Boolean(normalizedPhrase && normalizedText.includes(` ${normalizedPhrase} `));
}

function matchesInterests(title: string, interests: string) {
  const titleText = normalizeWords(title);
  const groups = interests.toLowerCase().split(/[,;/]|\band\b/)
    .map((group) => group.replace(/\b(loves?|likes?|enjoys?|is into|fan of|making)\b/g, " ").trim())
    .filter(Boolean);
  const aliases: Record<string, string[]> = {
    coding: ["coding", "code", "programming", "programmer", "developer", "software"],
    anime: ["anime", "manga", "otaku", "cosplay"],
    music: ["music", "song", "vinyl", "album", "concert"],
    coffee: ["coffee", "espresso", "barista", "cafe"],
  };
  return groups.some((group) => {
    if (containsPhrase(titleText, group)) return true;
    const words = normalizeWords(group).split(" ");
    const matchedAliases = Object.entries(aliases).filter(([key]) => words.includes(key));
    if (matchedAliases.length) return matchedAliases.some(([, terms]) => terms.some((alias) => containsPhrase(titleText, alias)));
    return words.filter((word) => word.length > 2).some((word) => containsPhrase(titleText, word));
  });
}

function isPlan(value: unknown): value is GiftPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<GiftPlan>;
  if (typeof plan.recipientSummary !== "string" || typeof plan.giftStrategy !== "string" ||
    !Array.isArray(plan.directions) || plan.directions.length !== 8 || !plan.directions.every((idea) =>
      typeof idea?.id === "string" && typeof idea?.title === "string" && typeof idea?.category === "string" &&
      typeof idea?.estimatedPrice === "string" && typeof idea?.whyItFits === "string" &&
      typeof idea?.personalTouch === "string" && typeof idea?.searchQuery === "string" &&
      Number.isInteger(idea?.searchPriority) && idea.searchPriority >= 1 && idea.searchPriority <= 8)) return false;
  const topQueries = [...plan.directions].sort((a, b) => a.searchPriority - b.searchPriority).slice(0, 3).map((idea) => idea.searchQuery.trim().toLowerCase());
  return new Set(topQueries).size === 3;
}

function normalizePlan(plan: GiftPlan): GiftPlan {
  return { ...plan, directions: plan.directions.map((direction, index) => ({ ...direction, id: `idea-${index + 1}`, searchQuery: direction.searchQuery.trim() })) };
}

function fallbackPlan(friendName: string, interests: string, budget: string, occasion: string): GiftPlan {
  const signals = interests.replace(/\b(loves?|likes?|enjoys?|is into)\b/gi, "").split(/[,/]|\band\b/i).map((item) => item.trim()).filter(Boolean);
  const [primary = "favorite hobby", secondary = "creative side", third = "personal style"] = signals;
  const options = [
    ["A hands-on upgrade", "Skill-building", `${primary} starter kit`, `It gives ${friendName || "them"} a better way to enjoy ${primary}.`, "Add a short note naming the first thing they should make with it."],
    ["A crossover collectible", "Collectible", `${primary} ${secondary} gift`, `It connects ${primary} and ${secondary}, which makes it feel unusually specific.`, "Choose a colorway or edition that matches their taste."],
    ["A daily ritual upgrade", "Everyday joy", `unique ${primary} desk accessory`, "It turns an ordinary part of their day into a small reminder that you notice them.", "Pair it with their favorite snack or a handwritten card."],
    ["A creative experience", "Experience", `${secondary} workshop or class gift`, "A shared experience creates a memory, not just another object.", "Plan the date or go with them."],
    ["A display-worthy piece", "Personal space", `${secondary} wall art or poster`, "It lets their room reflect something they genuinely care about.", "Frame it before giving it."],
    ["A limited-edition find", "Surprise", `${third} limited edition gift`, "The thrill comes from finding something they would not buy for themselves.", "Explain why this specific edition made you think of them."],
    ["A comfort bundle", "Care package", `${primary} themed care package`, "It blends their interests with a bit of care for a busy week.", "Include one item only you would know they like."],
    ["A lasting subscription", "Long-term delight", `${primary} subscription box`, `It keeps the thought going beyond ${occasion || "the occasion"}.`, "Set the first delivery to arrive when they need a lift."],
  ];
  return { recipientSummary: `${friendName || "Your friend"} is into ${signals.join(", ") || "the things that make them feel most like themselves"}.`, giftStrategy: "Blend one core interest with a personal detail, then choose the gift that feels most natural for the occasion.", directions: options.map(([title, category, searchQuery, whyItFits, personalTouch], index) => ({ id: `idea-${index + 1}`, title, category, estimatedPrice: `Under $${budget}`, whyItFits, personalTouch, searchQuery, searchPriority: index + 1 })) };
}

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

type ModelReply = { text: string; provider: string; model: string };

async function askGemma(prompt: string, temperature: number, modelOverride?: string): Promise<ModelReply> {
  const provider = process.env.GEMMA_PROVIDER || (process.env.GEMINI_API_KEY?.trim() ? "google" : "nvidia");
  if (provider === "google") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("missing_google_key");
    const gemmaModel = process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it";
    const requestGoogleModel = async (model: string): Promise<ModelReply> => {
      const client = new GoogleGenAI({ apiKey });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          client.models.generateContent({
            model,
            contents: `You are Gift Hunter Agent, a thoughtful and specific gift strategist. Return only the requested valid JSON object.\n\n${prompt}`,
            config: { temperature, maxOutputTokens: 3072, responseMimeType: "application/json", responseSchema: giftPlanSchema },
          }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("model_timeout")), 25000); }),
        ]);
        return { text: response.text ?? "", provider: model === gemmaModel ? "Google AI Studio · Gemma" : "Google AI Studio · Gemini fallback", model };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };
    const model = modelOverride || gemmaModel;
    try {
      return await requestGoogleModel(model);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (modelOverride || model !== gemmaModel || status === 401 || status === 403 || status === 429) throw error;
      return requestGoogleModel(process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest");
    }
  }
  if (provider !== "nvidia") throw new Error("invalid_provider");
  const apiKey = process.env.ENABLE_NVIDIA_NIM !== "false" ? process.env.NVIDIA_NIM_API?.trim() : undefined;
  if (!apiKey) throw new Error("missing_nvidia_key");
  const model = process.env.NVIDIA_MODEL || "google/gemma-4-31b-it";
  const response = await axios.post("https://integrate.api.nvidia.com/v1/chat/completions", {
    model, max_tokens: 4096, temperature, stream: false,
    messages: [{ role: "system", content: "You are Gift Hunter Agent, a thoughtful and specific gift strategist. Return only the requested valid JSON object." }, { role: "user", content: prompt }],
  }, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, timeout: 45000 });
  return { text: response.data.choices?.[0]?.message?.content ?? "", provider: "NVIDIA NIM", model };
}

function explainProviderError(error: unknown, provider: string) {
  if (error instanceof Error && error.message === "model_timeout") return "The model did not respond within 25 seconds. Check the Google AI service and try again.";
  if (error instanceof Error && error.message === "missing_google_key") return "GEMINI_API_KEY is missing. Add a Google AI Studio key to .env.local and restart the dev server.";
  if (error instanceof Error && error.message === "missing_nvidia_key") return "NVIDIA_NIM_API is missing. Add the NVIDIA key to .env.local or set GEMMA_PROVIDER=google.";
  if (error instanceof Error && error.message === "invalid_provider") return "GEMMA_PROVIDER must be google or nvidia.";
  if (provider === "google") {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
    if (status === 400 || status === 404) return `Google AI Studio rejected model ${process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it"} or its request format. Check GEMMA_MODEL.`;
    if (status === 401 || status === 403) return "Google AI Studio rejected GEMINI_API_KEY. Check that the key is active and Gemini API is enabled.";
    if (status === 429) return "Google AI Studio rate-limited this key. Wait briefly and try again.";
    if (status >= 500) return `Google AI Studio is temporarily unavailable (HTTP ${status}). Try again shortly.`;
    return error instanceof Error ? `Google Gemma request failed: ${error.message}` : "Google Gemma request failed.";
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) return "NVIDIA rejected the API key. Create a fresh key, update NVIDIA_NIM_API in .env.local, then restart the dev server.";
    if (status === 404) return `NVIDIA does not recognize model ${process.env.NVIDIA_MODEL || "google/gemma-4-31b-it"}. Check the model name and access in .env.local.`;
    if (status === 429) return "NVIDIA rate-limited this key. Wait briefly and try again.";
    if (status && status >= 500) return `NVIDIA inference is temporarily unavailable (HTTP ${status}). Try again shortly.`;
    if (error.code === "ECONNABORTED") return "Gemma took longer than 45 seconds to respond. Try again shortly.";
    if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code || "")) return "This server could not reach NVIDIA. Check its internet connection and outbound HTTPS access.";
    return status ? `NVIDIA returned HTTP ${status}. Check the key and model access.` : "The server could not connect to NVIDIA. Check the server's internet connection.";
  }
  return "Gemma returned output that did not match the gift plan format. Try again; curated ideas are still available.";
}

async function createPlan(friendName: string, interests: string, budget: string, occasion: string) {
  const fallback = fallbackPlan(friendName, interests, budget, occasion);
  const contract = "Return one compact JSON object with recipientSummary, giftStrategy, and exactly 8 genuinely distinct gift directions. Each needs id, title, category, estimatedPrice, whyItFits, personalTouch, searchQuery, and integer searchPriority 1-8. Cover: skill-building, a crossover, everyday joy, an experience, personal space, a surprise, a care bundle, and a lasting gift. Personalization rules: anchor every idea in a stated interest; when multiple interests are given, make at least 3 ideas combine them meaningfully. Explain why this specific recipient would like each idea, not a reusable generic benefit. Make titles concrete gift concepts and personalTouch actions specific to their interests. Do not default to keyboards, mugs, headphones, desk gear, or generic merchandise unless the recipient explicitly mentioned them. Do not invent a favorite series, character, age, gender, or personal history. Search queries must be distinct, describe a specific purchasable item or experience, include the most relevant stated interest(s), and be realistic under the maximum budget. Pick the 3 strongest non-overlapping directions for shopping. Keep each text field to one concise sentence. No markdown.";
  const input = `Recipient: ${friendName || "friend"}. Stated interests (use these, do not infer beyond them): ${interests}. Occasion: ${occasion || "gift"}. Maximum total budget: $${budget}. ${contract}`;
  let reply: ModelReply;
  try {
    reply = await askGemma(input, 0.55);
  } catch (error) {
    return { plan: fallback, mode: "Curated backup plan", fallbackReason: explainProviderError(error, process.env.GEMMA_PROVIDER || (process.env.GEMINI_API_KEY?.trim() ? "google" : "nvidia")) };
  }

  try {
    const parsed = cleanJson(reply.text);
    if (isPlan(parsed)) return { plan: normalizePlan(parsed), mode: reply.model.startsWith("gemma") ? "Gemma-guided plan" : "Gemini fallback plan", provider: reply.provider, model: reply.model, fallbackReason: undefined as string | undefined };
  } catch {
    // Malformed or incomplete output gets one bounded repair attempt below.
  }

  try {
    const repairedReply = await askGemma(`${contract}\nRepair this incomplete or invalid response. Keep its useful gift ideas, fix every field, and return the full object only:\n${reply.text.slice(0, 12000)}`, 0, reply.model);
    const repaired = cleanJson(repairedReply.text);
    if (isPlan(repaired)) return { plan: normalizePlan(repaired), mode: repairedReply.model.startsWith("gemma") ? "Gemma-guided plan" : "Gemini fallback plan", provider: repairedReply.provider, model: repairedReply.model, fallbackReason: undefined as string | undefined };
  } catch (error) {
    return { plan: fallback, mode: "Curated backup plan", fallbackReason: explainProviderError(error, process.env.GEMMA_PROVIDER || (process.env.GEMINI_API_KEY?.trim() ? "google" : "nvidia")) };
  }
  return { plan: fallback, mode: "Curated backup plan", fallbackReason: "Gemma returned JSON, but it did not contain eight complete gift directions. Try again; the response is being checked against the required schema." };
}

function searchShopping(direction: GiftDirection, maxBudget: number, interests: string): Promise<ShoppingOutcome> {
  const cacheKey = `${maxBudget}:${interests.toLowerCase()}:${direction.searchQuery.toLowerCase()}`;
  const cached = shoppingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve({ products: cached.products, searched: false });
  if (!process.env.SERPAPI_KEY || process.env.ENABLE_LIVE_SHOPPING === "false") return Promise.resolve({ products: [], searched: false });
  return new Promise((resolve) => {
    let completed = false;
    const finish = (outcome: ShoppingOutcome) => { if (!completed) { completed = true; clearTimeout(timeout); resolve(outcome); } };
    const timeout = setTimeout(() => finish({ products: [], searched: true }), 7000);
    getJson({ engine: "google_shopping", q: `${direction.searchQuery} under $${maxBudget}`, api_key: process.env.SERPAPI_KEY, hl: "en", gl: "us", num: 12 }, (response) => {
      const products = (response.shopping_results || []).filter((item: ShoppingResult) => {
        const price = parseListingPrice(item.price);
        return price !== null && price <= maxBudget && matchesInterests(item.title || "", interests);
      }).slice(0, 6).map((item: ShoppingResult) => {
        const shoppingPage = safeHttpUrl(item.product_link);
        const directProduct = safeHttpUrl(item.link);
        const link = shoppingPage || directProduct || `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.title || direction.searchQuery)}`;
        return {
          title: item.title || "Gift listing",
          price: item.price || "See listing",
          link,
          linkLabel: shoppingPage ? "View on Google Shopping" : directProduct ? "View product" : "Search this gift",
          source: item.source || "Google Shopping",
          thumbnail: item.thumbnail,
          directionId: direction.id,
          directionTitle: direction.title,
        };
      });
      shoppingCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, products });
      finish({ products, searched: true });
    });
  });
}

export async function POST(req: Request) {
  try {
    const { friendName = "", interests = "", budget = "", occasion = "" } = await req.json();
    const maxBudget = typeof budget === "string" ? parseBudget(budget) : null;
    if (typeof interests !== "string" || !interests.trim() || maxBudget === null) return NextResponse.json({ error: "Add their interests and a valid budget, like 100." }, { status: 400 });
    const { plan, mode, provider, model, fallbackReason } = await createPlan(friendName, interests, String(maxBudget), occasion);
    const directions = mode !== "Curated backup plan" ? [...plan.directions].sort((a, b) => a.searchPriority - b.searchPriority).slice(0, 3) : [];
    const outcomes = await Promise.all(directions.map((direction) => searchShopping(direction, maxBudget, interests)));
    return NextResponse.json({ plan, mode, provider, model, fallbackReason, budget: maxBudget, shoppingEnabled: Boolean(process.env.SERPAPI_KEY && process.env.ENABLE_LIVE_SHOPPING !== "false"), products: outcomes.flatMap((outcome) => outcome.products), searchCount: outcomes.filter((outcome) => outcome.searched).length });
  } catch (error) {
    console.error("Gift plan request failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "We could not prepare that gift plan. Check the fields and try again." }, { status: 500 });
  }
}
