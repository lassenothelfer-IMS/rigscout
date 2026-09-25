"use client";

import { useState } from "react";
import type { AgentEvent, CompatCheck } from "@/lib/types";
import type { FinalBuild, FinalPart, FinalPrebuilt, FinalResult, VerifiedListing } from "@/lib/schema";
import { money } from "@/lib/format";
import { FeedLog, researchStats } from "./Research";
import { Badge, Button, Icon, cx } from "./ui";

const CATEGORY_LABEL: Record<string, string> = {
  cpu: "CPU",
  motherboard: "Motherboard",
  ram: "Memory",
  gpu: "Graphics",
  storage: "Storage",
  psu: "Power supply",
  case: "Case",
  cooler: "CPU cooler",
  case_fans: "Fans",
  wifi_adapter: "Wi-Fi",
  other: "Other",
  os_license: "OS licence",
  monitor: "Monitor",
  keyboard: "Keyboard",
  mouse: "Mouse",
  keyboard_mouse: "Keyboard & mouse",
  headset: "Headset",
};

function specChips(p: FinalPart): string[] {
  const s = p.specs;
  const out: unknown[] = [];
  switch (p.category) {
    case "cpu":
      out.push(s.socket, s.tdp_w && `${s.tdp_w} W`, s.includes_cooler && "cooler incl.");
      break;
    case "motherboard":
      out.push(s.socket, s.chipset, s.form_factor, s.memory_type, s.wifi && "Wi-Fi");
      break;
    case "ram":
      out.push(s.capacity_gb && `${s.capacity_gb} GB`, s.modules && `${s.modules}×`, s.memory_type, s.speed_mts && `${s.speed_mts} MT/s`);
      break;
    case "gpu":
      out.push(s.length_mm && `${s.length_mm} mm`, s.tdp_w && `${s.tdp_w} W`);
      break;
    case "storage":
      out.push(s.capacity_gb && (s.capacity_gb >= 1000 ? `${s.capacity_gb / 1000} TB` : `${s.capacity_gb} GB`), s.interface);
      break;
    case "psu":
      out.push(s.wattage && `${s.wattage} W`, s.efficiency, s.psu_form_factor);
      break;
    case "case":
      out.push(s.max_gpu_length_mm && `GPU ≤ ${s.max_gpu_length_mm} mm`, s.max_cooler_height_mm && `cooler ≤ ${s.max_cooler_height_mm} mm`);
      break;
    case "cooler":
      out.push(s.cooler_type === "aio" ? `${s.radiator_mm ?? ""} mm AIO` : s.height_mm && `${s.height_mm} mm air`);
      break;
  }
  return out.filter((x): x is string => typeof x === "string" && x.length > 0);
}

const LINK_BADGE: Record<VerifiedListing["link_status"], { tone: "good" | "warn" | "bad" | "neutral"; label: string; title: string }> = {
  seen: { tone: "good", label: "Link verified", title: "RigScout found this exact page during research and it still loads." },
  reachable: { tone: "good", label: "Link works", title: "The page loads, but it didn't come directly from search results." },
  unverified: { tone: "neutral", label: "Not auto-checked", title: "The shop blocks automated checks. Open it to confirm." },
  ended: { tone: "bad", label: "Listing ended", title: "The page says this listing has ended." },
  broken: { tone: "bad", label: "Dead link", title: "The page couldn't be found." },
};

const SOURCE_LABEL: Record<VerifiedListing["source_type"], string> = {
  retailer: "Known retailer",
  marketplace: "Marketplace",
  manufacturer: "Official store",
  unknown: "Independent shop",
};

function ListingBlock({ l, currency, compact }: { l: VerifiedListing; currency: string; compact?: boolean }) {
  const link = LINK_BADGE[l.link_status];
  const foreign = l.currency !== currency;
  return (
    <div className={cx("space-y-1.5", compact ? "" : "sm:text-right")}>
      <div className={cx("flex items-baseline gap-2", compact ? "" : "sm:justify-end")}>
        <span className="text-base font-semibold tabular-nums">{money(l.price_in_user_currency, currency)}</span>
        {foreign && <span className="text-xs text-muted">({money(l.price, l.currency)})</span>}
      </div>
      <a
        href={l.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={cx("inline-flex max-w-full items-center gap-1 text-sm font-medium text-accent hover:underline", compact ? "" : "sm:justify-end")}
      >
        <span className="truncate">{l.retailer}</span>
        <Icon name="link" className="size-3.5 shrink-0" />
      </a>
      <div className={cx("flex flex-wrap gap-1", compact ? "" : "sm:justify-end")}>
        {l.condition !== "new" && <Badge tone="accent">{l.condition === "open_box" ? "Open box" : l.condition === "refurbished" ? "Refurbished" : "Used"}</Badge>}
        <Badge tone={l.credibility === "high" ? "good" : l.credibility === "medium" ? "warn" : "bad"} title={l.credibility_reason}>
          <Icon name="shield" className="size-3" />
          {l.credibility === "high" ? "Trusted" : l.credibility === "medium" ? "Check seller" : "Low trust"} · {SOURCE_LABEL[l.source_type]}
        </Badge>
        <Badge tone={link.tone} title={link.title}>
          {link.label}
        </Badge>
        {!l.price_confirmed && <Badge title="Price came from a search snippet or price-comparison site, not the product page.">Price unconfirmed</Badge>}
      </div>
      {(l.shipping || l.availability) && (
        <p className="text-xs text-muted">{[l.availability, l.shipping].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  );
}

function PartRow({ part, currency }: { part: FinalPart; currency: string }) {
  const [open, setOpen] = useState(false);
  const chips = specChips(part);
  const alts = part.alternatives ?? [];
  return (
    <li className="py-4">
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr_15rem]">
        <div className="text-xs font-medium uppercase tracking-wider text-muted sm:pt-1">{CATEGORY_LABEL[part.category] ?? part.category}</div>
        <div className="min-w-0">
          <div className="font-medium">{part.name}</div>
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span key={c} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  {c}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-sm text-muted">{part.why}</p>
          {alts.length > 0 && (
            <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-xs font-medium text-accent hover:underline">
              {open ? "Hide" : "Show"} {alts.length} other offer{alts.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
        <div>{part.owned ? <Badge tone="accent">You already own this</Badge> : part.listing ? <ListingBlock l={part.listing} currency={currency} /> : null}</div>
      </div>
      {open && (
        <ul className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3 sm:ml-[7.75rem]">
          {alts.map((a, i) => (
            <li key={i}>
              <ListingBlock l={a} currency={currency} compact />
              <p className="mt-1 text-xs text-muted">{a.credibility_reason}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function BudgetMeter({ total, budget, currency }: { total: number; budget: number; currency: string }) {
  const pct = Math.min(100, (total / budget) * 100);
  const over = total > budget;
  return (
    <div className="w-full sm:w-56">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums">{money(total, currency)}</span>
        <span className={cx("text-xs", over ? "text-warn" : "text-muted")}>
          {over ? `${money(total - budget, currency)} over` : `${money(budget - total, currency)} left`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cx("h-full rounded-full", over ? "bg-warn" : "bg-good")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-right text-[11px] text-muted">of {money(budget, currency)} budget</div>
    </div>
  );
}

function Checks({ checks }: { checks: CompatCheck[] }) {
  const [open, setOpen] = useState(false);
  if (!checks.length) return null;
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const passes = checks.filter((c) => c.status === "pass").length;
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className={fails ? "text-bad" : "text-good"}>
            <Icon name={fails ? "alert" : "check"} />
          </span>
          Compatibility: {passes} checks passed
          {warns > 0 && <span className="font-normal text-warn">· {warns} note{warns > 1 ? "s" : ""}</span>}
          {fails > 0 && <span className="font-normal text-bad">· {fails} unresolved</span>}
        </span>
        <Icon name="chevron" className={cx("size-4 text-muted transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-border px-4 py-3">
          {checks.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className={cx("mt-0.5 shrink-0", c.status === "pass" ? "text-good" : c.status === "warn" ? "text-warn" : "text-bad")}>
                <Icon name={c.status === "pass" ? "check" : c.status === "warn" ? "alert" : "x"} />
              </span>
              <span>
                <span className="font-medium">{c.rule}:</span> <span className="text-muted">{c.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Perf({ rows, target }: { rows: FinalBuild["performance"]; target?: number }) {
  if (!rows.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Expected performance</h4>
      <ul className="space-y-2.5">
        {rows.map((r, i) => {
          // Scale each row on its own so a 400 FPS esports title doesn't flatten a 90 FPS AAA one.
          const max = Math.max(r.fps_high, target ?? 0, 1) * 1.15;
          return (
          <li key={i} title={r.basis}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{r.game}</span> <span className="text-muted">· {r.resolution}, {r.settings}</span>
              </span>
              <span className={cx("shrink-0 font-mono tabular-nums", r.meets_target ? "text-good" : "text-warn")}>
                {r.fps_low}–{r.fps_high} FPS
              </span>
            </div>
            <div className="relative mt-1 h-1.5 rounded-full bg-surface-2">
              <div
                className={cx("absolute h-full rounded-full", r.meets_target ? "bg-good" : "bg-warn")}
                style={{ left: `${(r.fps_low / max) * 100}%`, width: `${Math.max(2, ((r.fps_high - r.fps_low) / max) * 100)}%` }}
              />
              {target ? <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-text" style={{ left: `${(target / max) * 100}%` }} /> : null}
            </div>
          </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        {target ? `The tick marks your ${target} FPS target. ` : ""}Estimates from benchmarks (hover a row for the source); real results vary with settings and patches.
      </p>
    </div>
  );
}

function BuildCard({ build, result }: { build: FinalBuild; result: FinalResult }) {
  const total = build.total + result.extrasTotal;
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Badge tone="accent">
            <Icon name="cpu" className="size-3" /> DIY build
          </Badge>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">{build.name}</h3>
          <p className="mt-1 text-sm text-muted">{build.summary}</p>
        </div>
        <BudgetMeter total={total} budget={result.budget} currency={result.currency} />
      </div>
      <ul className="mt-4 divide-y divide-border border-t border-border">
        {build.parts.map((p, i) => (
          <PartRow key={i} part={p} currency={result.currency} />
        ))}
      </ul>
      <div className="mt-4 grid gap-5 border-t border-border pt-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Checks checks={build.checks} />
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="bolt" /> Estimated peak draw ~{build.estimated_power_draw_w} W
          </p>
          {build.upgrade_path && <p className="text-sm text-muted">{build.upgrade_path}</p>}
          {result.extrasTotal > 0 && (
            <p className="text-xs text-muted">
              Total includes {money(result.extrasTotal, result.currency)} of extras (see below).
            </p>
          )}
        </div>
        <Perf rows={build.performance} target={result.targetFps} />
      </div>
    </article>
  );
}

function PrebuiltCard({ pc, result }: { pc: FinalPrebuilt; result: FinalResult }) {
  const specs = Object.entries(pc.specs).filter(([, v]) => v !== undefined && v !== "") as [string, string | boolean][];
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Badge tone="accent">
            <Icon name="box" className="size-3" /> Prebuilt
          </Badge>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">{pc.name}</h3>
          <p className="mt-1 text-sm text-muted">{pc.summary}</p>
        </div>
        <BudgetMeter total={pc.total + result.extrasTotal} budget={result.budget} currency={result.currency} />
      </div>
      <div className="mt-5 grid gap-6 border-t border-border pt-5 lg:grid-cols-2">
        <div className="space-y-5">
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            {specs.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k === "os_included" ? "OS" : CATEGORY_LABEL[k] ?? k.toUpperCase()}</dt>
                <dd>{typeof v === "boolean" ? (v ? "Included" : "Not included") : v}</dd>
              </div>
            ))}
            {pc.warranty && (
              <div className="contents">
                <dt className="text-muted">Warranty</dt>
                <dd>{pc.warranty}</dd>
              </div>
            )}
          </dl>
          <ListingBlock l={pc.listing} currency={result.currency} compact />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <ul className="space-y-1">
              {pc.pros.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <Icon name="check" className="mt-0.5 size-4 shrink-0 text-good" /> {p}
                </li>
              ))}
            </ul>
            <ul className="space-y-1">
              {pc.cons.map((c, i) => (
                <li key={i} className="flex gap-1.5 text-muted">
                  <Icon name="x" className="mt-0.5 size-4 shrink-0 text-warn" /> {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Perf rows={pc.performance} target={result.targetFps} />
      </div>
    </article>
  );
}

function shoppingList(r: FinalResult): string {
  const lines: string[] = [];
  const line = (label: string, l?: VerifiedListing) =>
    lines.push(`- ${label}${l ? `: ${money(l.price_in_user_currency, r.currency)} at ${l.retailer} (${l.condition}) ${l.url}` : " (already owned)"}`);
  r.builds.forEach((b) => {
    lines.push(`${b.name} – ${money(b.total, r.currency)}`);
    b.parts.forEach((p) => line(`${CATEGORY_LABEL[p.category] ?? p.category}: ${p.name}`, p.owned ? undefined : p.listing));
    lines.push("");
  });
  r.prebuilts.forEach((p) => {
    lines.push(`Prebuilt: ${p.name}`);
    line(p.name, p.listing);
    lines.push("");
  });
  if (r.extras.length) {
    lines.push("Extras");
    r.extras.forEach((e) => line(e.name, e.listing));
  }
  return lines.join("\n").trim();
}

export default function Results({
  result,
  events,
  onEdit,
  onRestart,
}: {
  result: FinalResult;
  events: AgentEvent[];
  onEdit: () => void;
  onRestart: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const stats = researchStats(events);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shoppingList(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; nothing sensible to do
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {result.demo && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Demo output.</strong> Sample prices and search-page links, not live listings. Add an Anthropic API key to run a real search.
          </span>
        </div>
      )}

      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">Your RigScout picks</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy}>
              <Icon name="copy" /> {copied ? "Copied" : "Copy shopping list"}
            </Button>
            <Button variant="secondary" onClick={onEdit}>
              Edit answers
            </Button>
            <Button variant="ghost" onClick={onRestart}>
              <Icon name="refresh" /> New search
            </Button>
          </div>
        </div>
        <p className="max-w-3xl text-muted">{result.overview}</p>
        <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          <span className="font-semibold text-accent">Recommendation: </span>
          {result.recommendation}
        </div>
      </header>

      {result.warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-border bg-surface px-4 py-3">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-warn" /> {w}
            </li>
          ))}
        </ul>
      )}

      {result.builds.map((b, i) => (
        <BuildCard key={`b${i}`} build={b} result={result} />
      ))}
      {result.prebuilts.map((p, i) => (
        <PrebuiltCard key={`p${i}`} pc={p} result={result} />
      ))}

      {result.extras.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7">
          <h3 className="text-lg font-semibold">Extras</h3>
          <p className="text-sm text-muted">Included in every total above.</p>
          <ul className="mt-2 divide-y divide-border">
            {result.extras.map((e, i) => (
              <PartRow key={i} part={{ ...e, category: e.category as FinalPart["category"], specs: {} }} currency={result.currency} />
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {result.skipped_sources.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="shield" className="size-4 text-bad" /> Sources RigScout didn&apos;t trust
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {result.skipped_sources.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.domain}</span> <span className="text-muted">– {s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <button type="button" onClick={() => setShowLog(!showLog)} className="flex w-full items-center justify-between text-left">
            <span className="text-sm font-semibold">How this was researched</span>
            <Icon name="chevron" className={cx("size-4 text-muted transition-transform", showLog && "rotate-90")} />
          </button>
          <p className="mt-1 text-sm text-muted">
            {stats.searches} {stats.searches === 1 ? "search" : "searches"} · {stats.pages} {stats.pages === 1 ? "page" : "pages"} read
            {stats.costUsd > 0 ? ` · ~$${stats.costUsd.toFixed(2)} API cost` : ""} · {new Date(result.generatedAt).toLocaleString()}
          </p>
          {showLog && (
            <div className="mt-3 border-t border-border pt-2">
              <FeedLog events={events} />
            </div>
          )}
        </div>
      </section>

      <p className="pb-4 text-center text-xs text-muted">
        Prices and stock change quickly. Check each listing before you buy, and for used parts, test before paying where you can.
      </p>
    </div>
  );
}
