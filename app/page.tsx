"use client";

import { useEffect, useRef, useState } from "react";
import Wizard from "@/components/Wizard";
import Research from "@/components/Research";
import Results from "@/components/Results";
import { Button, Icon } from "@/components/ui";
import { streamBuild } from "@/lib/client";
import { DEFAULT_REQUEST, type AgentEvent, type BuildRequest } from "@/lib/types";
import type { FinalResult } from "@/lib/schema";

type Phase = "form" | "running" | "done";
type RunError = Extract<AgentEvent, { type: "error" }>;

const STORAGE_KEY = "rigscout:request";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode etc.) – not critical
  }
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("form");
  const [request, setRequest] = useState<BuildRequest>(DEFAULT_REQUEST);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState<RunError | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let saved: Partial<BuildRequest> | null = null;
    try {
      saved = JSON.parse(read(STORAGE_KEY) ?? "null");
    } catch {
      // corrupt entry – start fresh
    }
    // Restoring browser-only state after hydration; localStorage isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setRequest({ ...DEFAULT_REQUEST, ...saved });
  }, []);

  const start = (demo: boolean) => {
    write(STORAGE_KEY, JSON.stringify(request));
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setEvents([]);
    setResult(null);
    setError(null);
    setStartedAt(Date.now());
    setPhase("running");
    window.scrollTo({ top: 0 });

    streamBuild(
      { request, demo },
      (e) => {
        if (e.type === "result") setResult(e.result);
        if (e.type === "error") setError(e);
        setEvents((prev) => [...prev, e]);
      },
      controller.signal,
    )
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError({ type: "error", code: "api_error", message: err instanceof Error ? err.message : "Connection lost." });
      })
      .finally(() => {
        if (!controller.signal.aborted) setPhase("done");
      });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("form");
  };

  return (
    <main className="flex flex-1 flex-col px-4 pb-16 sm:px-6">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-5">
        <button type="button" onClick={() => phase !== "running" && setPhase("form")} className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
            <Icon name="cpu" className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">RigScout</span>
        </button>
        <span className="hidden text-xs text-muted sm:block">AI PC builder · searches credible shops near you</span>
      </header>

      {phase === "form" && (
        <>
          <section className="mx-auto mb-8 mt-4 max-w-2xl text-center sm:mt-10">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">The right PC for your games and your budget</h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-muted">
              Answer a few questions. RigScout searches shops, price-comparison sites and marketplaces near you, checks every part fits together, and skips sellers it
              doesn&apos;t trust.
            </p>
          </section>
          <Wizard value={request} onChange={setRequest} onSubmit={() => start(false)} onDemo={() => start(true)} />
        </>
      )}

      {phase === "running" && <Research events={events} startedAt={startedAt} onCancel={cancel} />}

      {phase === "done" && result && (
        <Results
          result={result}
          events={events}
          onEdit={() => setPhase("form")}
          onRestart={() => {
            setRequest(DEFAULT_REQUEST);
            setPhase("form");
          }}
        />
      )}

      {phase === "done" && !result && (
        <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-1 size-5 shrink-0 text-bad" />
            <div className="min-w-0 space-y-3">
              <h2 className="text-xl font-semibold">{error?.code === "no_api_key" ? "Almost there" : "The search didn't finish"}</h2>
              <p className="text-sm text-muted">{error?.message ?? "The connection closed before results arrived."}</p>
              {error?.code === "no_api_key" && (
                <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">ANTHROPIC_API_KEY=sk-ant-...</pre>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => start(false)}>
                  <Icon name="refresh" /> Try again
                </Button>
                <Button variant="secondary" onClick={() => setPhase("form")}>
                  Edit answers
                </Button>
                {error?.code === "no_api_key" && (
                  <Button variant="ghost" onClick={() => start(true)}>
                    Watch the demo
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
