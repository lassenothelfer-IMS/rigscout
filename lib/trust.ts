import { REGIONS } from "./regions";
import type { SourceType } from "./schema";

// A second, deterministic opinion next to the agent's own credibility rating.
// Domains here only label a listing in the UI ("Known retailer", ...); the
// agent may still use shops that aren't listed if it judges them credible.

/** Never searched or fetched. High counterfeit / non-delivery risk for PC hardware. */
export const BLOCKED_DOMAINS = ["wish.com", "temu.com", "dhgate.com", "joom.com"];

const MARKETPLACE_PATTERNS = [
  /(^|\.)ebay\.[a-z.]+$/,
  /(^|\.)kleinanzeigen\.de$/,
  /(^|\.)ricardo\.ch$/,
  /(^|\.)tutti\.ch$/,
  /(^|\.)anibis\.ch$/,
  /(^|\.)willhaben\.at$/,
  /(^|\.)marktplaats\.nl$/,
  /(^|\.)2dehands\.be$/,
  /(^|\.)2ememain\.be$/,
  /(^|\.)leboncoin\.fr$/,
  /(^|\.)subito\.it$/,
  /(^|\.)wallapop\.com$/,
  /(^|\.)blocket\.se$/,
  /(^|\.)tradera\.com$/,
  /(^|\.)finn\.no$/,
  /(^|\.)dba\.dk$/,
  /(^|\.)olx\.[a-z.]+$/,
  /(^|\.)allegro\.pl$/,
  /(^|\.)gumtree\.[a-z.]+$/,
  /(^|\.)kijiji\.ca$/,
  /(^|\.)craigslist\.org$/,
  /(^|\.)facebook\.com$/,
  /(^|\.)reddit\.com$/,
  /(^|\.)trademe\.co\.nz$/,
  /(^|\.)backmarket\.[a-z.]+$/,
  /(^|\.)tweakers\.net$/,
];

const MANUFACTURERS = [
  "nzxt.com", "corsair.com", "msi.com", "asus.com", "gigabyte.com", "lenovo.com", "hp.com", "dell.com",
  "alienware.com", "bequiet.com", "nvidia.com", "amd.com", "intel.com", "fractal-design.com", "lian-li.com",
  "maingear.com", "ibuypower.com", "cyberpowerpc.com", "originpc.com", "starforgesystems.com",
  "pcspecialist.co.uk", "chillblast.com", "dubaro.de", "one.de", "memorypc.de", "agando.de", "zotac.com", "sapphiretech.com",
];

const RETAILERS = new Set<string>([
  ...REGIONS.flatMap((r) => r.retailers.map((d) => d.split("/")[0])),
  "amazon.com", "amazon.de", "amazon.co.uk", "amazon.fr", "amazon.it", "amazon.es", "amazon.nl", "amazon.ca",
  "amazon.com.au", "amazon.in", "amazon.com.be", "uk.webuy.com", "webuy.com", "rebuy.de",
  "geizhals.de", "geizhals.at", "idealo.de", "toppreise.ch", "pcpartpicker.com",
]);

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const matchesDomain = (host: string, d: string) => host === d || host.endsWith("." + d);

export function isBlocked(url: string): boolean {
  const host = domainOf(url);
  return BLOCKED_DOMAINS.some((d) => matchesDomain(host, d));
}

export function sourceType(url: string): SourceType {
  const host = domainOf(url);
  if (!host) return "unknown";
  if (MARKETPLACE_PATTERNS.some((re) => re.test(host))) return "marketplace";
  if (MANUFACTURERS.some((d) => matchesDomain(host, d))) return "manufacturer";
  for (const d of RETAILERS) if (matchesDomain(host, d)) return "retailer";
  return "unknown";
}

/** Canonical form for comparing URLs: no hash, no tracking params, no trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_|tag$|gclid|fbclid|mkcid|mkrid|campid|toolid|customid|_trk)/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    const s = u.toString();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  } catch {
    return url.trim();
  }
}
