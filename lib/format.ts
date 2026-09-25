export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? u.pathname.slice(0, 38) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + (path === "/" ? "" : path);
  } catch {
    return url;
  }
}
