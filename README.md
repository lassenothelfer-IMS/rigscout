# RigScout – AI PC builder

RigScout asks what you need a PC for (games, resolution and FPS, budget, DIY or prebuilt, new or used, where you live). A Claude agent then researches the live market and recommends parts or complete PCs you can actually buy. It uses web search and web fetch, localized to your country, across retailers, price-comparison sites and second-hand marketplaces such as eBay, Kleinanzeigen, Ricardo and Tutti.

Nothing the AI says is taken on trust:

- **Compatibility is checked in code** ([lib/compatibility.ts](lib/compatibility.ts)). The checks cover CPU socket vs. motherboard, DDR generation and slot count, whether the board, GPU, cooler, radiator and PSU fit the case, cooler socket support, PSU headroom, M.2 slots and display output. The agent calls this checker as a tool while it works, and its final submission is rejected until every failure is fixed.
- **Seller credibility.** The agent rates every listing (high / medium / low) with a reason and lists the sites it chose to skip. Low-credibility listings are rejected. Known counterfeit-prone sites (see `BLOCKED_DOMAINS` in [lib/trust.ts](lib/trust.ts)) are excluded from search entirely. Each listing is also labelled as a known retailer, marketplace or official store.
- **Links are verified** ([lib/verify.ts](lib/verify.ts)). Every recommended URL must have appeared in the agent's own search or fetch results, and the server opens each one to catch dead pages and ended eBay/classifieds listings. Only public http(s) hosts are fetched.
- **Customer rules are enforced.** Budget (including extras), the new/used policy (for example "used OK except PSU and SSD") and DIY vs. prebuilt are all checked against the submission.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then put your ANTHROPIC_API_KEY in .env.local
npm run dev
```

Open http://localhost:3000. Without an API key, the **Watch a demo run** link replays a scripted run with sample data, so you can try the UI for free.

### Before your first real run

1. Create an API key in the [Anthropic Console](https://console.anthropic.com/settings/keys). It is separate from a claude.ai subscription.
2. **Add credits** under Billing. A new account with no balance fails on the first request.
3. Leave **web search and web fetch enabled** for your organization (Console privacy settings); the agent can't work without them.
4. Put the key in `.env.local` and **restart `npm run dev`**. Next.js only reads env files at startup.

New accounts have low rate limits, so the first runs may hit "rate limited"; wait a minute and retry, or set `RIGSCOUT_EFFORT=medium`.

## Cost

A real search pays for web searches ($10 per 1,000) plus model tokens. With the default `claude-opus-5` expect very roughly **$1-4 per run**. That's an estimate, not a measurement; the live counter shows the running cost.

Runs are capped so a bad run can't drain your account. The per-request `max_uses` on the web tools only limits one API call, so RigScout also enforces run-wide limits: at `RIGSCOUT_MAX_COST_USD` (default $6) or `RIGSCOUT_MAX_SEARCHES` (default 60) the agent is told to wrap up, and at 1.5x the run is stopped. The cost shown is an estimate; your Console usage page is the source of truth.

To make runs cheaper, set `RIGSCOUT_EFFORT=medium` or `RIGSCOUT_MODEL=claude-sonnet-5` in `.env.local`. Anyone who can open the site can start real searches, so for a public deployment use a key from a separate Anthropic workspace with a monthly spend limit. At most `RIGSCOUT_MAX_CONCURRENT` (default 2) runs go at once.

Requests opt into server-side refusal fallbacks (`fallbacks: "default"`), so if the model ever declines a request, Anthropic retries it on its recommended fallback model instead of failing.

## How it works

```
Wizard (components/Wizard.tsx)
  └─ POST /api/build  ──  Server-Sent Events  ──▶  live research feed (components/Research.tsx)
        └─ runAgent (lib/agent.ts)
             ├─ web_search / web_fetch   (Anthropic server tools, localized to the user's country)
             ├─ check_compatibility      → lib/compatibility.ts
             └─ submit_recommendations   → validation: compat, budget, condition policy,
                                            credibility, blocklist, link checks
                                            ✗ problems → sent back to the agent to fix
                                            ✓ accepted → results page (components/Results.tsx)
```

- [lib/prompt.ts](lib/prompt.ts): the agent's instructions, plus the questionnaire formatted as a customer brief.
- [lib/regions.ts](lib/regions.ts): per-country currency, retailers, price-comparison sites and marketplaces, used as starting points. Add your country here.
- [lib/schema.ts](lib/schema.ts): zod schemas for the tool inputs (validated at runtime) and the result types.

## Limits

- Prices and stock change constantly. Results are a snapshot, and some shops block automated link checks (shown as "Not auto-checked").
- FPS figures are estimates from the benchmarks the agent finds, not guarantees.
- Facebook Marketplace and other log-in-only marketplaces can't be searched.
