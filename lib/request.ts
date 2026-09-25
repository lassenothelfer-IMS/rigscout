import { z } from "zod";
import type { BuildRequest } from "./types";

// Server-side validation of the questionnaire. Free-text fields are length
// capped since they go straight into the prompt.

const text = (max: number) => z.string().max(max).default("");

export const BuildRequestSchema = z.object({
  useCases: z.array(z.enum(["gaming", "streaming", "video_editing", "3d_cad", "programming", "office", "ai_ml"])).max(7),
  games: z.array(z.string().min(1).max(60)).max(15),
  resolution: z.enum(["1080p", "1440p", "ultrawide", "4k"]),
  targetFps: z.number().int().min(30).max(500),
  graphicsQuality: z.enum(["low", "medium", "high", "ultra"]),
  rayTracing: z.boolean(),
  budget: z.number().min(100).max(1_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  budgetFlexible: z.boolean(),
  extras: z.array(z.enum(["os_license", "monitor", "keyboard_mouse", "headset"])).max(4),
  buildType: z.enum(["diy", "prebuilt", "both"]),
  condition: z.enum(["new_only", "refurb_ok", "used_except_critical", "used_ok"]),
  country: z.string().regex(/^[A-Z]{2}$/),
  city: text(80),
  postalCode: text(20),
  pickupOk: z.boolean(),
  pickupRadiusKm: z.number().min(1).max(500),
  cpuBrand: z.enum(["any", "amd", "intel"]),
  gpuBrand: z.enum(["any", "nvidia", "amd", "intel"]),
  size: z.enum(["any", "compact", "mid", "full"]),
  look: z.enum(["any", "rgb", "no_rgb", "white"]),
  quiet: z.boolean(),
  wifi: z.boolean(),
  existingParts: text(600),
  notes: text(1500),
}) satisfies z.ZodType<BuildRequest, unknown>;
