import { z } from "zod";
import type { CompatCheck, LinkStatus } from "./types";

// Schemas for the two client tools the agent calls. They double as runtime
// validation (the model's tool input is untrusted) and as the JSON Schema the
// model sees.

export const PC_CATEGORIES = [
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooler",
  "case_fans",
  "wifi_adapter",
  "other",
] as const;

export const EXTRA_CATEGORIES = ["os_license", "monitor", "keyboard", "mouse", "keyboard_mouse", "headset", "other"] as const;

export const Specs = z
  .object({
    socket: z.string().optional().describe("CPU / motherboard socket, e.g. AM5, AM4, LGA1851, LGA1700"),
    chipset: z.string().optional().describe("Motherboard chipset, e.g. B650, B860"),
    form_factor: z.string().optional().describe("Motherboard form factor: ATX, Micro-ATX, Mini-ITX, E-ATX"),
    memory_type: z.string().optional().describe("DDR4 or DDR5 (motherboard and RAM)"),
    memory_slots: z.number().optional().describe("Motherboard DIMM slots"),
    max_memory_gb: z.number().optional(),
    m2_slots: z.number().optional().describe("Motherboard M.2 NVMe slots"),
    wifi: z.boolean().optional().describe("Motherboard has built-in Wi-Fi"),
    tdp_w: z.number().optional().describe("CPU TDP, or GPU total board power, in watts"),
    max_power_w: z.number().optional().describe("CPU max package power (AMD PPT / Intel PL2) in watts"),
    has_igpu: z.boolean().optional().describe("CPU has integrated graphics"),
    includes_cooler: z.boolean().optional().describe("CPU ships with a stock cooler"),
    capacity_gb: z.number().optional().describe("RAM kit total or storage capacity in GB"),
    modules: z.number().optional().describe("RAM sticks in the kit"),
    speed_mts: z.number().optional().describe("RAM speed in MT/s"),
    length_mm: z.number().optional().describe("GPU card length in mm"),
    recommended_psu_w: z.number().optional().describe("GPU maker's recommended PSU wattage"),
    power_connector: z.string().optional().describe("GPU power connector(s), e.g. '12V-2x6', '2x 8-pin'"),
    interface: z.string().optional().describe("Storage interface: 'M.2 NVMe PCIe 4.0', 'SATA 2.5\"'"),
    wattage: z.number().optional().describe("PSU wattage"),
    efficiency: z.string().optional().describe("PSU rating, e.g. 80+ Gold"),
    psu_form_factor: z.string().optional().describe("PSU form factor: ATX, SFX, SFX-L"),
    supported_form_factors: z.array(z.string()).optional().describe("Case: motherboard form factors it fits"),
    supported_psu: z.array(z.string()).optional().describe("Case: PSU form factors it fits"),
    max_gpu_length_mm: z.number().optional(),
    max_cooler_height_mm: z.number().optional(),
    max_radiator_mm: z.number().optional().describe("Case: largest radiator it fits (e.g. 360)"),
    cooler_type: z.enum(["air", "aio"]).optional(),
    height_mm: z.number().optional().describe("Air cooler height"),
    radiator_mm: z.number().optional().describe("AIO radiator size, e.g. 240, 280, 360"),
    supported_sockets: z.array(z.string()).optional().describe("Cooler: sockets it supports"),
  })
  .describe("Only fill fields relevant to this part's category. Values must come from spec pages, not guesses.");

export const Listing = z.object({
  retailer: z.string().describe("Shop or marketplace name. For marketplaces include seller + feedback, e.g. 'eBay – seller techdeals (99.6%, 12k ratings)'"),
  url: z.string().describe("Exact product/listing URL you saw in search results or fetched. Never construct or guess URLs."),
  price: z.number().describe("Price in the listing's own currency, incl. VAT"),
  currency: z.string().describe("ISO 4217 code of the listing price"),
  price_in_user_currency: z.number().describe("Price converted to the customer's currency (same as price if identical)"),
  shipping: z.string().optional().describe("Shipping cost/time or pickup details, e.g. 'Free, 1–2 days' or 'Pickup in Winterthur (~15 km)'"),
  condition: z.enum(["new", "open_box", "refurbished", "used"]),
  availability: z.string().optional().describe("e.g. 'In stock', 'Ships in 5 days', 'Auction ends 28 Sep'"),
  price_confirmed: z.boolean().describe("true if you confirmed price and availability on the listing page itself (web_fetch), false if only from a search snippet / price-comparison site"),
  credibility: z.enum(["high", "medium", "low"]),
  credibility_reason: z.string().describe("One sentence: why this seller is (or isn't) trustworthy"),
});

export const Part = z.object({
  category: z.enum(PC_CATEGORIES),
  name: z.string().describe("Full product name incl. brand and model"),
  specs: Specs,
  owned: z.boolean().optional().describe("true only for parts the customer already owns and reuses; then omit listing"),
  listing: Listing.optional().describe("Required unless owned is true"),
  alternatives: z.array(Listing).optional().describe("Other credible offers for the same (or equivalent) part"),
  why: z.string().describe("One or two sentences on why this part was chosen"),
});

export const ExtraItem = z.object({
  category: z.enum(EXTRA_CATEGORIES),
  name: z.string(),
  listing: Listing,
  why: z.string(),
});

export const Performance = z.object({
  game: z.string(),
  resolution: z.string(),
  settings: z.string().describe("e.g. 'High, DLSS Quality', 'Competitive low'"),
  fps_low: z.number().describe("Lower end of expected average FPS"),
  fps_high: z.number().describe("Upper end of expected average FPS"),
  meets_target: z.boolean(),
  basis: z.string().describe("What the estimate is based on, e.g. 'TechPowerUp RTX 5070 review, 1440p High' or 'Extrapolated from similar GPUs'"),
});

export const Build = z.object({
  name: z.string().describe("Short label, e.g. 'Best value 1440p build' or 'Used-parts budget build'"),
  summary: z.string(),
  parts: z.array(Part),
  estimated_power_draw_w: z.number().describe("Estimated peak system draw in watts"),
  performance: z.array(Performance),
  upgrade_path: z.string().optional(),
});

export const Prebuilt = z.object({
  name: z.string(),
  summary: z.string(),
  listing: Listing,
  specs: z.object({
    cpu: z.string(),
    gpu: z.string(),
    ram: z.string(),
    storage: z.string(),
    psu: z.string().optional(),
    motherboard: z.string().optional(),
    cooling: z.string().optional(),
    os_included: z.boolean().optional(),
  }),
  warranty: z.string().optional(),
  performance: z.array(Performance),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const CheckCompatibilityInput = z.object({
  parts: z
    .array(
      z.object({
        category: z.enum(PC_CATEGORIES),
        name: z.string(),
        specs: Specs,
      }),
    )
    .describe("The full candidate parts list for ONE build"),
});

export const SubmitInput = z.object({
  overview: z.string().describe("2–4 sentences: what the customer needs and how you approached it"),
  recommendation: z.string().describe("Which option you'd pick for this customer and why (2–3 sentences)"),
  builds: z.array(Build).describe("DIY builds (1–2). Empty if the customer only wants prebuilts."),
  prebuilts: z.array(Prebuilt).describe("Prebuilt PCs (2–4). Empty if the customer only wants DIY."),
  extras: z.array(ExtraItem).describe("Items the customer asked for on top of the PC (OS licence, monitor, …). Empty if none."),
  warnings: z.array(z.string()).describe("Caveats the customer must know (e.g. target FPS not reachable in budget, BIOS update needed, auction timing)"),
  skipped_sources: z
    .array(z.object({ domain: z.string(), reason: z.string() }))
    .describe("Sites/sellers you found but deliberately did not use because they didn't look credible"),
});

export type SpecsT = z.infer<typeof Specs>;
export type ListingT = z.infer<typeof Listing>;
export type PartT = z.infer<typeof Part>;
export type BuildT = z.infer<typeof Build>;
export type PrebuiltT = z.infer<typeof Prebuilt>;
export type ExtraT = z.infer<typeof ExtraItem>;
export type SubmitT = z.infer<typeof SubmitInput>;

// ---- Enriched result sent to the browser ------------------------------------

export type SourceType = "retailer" | "marketplace" | "manufacturer" | "unknown";

export type VerifiedListing = ListingT & { link_status: LinkStatus; source_type: SourceType; domain: string };

export type FinalPart = Omit<PartT, "listing" | "alternatives"> & {
  listing?: VerifiedListing;
  alternatives?: VerifiedListing[];
};

export type FinalBuild = Omit<BuildT, "parts"> & {
  parts: FinalPart[];
  total: number;
  checks: CompatCheck[];
};

export type FinalPrebuilt = Omit<PrebuiltT, "listing"> & {
  listing: VerifiedListing;
  total: number;
  checks: CompatCheck[];
};

export type FinalExtra = Omit<ExtraT, "listing"> & { listing: VerifiedListing };

export interface FinalResult {
  overview: string;
  recommendation: string;
  builds: FinalBuild[];
  prebuilts: FinalPrebuilt[];
  extras: FinalExtra[];
  extrasTotal: number;
  warnings: string[];
  skipped_sources: { domain: string; reason: string }[];
  currency: string;
  budget: number;
  targetFps?: number;
  generatedAt: string;
  demo?: boolean;
}

/** JSON Schema for a tool's input_schema, generated from the zod schema. */
export function toInputSchema(schema: z.ZodType): { type: "object"; [k: string]: unknown } {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json as { type: "object"; [k: string]: unknown };
}
