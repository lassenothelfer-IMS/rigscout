"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import { elapsed, shortUrl } from "@/lib/format";
import { Badge, Button, Icon, cx, type IconName } from "./ui";

type FeedEvent = Exclude<AgentEvent, { type: "result" | "usage" | "done" | "error" }>;

export function researchStats(events: AgentEvent[]) {
  const usage = [...events].reverse().find((e): e is Extract<AgentEvent, { type: "usage" }> => e.type === "usage");
  const searches = Math.max(usage?.searches ?? 0, events.filter((e) => e.type === "search").length);
  const pages = Math.max(usage?.fetches ?? 0, events.filter((e) => e.type === "fetched" && e.ok).length);
  return { searches, pages, costUsd: usage?.costUsd ?? 0 };
}

function FeedRow({ e }: { e: FeedEvent }) {
  const [open, setOpen] = useState(false);
  let icon: IconName = "spark";
  let tone = "text-muted";
  let body: React.ReactNode = null;

  switch (e.type) {
    case "status":
      body = <span className="text-muted">{e.message}</span>;
      break;
    case "search":
      icon = "search";
      tone = "text-accent";
      body = (
        <span>
          Searched <span className="font-medium">“{e.query}”</span>
        </span>
      );
      break;
    case "results":
      icon = "chevron";
      body = (
        <span className="text-muted">
          {e.count} results{e.domains.length ? ` · ${e.domains.join(", ")}` : ""}
        </span>
      );
      break;
    case "fetch":
      icon = "page";
      tone = "text-accent";
      body = (
        <span>
          Reading <span className="font-medium">{shortUrl(e.url)}</span>
        </span>
      );
      break;
    case "fetched":
      if (e.ok) return null;
      icon = "x";
      body = <span className="text-muted">Couldn&apos;t read that page</span>;
      break;
    case "thinking":
    case "note":
      icon = e.type === "thinking" ? "spark" : "chevron";
      body =
        e.text.length > 220 && !open ? (
          <button type="button" onClick={() => setOpen(true)} className="text-left text-muted italic">
            {e.text.slice(0, 200)}… <span className="not-italic text-accent">more</span>
          </button>
        ) : (
          <span className={cx("whitespace-pre-line", e.type === "thinking" ? "text-muted italic" : "")}>{e.text}</span>
        );
      break;
    case "compat": {
      const fails = e.checks.filter((c) => c.status === "fail");
      const warns = e.checks.filter((c) => c.status === "warn").length;
      icon = fails.length ? "alert" : "check";
      tone = fails.length ? "text-bad" : "text-good";
      body = (
        <span>
          Compatibility check:{" "}
          {fails.length ? (
            <span className="text-bad">{fails.length} problem{fails.length > 1 ? "s" : ""} found, fixing</span>
          ) : (
            <span className="text-good">all clear</span>
          )}
          {warns ? <span className="text-muted"> · {warns} note{warns > 1 ? "s" : ""}</span> : null}
          {fails.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs text-muted">
              {fails.slice(0, 4).map((f, i) => (
                <li key={i}>{f.message}</li>
              ))}
            </ul>
          )}
        </span>
      );
      break;
    }
    case "rejected":
      icon = "shield";
      tone = "text-warn";
      body = (
        <span>
          Quality check sent back {e.problems.length} issue{e.problems.length > 1 ? "s" : ""}, fixing
          <ul className="mt-1 list-disc pl-4 text-xs text-muted">
            {e.problems.slice(0, 5).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </span>
      );
      break;
    case "verifying":
      icon = "link";
      tone = "text-accent";
      body = <span>Checking {e.count} shop links are live…</span>;
      break;
  }

  return (
    <li className="flex gap-3 py-1.5 text-sm">
      <span className={cx("mt-0.5 shrink-0", tone)}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0 break-words">{body}</span>
    </li>
  );
}

export default function Research({ events, startedAt, onCancel }: { events: AgentEvent[]; startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLUListElement>(null);
  const stats = researchStats(events);
  const feed = events.filter((e): e is FeedEvent => !["result", "usage", "done", "error"].includes(e.type));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Scouting the market…</h2>
            <p className="mt-1 text-sm text-muted">This usually takes 3–8 minutes. Every pick gets checked for fit, price and seller before you see it.</p>
          </div>
          <span className="font-mono text-sm tabular-nums text-muted">{elapsed(now - startedAt)}</span>
        </div>

        <div className="scan-bar relative mt-5 h-1 overflow-hidden rounded-full bg-surface-2" />

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="accent">
            <Icon name="search" className="size-3" /> {stats.searches} {stats.searches === 1 ? "search" : "searches"}
          </Badge>
          <Badge tone="accent">
            <Icon name="page" className="size-3" /> {stats.pages} {stats.pages === 1 ? "page" : "pages"} read
          </Badge>
          {stats.costUsd > 0 && <Badge>~${stats.costUsd.toFixed(2)} API cost so far</Badge>}
        </div>

        <ul ref={listRef} className="mt-5 max-h-[52vh] overflow-y-auto border-t border-border pt-3" aria-live="polite">
          {feed.map((e, i) => (
            <FeedRow key={i} e={e} />
          ))}
        </ul>

        <div className="mt-5 flex justify-end border-t border-border pt-5">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FeedLog({ events }: { events: AgentEvent[] }) {
  const feed = events.filter((e): e is FeedEvent => !["result", "usage", "done", "error"].includes(e.type));
  return (
    <ul className="max-h-96 overflow-y-auto">
      {feed.map((e, i) => (
        <FeedRow key={i} e={e} />
      ))}
    </ul>
  );
}
