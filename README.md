# Gift Hunter Agent

Gift Hunter Agent turns what you know about someone into a thoughtful gift plan: eight distinct ideas, followed by live shopping picks for the strongest directions.

## Screenshots

<figure>
  <img src="docs/screenshots/gift-directions.png" alt="Deployed Gift Hunter Agent showing the recipient form and eight personalized gift directions" width="100%">
  <figcaption><strong>Gift directions.</strong> The deployed app turns Alex's coding and pop-music interests into eight birthday ideas within a $100 budget.</figcaption>
</figure>

<figure>
  <img src="docs/screenshots/verified-picks.png" alt="Deployed shopping view showing verified product picks grouped beneath two gift directions" width="100%">
  <figcaption><strong>Verified picks.</strong> The live site groups priced product listings under the two matching gift directions.</figcaption>
</figure>

<figure>
  <img src="docs/screenshots/verified-picks-expanded.png" alt="Expanded deployed shopping view with additional product listings for each gift direction" width="100%">
  <figcaption><strong>Expanded shortlist.</strong> Review more live listings while keeping each product grouped with its gift idea.</figcaption>
</figure>

## What It Does

- Builds eight gift directions from a recipient's interests, personal clues, occasion, and maximum budget.
- Uses Google Gemma for planning, with Gemini Flash Lite as a Google fallback. NVIDIA NIM can be configured as an alternative provider.
- Searches Google Shopping for the three highest-priority directions when SerpApi is configured.
- Shows priced listings only when they are at or below the entered budget and their titles match at least one stated interest.
- Keeps gift directions available when an AI or shopping integration is unavailable.

## How It Works

1. Enter a name, interests, personal clues, budget, and occasion.
2. The model returns a structured plan containing eight distinct ideas and three prioritized shopping queries.
3. SerpApi retrieves Google Shopping results for those queries.
4. The server filters out listings without a parseable price, listings over budget, and titles that do not reflect a stated interest. Remaining picks are grouped under their corresponding directions.

Shopping prices and availability can change; confirm the details on the retailer's page before buying.

## Run Locally

Requirements: Node.js 20.9 or later and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Next.js may choose another port if 3000 is already in use.

Create a local environment file from the example, then add your own provider keys:

```powershell
Copy-Item .env.example .env.local
```

Never commit `.env.local` or paste API keys into the README.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables Google AI Studio planning. Gemma is the default model. |
| `GEMMA_PROVIDER` | Selects `google` (default) or `nvidia`. |
| `GEMMA_MODEL` | Google primary model; defaults to `gemma-4-26b-a4b-it`. |
| `GEMINI_FALLBACK_MODEL` | Google fallback model; defaults to `gemini-flash-lite-latest`. |
| `NVIDIA_NIM_API` | NVIDIA NIM key when `GEMMA_PROVIDER=nvidia`. |
| `NVIDIA_MODEL` | NVIDIA model; defaults to `google/gemma-4-31b-it`. |
| `SERPAPI_KEY` | Enables live Google Shopping searches for the top three directions. |
| `MONGODB_URI` | Reserved for planned persistence; MongoDB is not connected to the current app flow. |
| `ENABLE_LIVE_SHOPPING` | Set to `false` to disable shopping searches. |
| `ENABLE_NVIDIA_NIM` | Set to `false` to disable NVIDIA NIM. |

Both AI planning and live shopping require their respective API keys. If the AI provider is unavailable, the app displays a curated gift plan; live product search is skipped for that fallback plan.

## Tech Stack

- Next.js App Router, React, and TypeScript
- Google Gen AI SDK for Gemma and Gemini
- NVIDIA NIM as an optional model provider
- SerpApi Google Shopping engine for product discovery
- Lucide React icons

## Future Enhancements

MongoDB Atlas is reserved for persistent, user-controlled memory. These are planned capabilities; the current app does not collect or save friend profiles, gift plans, or shopping picks.

- **Friend profiles:** Let users save and revisit a friend's interests, preferences, important details, and things to avoid instead of re-entering them each time.
- **Gift memory and shortlists:** Save plans and favorite listings, record gifts already given, and use feedback to make future recommendations more relevant and avoid repeats.
- **Memory-aware chat agent:** Add a conversational planning flow that asks useful follow-up questions and, with the user's consent, uses the saved profile and gift history as context for personalized suggestions.
- **Semantic recall:** Explore MongoDB Atlas Vector Search to retrieve related past gifts and preferences when exact keyword matches are not enough.
- **Privacy controls:** Provide clear consent and controls to review, update, or delete saved profiles and gift history.

## Current Scope

MongoDB Atlas is retained for planned friend profiles and saved gifts, but the current app does not connect to it. Gift plans and shopping results are not persisted between requests; Atlas Vector Search is not implemented.

Recipient details are sent to the selected AI provider to generate a plan; shopping queries and result filtering are sent through SerpApi. Avoid entering sensitive personal information.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```
