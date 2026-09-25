// Shared types between the questionnaire UI, the API route and the agent.

export type UseCase =
  | "gaming"
  | "streaming"
  | "video_editing"
  | "3d_cad"
  | "programming"
  | "office"
  | "ai_ml";

export type Resolution = "1080p" | "1440p" | "ultrawide" | "4k";
export type GraphicsQuality = "low" | "medium" | "high" | "ultra";
export type BuildType = "diy" | "prebuilt" | "both";

/**
 * new_only             – only new items
 * refurb_ok            – new, refurbished or open-box
 * used_except_critical – used is fine, except PSU and storage (those wear out / fail silently)
 * used_ok              – anything goes as long as the seller is credible
 */
export type ConditionPolicy = "new_only" | "refurb_ok" | "used_except_critical" | "used_ok";

export type Extra = "os_license" | "monitor" | "keyboard_mouse" | "headset";

export interface BuildRequest {
  useCases: UseCase[];
  games: string[];
  resolution: Resolution;
  targetFps: number;
  graphicsQuality: GraphicsQuality;
  rayTracing: boolean;

  budget: number;
  currency: string; // ISO 4217
  budgetFlexible: boolean; // may exceed by up to 10%
  extras: Extra[]; // bought within the same budget

  buildType: BuildType;
  condition: ConditionPolicy;

  country: string; // ISO 3166-1 alpha-2
  city: string;
  postalCode: string;
  pickupOk: boolean;
  pickupRadiusKm: number;

  cpuBrand: "any" | "amd" | "intel";
  gpuBrand: "any" | "nvidia" | "amd" | "intel";
  size: "any" | "compact" | "mid" | "full";
  look: "any" | "rgb" | "no_rgb" | "white";
  quiet: boolean;
  wifi: boolean;

  existingParts: string;
  notes: string;
}

export const DEFAULT_REQUEST: BuildRequest = {
  useCases: ["gaming"],
  games: [],
  resolution: "1440p",
  targetFps: 144,
  graphicsQuality: "high",
  rayTracing: false,
  budget: 1500,
  currency: "EUR",
  budgetFlexible: false,
  extras: [],
  buildType: "both",
  condition: "refurb_ok",
  country: "DE",
  city: "",
  postalCode: "",
  pickupOk: false,
  pickupRadiusKm: 30,
  cpuBrand: "any",
  gpuBrand: "any",
  size: "any",
  look: "any",
  quiet: false,
  wifi: true,
  existingParts: "",
  notes: "",
};

// ---- Compatibility ----------------------------------------------------------

export type CheckStatus = "pass" | "warn" | "fail";

export interface CompatCheck {
  status: CheckStatus;
  rule: string;
  message: string;
}

// ---- Link verification ------------------------------------------------------

/**
 * seen        – URL appeared in the agent's own search / fetch results
 * reachable   – not seen, but it loads (HTTP 2xx)
 * unverified  – site blocks automated checks (403/429/5xx) and it wasn't seen
 * ended       – page loads but says the listing ended / is sold out
 * broken      – 404/410 or DNS failure
 */
export type LinkStatus = "seen" | "reachable" | "unverified" | "ended" | "broken";

// ---- Streaming events (server -> browser) -----------------------------------

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string }
  | { type: "results"; count: number; domains: string[] }
  | { type: "fetch"; url: string }
  | { type: "fetched"; url: string; ok: boolean; title?: string }
  | { type: "thinking"; text: string }
  | { type: "note"; text: string }
  | { type: "compat"; checks: CompatCheck[] }
  | { type: "rejected"; problems: string[] }
  | { type: "verifying"; count: number }
  | { type: "result"; result: import("./schema").FinalResult }
  | { type: "usage"; searches: number; fetches: number; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: "error"; message: string; code?: "no_api_key" | "access_denied" | "api_error" | "aborted" | "incomplete" }
  | { type: "done" };
