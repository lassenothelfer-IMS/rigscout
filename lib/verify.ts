import { isIP } from "node:net";
import type { LinkStatus } from "./types";
import { normalizeUrl } from "./trust";

// Live link checks for every recommended listing. URLs ultimately come from
// web pages, so they're untrusted: only public http(s) hosts are fetched.

const ENDED_PHRASES = [
  "this listing has ended",
  "this listing was ended",
  "the seller has ended this listing",
  "dieses angebot wurde beendet",
  "angebot wurde vom verkäufer beendet",
  "die gewünschte anzeige ist nicht mehr verfügbar",
  "cette annonce n'est plus disponible",
  "dieses inserat ist nicht mehr verfügbar",
];

function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") return false;
  if (isIP(host)) return false; // retailers don't link to raw IPs
  return true;
}

async function liveCheck(url: string): Promise<"ok" | "ended" | "broken" | "blocked"> {
  if (!isPublicHttpUrl(url)) return "broken";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RigScout/1.0; +link-check)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en,de;q=0.8,fr;q=0.6",
      },
    });
    if (res.status === 404 || res.status === 410) return "broken";
    if (!res.ok) return "blocked"; // 403 / 429 / 5xx: bot protection, can't tell
    const reader = res.body?.getReader();
    if (!reader) return "ok";
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 400_000) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => {});
    const lower = html.toLowerCase();
    return ENDED_PHRASES.some((p) => lower.includes(p)) ? "ended" : "ok";
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    return code === "ENOTFOUND" ? "broken" : "blocked";
  }
}

export async function verifyLinks(urls: string[], seen: Set<string>): Promise<Map<string, LinkStatus>> {
  const unique = [...new Set(urls)];
  const out = new Map<string, LinkStatus>();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      const live = await liveCheck(url);
      const wasSeen = seen.has(normalizeUrl(url));
      out.set(
        url,
        live === "broken" ? "broken" : live === "ended" ? "ended" : wasSeen ? "seen" : live === "ok" ? "reachable" : "unverified",
      );
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}
