import type { AgentEvent, BuildRequest } from "./types";
import type { FinalResult, PartT, VerifiedListing } from "./schema";
import { checkCompatibility } from "./compatibility";
import { domainOf, sourceType } from "./trust";

// Scripted run with sample data so the UI can be explored without an API key.
// Links go to real search pages (not invented product pages) and the result is
// flagged `demo` so the UI labels it as sample output.

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

const L = (
  retailer: string,
  url: string,
  price: number,
  extra: Partial<VerifiedListing> = {},
): VerifiedListing => ({
  retailer,
  url,
  price,
  currency: "EUR",
  price_in_user_currency: price,
  condition: "new",
  shipping: "Free shipping, 1–3 days",
  availability: "In stock",
  price_confirmed: true,
  credibility: "high",
  credibility_reason: "Established German retailer with statutory 14-day returns.",
  link_status: "seen",
  source_type: sourceType(url),
  domain: domainOf(url),
  ...extra,
});

const gz = (q: string) => `https://geizhals.de/?fs=${encodeURIComponent(q).replace(/%20/g, "+")}`;

const PARTS: (Omit<PartT, "listing" | "alternatives"> & { listing: VerifiedListing; alternatives?: VerifiedListing[] })[] = [
  {
    category: "cpu",
    name: "AMD Ryzen 7 7800X3D",
    specs: { socket: "AM5", tdp_w: 120, max_power_w: 162, has_igpu: true, includes_cooler: false },
    listing: L("Mindfactory", "https://www.mindfactory.de/search_result.php?search_query=7800X3D", 329),
    alternatives: [L("Alternate", "https://www.alternate.de/listing.xhtml?q=7800X3D", 339)],
    why: "The 3D V-Cache makes it one of the fastest gaming CPUs, and AM5 leaves room for future upgrades.",
  },
  {
    category: "motherboard",
    name: "MSI B650 Gaming Plus WiFi",
    specs: { socket: "AM5", chipset: "B650", form_factor: "ATX", memory_type: "DDR5", memory_slots: 4, max_memory_gb: 192, m2_slots: 2, wifi: true },
    listing: L("Caseking", "https://www.caseking.de/search?q=B650+Gaming+Plus+WiFi", 149),
    why: "Solid VRM for the 7800X3D, Wi-Fi 6E built in, two M.2 slots.",
  },
  {
    category: "ram",
    name: "Kingston FURY Beast 32 GB (2×16 GB) DDR5-6000 CL30",
    specs: { memory_type: "DDR5", capacity_gb: 32, modules: 2, speed_mts: 6000 },
    listing: L("Alternate", "https://www.alternate.de/listing.xhtml?q=FURY+Beast+DDR5-6000+32GB", 109),
    why: "DDR5-6000 CL30 is the sweet spot for Ryzen 7000.",
  },
  {
    category: "gpu",
    name: "MSI GeForce RTX 5070 Ventus 2X OC 12 GB",
    specs: { length_mm: 242, tdp_w: 250, recommended_psu_w: 650, power_connector: "12V-2x6" },
    listing: L("notebooksbilliger.de", "https://www.notebooksbilliger.de/produkte/rtx%205070", 569),
    alternatives: [
      L("Kleinanzeigen – private seller, 4 years on platform, pickup", "https://www.kleinanzeigen.de/s-rtx-5070/k0", 470, {
        condition: "used",
        shipping: "Pickup ~12 km away, test before paying",
        credibility: "medium",
        credibility_reason: "Private seller with long history and positive ratings; pickup lets you test the card first.",
        price_confirmed: false,
        link_status: "reachable",
      }),
    ],
    why: "Hits 1440p high-refresh in most games with DLSS 4 frame generation as a bonus.",
  },
  {
    category: "storage",
    name: "Kingston NV3 2 TB",
    specs: { interface: "M.2 NVMe PCIe 4.0", capacity_gb: 2000 },
    listing: L("Mindfactory", "https://www.mindfactory.de/search_result.php?search_query=Kingston+NV3+2TB", 112),
    why: "Plenty of space for a big game library at a low price per TB.",
  },
  {
    category: "psu",
    name: "be quiet! Pure Power 12 M 750W",
    specs: { wattage: 750, efficiency: "80+ Gold", psu_form_factor: "ATX", power_connector: "12V-2x6" },
    listing: L("Caseking", "https://www.caseking.de/search?q=Pure+Power+12+M+750W", 99),
    why: "Quiet, fully modular, native 12V-2x6 cable for the RTX 5070.",
  },
  {
    category: "case",
    name: "Lian Li Lancool 216",
    specs: { supported_form_factors: ["E-ATX", "ATX", "Micro-ATX", "Mini-ITX"], supported_psu: ["ATX"], max_gpu_length_mm: 392, max_cooler_height_mm: 180, max_radiator_mm: 360 },
    listing: L("Alternate", "https://www.alternate.de/listing.xhtml?q=Lancool+216", 95),
    why: "Excellent airflow with two 160 mm front fans included.",
  },
  {
    category: "cooler",
    name: "Thermalright Peerless Assassin 120 SE",
    specs: { cooler_type: "air", height_mm: 155, supported_sockets: ["AM4", "AM5", "LGA1700", "LGA1851"] },
    listing: L("Amazon.de (sold by Amazon)", "https://www.amazon.de/s?k=Peerless+Assassin+120+SE", 38, {
      credibility_reason: "Sold and shipped by Amazon itself, with Amazon's return policy.",
    }),
    why: "Dual-tower cooler that keeps the 7800X3D cool and quiet for very little money.",
  },
];

function demoResult(req: BuildRequest): FinalResult {
  const total = PARTS.reduce((n, p) => n + p.listing.price_in_user_currency, 0);
  return {
    overview:
      "You want smooth 1440p high-refresh gaming. The GPU sets the ceiling, so most of the budget goes to an RTX 5070, paired with the best gaming CPU in reach.",
    recommendation:
      "Go with the DIY build: for the same money you get twice the storage, a stronger PSU and a better cooler. If you'd rather not assemble it yourself, the Dubaro prebuilt is the best ready-made option.",
    builds: [
      {
        name: "Best value 1440p build",
        summary: "Ryzen 7 7800X3D + RTX 5070: high-refresh 1440p in esports titles and 90–120 FPS in demanding AAA games.",
        parts: PARTS,
        estimated_power_draw_w: 490,
        performance: [
          { game: "Cyberpunk 2077", resolution: "1440p", settings: "High, DLSS Quality", fps_low: 95, fps_high: 115, meets_target: false, basis: "Sample figure" },
          { game: "Counter-Strike 2", resolution: "1440p", settings: "High", fps_low: 350, fps_high: 450, meets_target: true, basis: "Sample figure" },
          { game: "Fortnite", resolution: "1440p", settings: "High, DLSS Quality", fps_low: 150, fps_high: 190, meets_target: true, basis: "Sample figure" },
        ],
        upgrade_path: "AM5 supports future Ryzen CPUs; the 750 W PSU has room for a bigger GPU later.",
        total,
        checks: checkCompatibility(PARTS, { wantsWifi: req.wifi, gaming: true }),
      },
    ],
    prebuilts: [
      {
        name: "Dubaro Gaming PC – Ryzen 7 7800X3D / RTX 5070",
        summary: "Same core components, professionally assembled with a 3-year warranty.",
        listing: L("dubaro.de", "https://www.dubaro.de/", 1499, {
          price_confirmed: false,
          credibility_reason: "Long-standing German system builder with public company details and warranty service.",
        }),
        specs: { cpu: "Ryzen 7 7800X3D", gpu: "RTX 5070 12 GB", ram: "32 GB DDR5-6000", storage: "1 TB NVMe", psu: "650 W 80+ Gold", os_included: false },
        warranty: "3 years",
        performance: [
          { game: "Cyberpunk 2077", resolution: "1440p", settings: "High, DLSS Quality", fps_low: 95, fps_high: 115, meets_target: false, basis: "Sample figure" },
        ],
        pros: ["Ready to use", "3-year warranty covers the whole system"],
        cons: ["Only 1 TB storage", "650 W PSU leaves less upgrade headroom"],
        total: 1499,
        checks: [],
      },
    ],
    extras: [],
    extrasTotal: 0,
    warnings: ["This is demo output with sample prices. Links open search pages instead of specific listings."],
    skipped_sources: [{ domain: "cheap-gpu-deals.example", reason: "RTX 5070 at 45% below market, no imprint, bank transfer only." }],
    currency: "EUR",
    budget: req.currency === "EUR" ? req.budget : 1500,
    targetFps: req.targetFps,
    generatedAt: new Date().toISOString(),
    demo: true,
  };
}

export async function runDemo(req: BuildRequest, emit: (e: AgentEvent) => void, signal: AbortSignal) {
  const script: [number, AgentEvent][] = [
    [300, { type: "status", message: "Demo mode – replaying a sample research run." }],
    [900, { type: "thinking", text: "1440p at 144 FPS in Cyberpunk and CS2 points to an RTX 5070 / RX 9070 class GPU. With a €1,500 budget, a 7800X3D-class CPU is affordable." }],
    [700, { type: "search", query: "RTX 5070 1440p benchmark Cyberpunk 2077 CS2" }],
    [900, { type: "results", count: 10, domains: ["techpowerup.com", "computerbase.de", "pcgameshardware.de", "tomshardware.com"] }],
    [600, { type: "search", query: "geizhals RTX 5070 Preisvergleich" }],
    [800, { type: "results", count: 8, domains: ["geizhals.de", "idealo.de", "mindfactory.de", "alternate.de"] }],
    [600, { type: "fetch", url: gz("rtx 5070") }],
    [900, { type: "fetched", url: gz("rtx 5070"), ok: true, title: "NVIDIA GeForce RTX 5070 Preisvergleich | Geizhals" }],
    [500, { type: "note", text: "Comparing CPU and motherboard prices next." }],
    [600, { type: "search", query: "Ryzen 7 7800X3D Preis mindfactory alternate" }],
    [800, { type: "results", count: 9, domains: ["mindfactory.de", "alternate.de", "geizhals.de"] }],
    [600, { type: "search", query: "RTX 5070 gebraucht kleinanzeigen" }],
    [800, { type: "results", count: 10, domains: ["kleinanzeigen.de", "ebay.de"] }],
    [700, { type: "thinking", text: "One listing offers an RTX 5070 at €310 from a shop with no imprint and bank-transfer-only payment – too good to be true, skipping it." }],
    [600, { type: "search", query: "Lian Li Lancool 216 max GPU length cooler height" }],
    [800, { type: "results", count: 7, domains: ["lian-li.com", "caseking.de"] }],
    [700, { type: "compat", checks: checkCompatibility(PARTS, { wantsWifi: req.wifi, gaming: true }) }],
    [600, { type: "search", query: "Dubaro Gaming PC 7800X3D RTX 5070" }],
    [800, { type: "results", count: 6, domains: ["dubaro.de", "geizhals.de"] }],
    [700, { type: "verifying", count: 11 }],
    [1400, { type: "usage", searches: 6, fetches: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 }],
  ];
  for (const [delay, event] of script) {
    await sleep(delay, signal);
    if (signal.aborted) return;
    emit(event);
  }
  emit({ type: "result", result: demoResult(req) });
}
