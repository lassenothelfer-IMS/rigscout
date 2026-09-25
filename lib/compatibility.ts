import type { CompatCheck } from "./types";
import type { SpecsT } from "./schema";

// Deterministic compatibility rules. The agent must pass these before its
// recommendation is accepted, so a hallucinated "these fit together" can't
// reach the customer. Rules only fire when the relevant specs are present;
// missing critical specs are themselves a failure so the agent has to look
// them up.

export interface CompatPart {
  category: string;
  name: string;
  specs: SpecsT;
}

/** "Socket AM5" -> AM5, "FCLGA 1700" -> LGA1700, "LGA1151" -> LGA115X */
export function normSocket(s?: string): string {
  const u = (s ?? "").toUpperCase().replace(/[\s_-]/g, "");
  const n = u.match(/LGA\d{4}|AM\d|STR\dX?|SP\d|TR\d/)?.[0] ?? u.replace(/SOCKET/g, "");
  if (/^LGA115[0-6]$/.test(n)) return "LGA115X";
  return n;
}

// Coolers use the same mounting within these groups.
const MOUNT_GROUPS = [["AM4", "AM5"], ["LGA1700", "LGA1851"], ["LGA1200", "LGA115X"]];

function coolerFitsSocket(supported: string[], socket: string): "yes" | "mount-compatible" | "no" {
  const s = supported.map(normSocket);
  if (s.includes(socket)) return "yes";
  const group = MOUNT_GROUPS.find((g) => g.includes(socket));
  if (group && s.some((x) => group.includes(x))) return "mount-compatible";
  return "no";
}

// Which DDR generation each CPU platform supports.
const SOCKET_MEMORY: Record<string, string[]> = {
  AM5: ["DDR5"],
  AM4: ["DDR4"],
  LGA1851: ["DDR5"],
  LGA1700: ["DDR4", "DDR5"],
  LGA1200: ["DDR4"],
};

const normMem = (s?: string) => (s ?? "").toUpperCase().match(/DDR\d/)?.[0] ?? "";

// Motherboard form factor size ranks; a case that fits rank N fits everything below it.
function formRank(s: string): number {
  const n = s.toUpperCase().replace(/[\s\-µ]/g, "");
  if (/EATX|EXTENDED/.test(n)) return 4;
  if (/MINIITX|^ITX/.test(n)) return 1;
  if (/MICROATX|MATX|UATX/.test(n)) return 2;
  if (/MINIDTX/.test(n)) return 1.5;
  if (/ATX/.test(n)) return 3;
  return 0;
}

const isNvme = (s?: string) => /M\.?2|NVME|PCIE/i.test(s ?? "");

export function checkCompatibility(
  parts: CompatPart[],
  opts: { wantsWifi?: boolean; gaming?: boolean } = {},
): CompatCheck[] {
  const out: CompatCheck[] = [];
  const pass = (rule: string, message: string) => out.push({ status: "pass", rule, message });
  const warn = (rule: string, message: string) => out.push({ status: "warn", rule, message });
  const fail = (rule: string, message: string) => out.push({ status: "fail", rule, message });

  const one = (cat: string) => parts.find((p) => p.category === cat);
  const all = (cat: string) => parts.filter((p) => p.category === cat);

  const cpu = one("cpu");
  const mobo = one("motherboard");
  const rams = all("ram");
  const gpu = one("gpu");
  const psu = one("psu");
  const pcCase = one("case");
  const cooler = one("cooler");
  const storage = all("storage");

  // --- Required parts --------------------------------------------------------
  for (const [cat, label] of [
    ["cpu", "CPU"],
    ["motherboard", "motherboard"],
    ["ram", "RAM"],
    ["storage", "storage drive"],
    ["psu", "power supply"],
    ["case", "case"],
  ] as const) {
    if (!parts.some((p) => p.category === cat)) fail("Complete build", `No ${label} in the build.`);
  }

  // --- Missing critical specs ------------------------------------------------
  const need = (p: CompatPart | undefined, field: keyof SpecsT, label: string) => {
    if (p && (p.specs[field] === undefined || p.specs[field] === null || p.specs[field] === "")) {
      fail("Specs known", `${p.name}: ${label} is unknown – look it up on a spec page and include it.`);
      return false;
    }
    return !!p;
  };
  need(cpu, "socket", "socket");
  need(mobo, "socket", "socket");
  need(mobo, "form_factor", "form factor");
  need(mobo, "memory_type", "memory type (DDR4/DDR5)");
  rams.forEach((r) => need(r, "memory_type", "memory type (DDR4/DDR5)"));
  need(psu, "wattage", "wattage");
  need(gpu, "length_mm", "card length");
  need(gpu, "tdp_w", "board power");
  need(pcCase, "supported_form_factors", "supported motherboard sizes");
  need(pcCase, "max_gpu_length_mm", "max GPU length");
  if (cooler) {
    need(cooler, "supported_sockets", "supported sockets");
    need(cooler, "cooler_type", "type (air/AIO)");
  }

  // --- CPU <-> motherboard ---------------------------------------------------
  const cpuSocket = normSocket(cpu?.specs.socket);
  const moboSocket = normSocket(mobo?.specs.socket);
  if (cpuSocket && moboSocket) {
    if (cpuSocket === moboSocket) pass("CPU socket", `${cpu!.name} (${cpu!.specs.socket}) fits ${mobo!.name}.`);
    else fail("CPU socket", `${cpu!.name} is ${cpu!.specs.socket} but ${mobo!.name} is ${mobo!.specs.socket}.`);
  }

  // --- Memory ----------------------------------------------------------------
  const moboMem = normMem(mobo?.specs.memory_type);
  if (moboMem && cpuSocket && SOCKET_MEMORY[cpuSocket] && !SOCKET_MEMORY[cpuSocket].includes(moboMem)) {
    fail("Memory generation", `${cpuSocket} platforms don't support ${moboMem}.`);
  }
  for (const ram of rams) {
    const ramMem = normMem(ram.specs.memory_type);
    if (!ramMem || !moboMem) continue;
    if (ramMem === moboMem) pass("RAM type", `${ram.name} is ${ramMem}, matching the motherboard.`);
    else fail("RAM type", `${ram.name} is ${ramMem} but the motherboard takes ${moboMem}.`);
  }
  if (rams.length && mobo) {
    const sticks = rams.reduce((n, r) => n + (r.specs.modules ?? 2), 0);
    const slots = mobo.specs.memory_slots ?? (formRank(mobo.specs.form_factor ?? "") <= 1 ? 2 : 4);
    if (sticks > slots) fail("RAM slots", `${sticks} RAM sticks but the motherboard has ${slots} slots.`);
    const gb = rams.reduce((n, r) => n + (r.specs.capacity_gb ?? 0), 0);
    if (mobo.specs.max_memory_gb && gb > mobo.specs.max_memory_gb) {
      fail("RAM capacity", `${gb} GB exceeds the board's ${mobo.specs.max_memory_gb} GB maximum.`);
    }
  }

  // --- Case fit --------------------------------------------------------------
  if (mobo?.specs.form_factor && pcCase?.specs.supported_form_factors?.length) {
    const boardRank = formRank(mobo.specs.form_factor);
    const caseRank = Math.max(...pcCase.specs.supported_form_factors.map(formRank));
    if (boardRank && caseRank) {
      if (boardRank <= caseRank) pass("Motherboard fits case", `${mobo.specs.form_factor} board fits ${pcCase.name}.`);
      else fail("Motherboard fits case", `${mobo.specs.form_factor} board doesn't fit ${pcCase.name} (max ${pcCase.specs.supported_form_factors.join("/")}).`);
    }
  }
  if (gpu?.specs.length_mm && pcCase?.specs.max_gpu_length_mm) {
    const room = pcCase.specs.max_gpu_length_mm - gpu.specs.length_mm;
    if (room < 0) fail("GPU clearance", `${gpu.name} is ${gpu.specs.length_mm} mm; ${pcCase.name} fits ${pcCase.specs.max_gpu_length_mm} mm.`);
    else if (room < 10) warn("GPU clearance", `Only ${room} mm spare for the GPU – tight, check front fans/radiator.`);
    else pass("GPU clearance", `${gpu.specs.length_mm} mm GPU in a case that fits ${pcCase.specs.max_gpu_length_mm} mm.`);
  }

  // --- Cooling ---------------------------------------------------------------
  if (!cooler && cpu) {
    if (cpu.specs.includes_cooler === false) fail("CPU cooler", `${cpu.name} ships without a cooler – add one.`);
    else if (cpu.specs.includes_cooler === undefined) warn("CPU cooler", `No cooler listed; confirm ${cpu.name} includes one.`);
    else pass("CPU cooler", `Using the stock cooler that ships with ${cpu.name}.`);
  }
  if (cooler && cpuSocket && cooler.specs.supported_sockets?.length) {
    const fit = coolerFitsSocket(cooler.specs.supported_sockets, cpuSocket);
    if (fit === "yes") pass("Cooler socket", `${cooler.name} supports ${cpuSocket}.`);
    else if (fit === "mount-compatible") warn("Cooler socket", `${cooler.name} doesn't list ${cpuSocket}, but uses the same mounting – confirm with the maker.`);
    else fail("Cooler socket", `${cooler.name} doesn't support ${cpuSocket}.`);
  }
  if (cooler?.specs.cooler_type === "air" && pcCase) {
    const h = cooler.specs.height_mm;
    const max = pcCase.specs.max_cooler_height_mm;
    if (!h) warn("Cooler clearance", `${cooler.name}: height unknown.`);
    else if (!max) warn("Cooler clearance", `${pcCase.name}: max cooler height unknown.`);
    else if (h > max) fail("Cooler clearance", `${cooler.name} is ${h} mm tall; ${pcCase.name} fits ${max} mm.`);
    else if (max - h < 3) warn("Cooler clearance", `Only ${max - h} mm spare above the cooler.`);
    else pass("Cooler clearance", `${h} mm cooler, case fits ${max} mm.`);
  }
  if (cooler?.specs.cooler_type === "aio" && cooler.specs.radiator_mm && pcCase?.specs.max_radiator_mm) {
    if (cooler.specs.radiator_mm > pcCase.specs.max_radiator_mm) {
      fail("Radiator fit", `${cooler.specs.radiator_mm} mm radiator; ${pcCase.name} fits up to ${pcCase.specs.max_radiator_mm} mm.`);
    } else pass("Radiator fit", `${cooler.specs.radiator_mm} mm radiator fits.`);
  }

  // --- Power -----------------------------------------------------------------
  const cpuPower = cpu?.specs.max_power_w ?? (cpu?.specs.tdp_w ? Math.round(cpu.specs.tdp_w * 1.35) : 0);
  const gpuPower = gpu?.specs.tdp_w ?? 0;
  const draw = cpuPower + gpuPower + 80; // board, RAM, drives, fans
  if (psu?.specs.wattage && (cpuPower || gpuPower)) {
    const w = psu.specs.wattage;
    const recommended = Math.max(Math.ceil((draw * 1.3) / 50) * 50, gpu?.specs.recommended_psu_w ?? 0);
    if (w < draw * 1.1) fail("PSU wattage", `${w} W is too close to the ~${draw} W peak draw – need at least ${recommended} W.`);
    else if (w < recommended) warn("PSU wattage", `${w} W works for ~${draw} W peak, but ${recommended} W is recommended for headroom.`);
    else pass("PSU wattage", `${w} W for ~${draw} W peak draw.`);
  }
  if (psu?.specs.psu_form_factor && pcCase?.specs.supported_psu?.length) {
    const p = psu.specs.psu_form_factor.toUpperCase().replace(/\s/g, "");
    const ok = pcCase.specs.supported_psu.map((s) => s.toUpperCase().replace(/\s/g, ""));
    // ATX cases generally take SFX with a bracket; the reverse doesn't work.
    if (ok.includes(p) || (p.startsWith("SFX") && ok.includes("ATX"))) pass("PSU fits case", `${psu.specs.psu_form_factor} PSU fits.`);
    else fail("PSU fits case", `${pcCase.name} takes ${pcCase.specs.supported_psu.join("/")}, not ${psu.specs.psu_form_factor}.`);
  }

  // --- Display output / GPU --------------------------------------------------
  if (!gpu && cpu) {
    if (cpu.specs.has_igpu === false) fail("Display output", `${cpu.name} has no integrated graphics and there is no GPU.`);
    else if (opts.gaming) warn("Display output", "No dedicated GPU – gaming performance will be very limited.");
  }

  // --- Storage ---------------------------------------------------------------
  const m2 = storage.filter((s) => isNvme(s.specs.interface)).length;
  if (mobo?.specs.m2_slots !== undefined && m2 > mobo.specs.m2_slots) {
    fail("M.2 slots", `${m2} M.2 drives but the board has ${mobo.specs.m2_slots} M.2 slots.`);
  }

  // --- Wi-Fi -----------------------------------------------------------------
  if (opts.wantsWifi && mobo && mobo.specs.wifi === false && !parts.some((p) => p.category === "wifi_adapter")) {
    warn("Wi-Fi", "Customer wants Wi-Fi but the board has none and no adapter is included.");
  }

  return out;
}

export const hasFailures = (checks: CompatCheck[]) => checks.some((c) => c.status === "fail");
