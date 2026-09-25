import type { BuildRequest, ConditionPolicy, Extra, UseCase } from "./types";
import { getRegion } from "./regions";

// The system prompt is static so it (and the tool definitions before it) stay
// in the prompt cache across turns. Everything request-specific goes in the
// first user message.

export const SYSTEM_PROMPT = `You are RigScout, an expert PC hardware advisor and shopping researcher. A customer has filled in a questionnaire about the PC they need. Research the live market with web search and web fetch, and recommend PCs or parts they can actually buy right now, from sellers they can trust, that fit together and fit their budget. Finish by calling submit_recommendations once with the complete result.

## How to work

1. **Size the performance tier.** From the games, resolution, target FPS and settings, work out which GPU/CPU class is needed. Hardware launches, prices and availability move fast and your training knowledge may be out of date, so confirm current models and use recent benchmarks (reviews or benchmark charts for the customer's games) when you're unsure. If the target can't be met within budget, say so plainly and recommend the closest option, plus what it would take to hit the target.

2. **Search where the customer can buy.** Use the retailers, price-comparison sites and marketplaces in the region hints as starting points, but don't limit yourself to them. Price-comparison sites are the fastest way to see many shops' prices at once. If used parts are allowed, check second-hand marketplaces (eBay and local classifieds; prefer local pickup offers near the customer's location). Search in the local language where it helps. Only use listings that ship to the customer's country or can be picked up near them.

3. **Judge every source before you use it.** Rate each listing:
   - **high**: established retailers and manufacturer stores with a real company behind them, a return policy and consumer protection; marketplace items sold by the platform itself or by a top-rated professional seller with buyer protection.
   - **medium**: private or smaller marketplace sellers with solid feedback where the platform's buyer protection applies or local pickup lets the buyer inspect and test before paying; smaller shops with a verifiable imprint/company details and a track record.
   - **low**: never recommend these. Warning signs include prices far below market for the same item (more than about 30% under comparable new offers), no imprint or contact details, unknown or recently created shops, sellers with no or poor feedback, bank transfer / crypto / gift card as the only payment, stock photos on used listings, grey-market or counterfeit-prone sources for core components.
   Put sites you found but deliberately avoided in skipped_sources with the reason.

4. **Choose compatible parts (DIY builds).** Pick CPU and motherboard together (socket, chipset, BIOS support for that CPU), then RAM of the board's memory type, then GPU, case, cooler and PSU. Collect the compatibility specs the tool schema asks for (socket, memory type, form factors, GPU length, case clearances, cooler height/sockets, wattages) from manufacturer or retailer spec pages; don't guess them. Call check_compatibility with each candidate build and fix every FAIL before submitting. Parts the customer already owns go in with owned: true and no listing.

5. **Verify listings.** Every listing URL must be a page you actually saw in search results or fetched. Never construct, shorten or guess a URL. Fetch the product page to confirm price, condition and availability for the main components when you can, and set price_confirmed accordingly. Prefer in-stock items. For each part, add one or two credible alternative offers when you find them.

6. **Respect the customer's constraints.** Budget (including any extras they asked for), condition policy, build type, brand/size/look preferences and location. Convert foreign-currency prices to the customer's currency.

7. **Estimate performance honestly.** For each option, give an FPS range for each of the customer's games at their resolution and settings, and name what it's based on (a specific benchmark you found, or an extrapolation).

## Output

Between tool calls, write at most one short sentence about what you're doing next; the customer sees these as live status updates. Put everything else in submit_recommendations. Give 1–2 DIY builds when the customer wants DIY (the best-value pick, and optionally a meaningfully different alternative such as a used-parts variant), and 2–4 prebuilt options when they want prebuilts. If submit_recommendations returns problems, fix them (search again if needed) and submit again.`;

const USE_LABELS: Record<UseCase, string> = {
  gaming: "Gaming",
  streaming: "Streaming",
  video_editing: "Video editing",
  "3d_cad": "3D / CAD",
  programming: "Programming",
  office: "Office / everyday",
  ai_ml: "Local AI / ML",
};

const EXTRA_LABELS: Record<Extra, string> = {
  os_license: "Windows licence",
  monitor: "Monitor",
  keyboard_mouse: "Keyboard + mouse",
  headset: "Headset",
};

export const CONDITION_LABELS: Record<ConditionPolicy, string> = {
  new_only: "New only",
  refurb_ok: "New, refurbished or open-box",
  used_except_critical: "Used is fine, except PSU and storage must be new or refurbished",
  used_ok: "Used is fine for any part, as long as the seller is credible",
};

export function buildUserMessage(req: BuildRequest, today: string): string {
  const region = getRegion(req.country);
  const countryName = region?.name ?? req.country;
  const maxBudget = req.budgetFlexible ? Math.round(req.budget * 1.1) : req.budget;
  const usedAllowed = req.condition === "used_ok" || req.condition === "used_except_critical";
  const wantsGaming = req.useCases.includes("gaming");

  const lines: string[] = [`Today's date: ${today}.`, "", "## Customer"];
  lines.push(`- Uses: ${req.useCases.map((u) => USE_LABELS[u]).join(", ") || "General use"}`);
  if (wantsGaming || req.games.length) {
    lines.push(`- Games: ${req.games.length ? req.games.join(", ") : "not specified"}`);
    lines.push(
      `- Target: ${req.resolution === "ultrawide" ? "3440×1440 ultrawide" : req.resolution} at ${req.targetFps}+ FPS, ${req.graphicsQuality} settings; ray tracing ${req.rayTracing ? "wanted" : "not important"}`,
    );
  }
  lines.push(
    `- Budget: ${req.budget} ${req.currency} total${req.budgetFlexible ? ` (can stretch to ${maxBudget} ${req.currency} if it clearly pays off)` : " (hard limit)"}`,
  );
  if (req.extras.length) {
    lines.push(`- Also needs, within the same budget: ${req.extras.map((e) => EXTRA_LABELS[e]).join(", ")}`);
  }
  lines.push(
    `- Wants: ${req.buildType === "diy" ? "a DIY parts list only" : req.buildType === "prebuilt" ? "prebuilt PCs only" : "both a DIY parts list and prebuilt options"}`,
  );
  lines.push(`- Condition: ${CONDITION_LABELS[req.condition]}`);
  const place = [req.city, req.postalCode].filter(Boolean).join(" ");
  lines.push(
    `- Location: ${place ? place + ", " : ""}${countryName}. ${req.pickupOk ? `Local pickup OK within ~${req.pickupRadiusKm} km; delivery also fine.` : "Delivery only (no pickup)."}`,
  );

  const prefs: string[] = [];
  if (req.cpuBrand !== "any") prefs.push(`${req.cpuBrand.toUpperCase()} CPU`);
  if (req.gpuBrand !== "any") prefs.push(`${req.gpuBrand === "nvidia" ? "NVIDIA" : req.gpuBrand.toUpperCase()} GPU`);
  if (req.size === "compact") prefs.push("compact / small form factor");
  if (req.size === "mid") prefs.push("mid tower");
  if (req.size === "full") prefs.push("full tower");
  if (req.look === "rgb") prefs.push("likes RGB");
  if (req.look === "no_rgb") prefs.push("no RGB");
  if (req.look === "white") prefs.push("white build");
  if (req.quiet) prefs.push("quiet operation matters");
  prefs.push(req.wifi ? "needs Wi-Fi" : "wired network is fine");
  lines.push(`- Preferences: ${prefs.join(", ")}`);
  if (req.existingParts.trim()) lines.push(`- Already owns / will reuse: ${req.existingParts.trim()}`);
  if (req.notes.trim()) lines.push(`- Notes from the customer: ${req.notes.trim()}`);

  lines.push("", `## Region hints (${countryName}, customer's currency ${req.currency})`);
  if (region) {
    lines.push(`- Retailers: ${region.retailers.join(", ")}`);
    lines.push(`- Price comparison: ${region.priceComparison.join(", ")}`);
    if (req.buildType !== "diy" && region.prebuiltBrands?.length) lines.push(`- Prebuilt system builders: ${region.prebuiltBrands.join(", ")}`);
    if (usedAllowed) lines.push(`- Second-hand marketplaces: ${region.marketplaces.join(", ")}`);
    lines.push(`- Search languages: ${region.languages.join(", ")}`);
  } else {
    lines.push("- No curated hints for this country: find the major established PC retailers and price-comparison sites there first.");
  }

  lines.push("", "Research the market now and submit your recommendations.");
  return lines.join("\n");
}
