"use client";

import { useState, type ReactNode } from "react";
import type { BuildRequest, ConditionPolicy, Extra, UseCase } from "@/lib/types";
import { CURRENCIES, REGIONS, getRegion } from "@/lib/regions";
import { money } from "@/lib/format";
import { Button, Chip, Field, Icon, OptionCard, Segmented, Toggle, cx, inputClass } from "./ui";

const USE_CASES: { value: UseCase; label: string }[] = [
  { value: "gaming", label: "Gaming" },
  { value: "streaming", label: "Streaming" },
  { value: "video_editing", label: "Video editing" },
  { value: "3d_cad", label: "3D / CAD" },
  { value: "programming", label: "Programming" },
  { value: "office", label: "Office & browsing" },
  { value: "ai_ml", label: "Local AI / ML" },
];

const POPULAR_GAMES = [
  "Counter-Strike 2",
  "Valorant",
  "Fortnite",
  "League of Legends",
  "Apex Legends",
  "Marvel Rivals",
  "Call of Duty",
  "Battlefield 6",
  "Arc Raiders",
  "Cyberpunk 2077",
  "Elden Ring",
  "Baldur's Gate 3",
  "Monster Hunter Wilds",
  "Helldivers 2",
  "Minecraft",
  "GTA V",
  "Rocket League",
  "Microsoft Flight Simulator 2024",
];

const EXTRAS: { value: Extra; label: string }[] = [
  { value: "os_license", label: "Windows licence" },
  { value: "monitor", label: "Monitor" },
  { value: "keyboard_mouse", label: "Keyboard & mouse" },
  { value: "headset", label: "Headset" },
];

const CONDITIONS: { value: ConditionPolicy; title: string; desc: string; badge?: string }[] = [
  { value: "new_only", title: "New only", desc: "Full warranty on everything. Usually the priciest option." },
  { value: "refurb_ok", title: "New or refurbished", desc: "Adds refurbished and open-box items from shops, with warranty." },
  {
    value: "used_except_critical",
    title: "Used OK, except PSU & SSD",
    desc: "Used GPUs and CPUs are great value; power supplies and drives wear out, so those stay new.",
    badge: "Best value",
  },
  { value: "used_ok", title: "Anything goes", desc: "Any part can be used, as long as the seller is trustworthy." },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

interface Step {
  id: string;
  title: string;
  subtitle: string;
  valid: boolean;
  body: ReactNode;
}

export default function Wizard({
  value,
  onChange,
  onSubmit,
  onDemo,
}: {
  value: BuildRequest;
  onChange: (r: BuildRequest) => void;
  onSubmit: () => void;
  onDemo: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [customGame, setCustomGame] = useState("");
  const r = value;
  const set = <K extends keyof BuildRequest>(key: K, v: BuildRequest[K]) => onChange({ ...r, [key]: v });
  const gaming = r.useCases.includes("gaming");
  const region = getRegion(r.country);

  const addCustomGame = () => {
    const g = customGame.trim();
    if (g && !r.games.includes(g) && r.games.length < 15) set("games", [...r.games, g]);
    setCustomGame("");
  };

  const steps: Step[] = [
    {
      id: "use",
      title: "What will you use it for?",
      subtitle: "Pick everything that applies. This decides where the budget goes.",
      valid: r.useCases.length > 0,
      body: (
        <div className="flex flex-wrap gap-2">
          {USE_CASES.map((u) => (
            <Chip key={u.value} selected={r.useCases.includes(u.value)} onClick={() => set("useCases", toggle(r.useCases, u.value))}>
              {u.label}
            </Chip>
          ))}
        </div>
      ),
    },
    ...(gaming
      ? [
          {
            id: "games",
            title: "What do you want to play?",
            subtitle: "RigScout looks up benchmarks for these exact games.",
            valid: true,
            body: (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {[...POPULAR_GAMES, ...r.games.filter((g) => !POPULAR_GAMES.includes(g))].map((g) => (
                    <Chip key={g} selected={r.games.includes(g)} onClick={() => set("games", toggle(r.games, g))}>
                      {g}
                    </Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    placeholder="Another game…"
                    aria-label="Add another game"
                    value={customGame}
                    maxLength={60}
                    onChange={(e) => setCustomGame(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomGame();
                      }
                    }}
                  />
                  <Button variant="secondary" onClick={addCustomGame} disabled={!customGame.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            ),
          },
          {
            id: "perf",
            title: "How should it run?",
            subtitle: "Match this to your monitor. Higher resolution and FPS both cost GPU power.",
            valid: true,
            body: (
              <div className="space-y-6">
                <Field label="Resolution">
                  <Segmented
                    label="Resolution"
                    value={r.resolution}
                    onChange={(v) => set("resolution", v)}
                    options={[
                      { value: "1080p", label: "1080p" },
                      { value: "1440p", label: "1440p" },
                      { value: "ultrawide", label: "Ultrawide" },
                      { value: "4k", label: "4K" },
                    ]}
                  />
                </Field>
                <Field label="Target frame rate" hint="Competitive shooters benefit from 144+; 60 is fine for story games.">
                  <Segmented
                    label="Target FPS"
                    value={r.targetFps}
                    onChange={(v) => set("targetFps", v)}
                    options={[60, 120, 144, 165, 240, 360].map((f) => ({ value: f, label: `${f}` }))}
                  />
                </Field>
                <Field label="Graphics settings">
                  <Segmented
                    label="Graphics settings"
                    value={r.graphicsQuality}
                    onChange={(v) => set("graphicsQuality", v)}
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                      { value: "ultra", label: "Ultra" },
                    ]}
                  />
                </Field>
                <Toggle checked={r.rayTracing} onChange={(v) => set("rayTracing", v)} label="Ray tracing matters to me" hint="Pushes towards NVIDIA and a bigger GPU." />
              </div>
            ),
          },
        ]
      : []),
    {
      id: "budget",
      title: "What's your budget?",
      subtitle: "The total you want to spend, including any extras below.",
      valid: r.budget >= 300,
      body: (
        <div className="space-y-6">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={300}
              step={50}
              className={cx(inputClass, "text-lg font-semibold")}
              value={Number.isFinite(r.budget) ? r.budget : ""}
              onChange={(e) => set("budget", Number(e.target.value))}
              aria-label="Budget"
            />
            <select className={inputClass} value={r.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {r.budget < 300 && <p className="text-xs text-bad">A usable PC needs at least around 300 {r.currency}.</p>}
          <Toggle
            checked={r.budgetFlexible}
            onChange={(v) => set("budgetFlexible", v)}
            label="I can stretch it a little"
            hint={`Up to ${money(r.budget * 1.1, r.currency)} if it clearly pays off.`}
          />
          <Field label="Also need, within this budget" hint="Leave empty if you already have these.">
            <div className="flex flex-wrap gap-2">
              {EXTRAS.map((x) => (
                <Chip key={x.value} selected={r.extras.includes(x.value)} onClick={() => set("extras", toggle(r.extras, x.value))}>
                  {x.label}
                </Chip>
              ))}
            </div>
          </Field>
        </div>
      ),
    },
    {
      id: "buy",
      title: "How do you want to buy it?",
      subtitle: "Building yourself is cheaper; prebuilts come assembled with one warranty.",
      valid: true,
      body: (
        <div className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-3">
            <OptionCard selected={r.buildType === "diy"} onClick={() => set("buildType", "diy")} title="Build it myself" desc="A compatible parts list from the best offers." />
            <OptionCard selected={r.buildType === "prebuilt"} onClick={() => set("buildType", "prebuilt")} title="Prebuilt" desc="Ready-to-use PCs from system builders and shops." />
            <OptionCard selected={r.buildType === "both"} onClick={() => set("buildType", "both")} title="Show me both" desc="Compare a DIY build with prebuilt options." />
          </div>
          <Field label="Condition">
            <div className="grid gap-2 sm:grid-cols-2">
              {CONDITIONS.map((c) => (
                <OptionCard key={c.value} selected={r.condition === c.value} onClick={() => set("condition", c.value)} title={c.title} desc={c.desc} badge={c.badge} />
              ))}
            </div>
          </Field>
        </div>
      ),
    },
    {
      id: "where",
      title: "Where are you?",
      subtitle: "RigScout only suggests shops that deliver to you, and pickup offers nearby.",
      valid: !!r.country,
      body: (
        <div className="space-y-6">
          <Field label="Country">
            <select
              className={inputClass}
              aria-label="Country"
              value={r.country}
              onChange={(e) => {
                const next = getRegion(e.target.value);
                onChange({ ...r, country: e.target.value, currency: next?.currency ?? r.currency });
              }}
            >
              {REGIONS.map((reg) => (
                <option key={reg.code} value={reg.code}>
                  {reg.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field label="City" hint="Optional">
              <input className={inputClass} aria-label="City" value={r.city} maxLength={80} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Zürich" />
            </Field>
            <Field label="Postcode" hint="Optional">
              <input className={inputClass} aria-label="Postcode" value={r.postalCode} maxLength={20} onChange={(e) => set("postalCode", e.target.value)} />
            </Field>
          </div>
          <Toggle checked={r.pickupOk} onChange={(v) => set("pickupOk", v)} label="Local pickup is fine" hint="Opens up classifieds nearby, where you can test used parts before paying." />
          {r.pickupOk && (
            <Field label={`Pickup radius: ${r.pickupRadiusKm} km`}>
              <input
                type="range"
                aria-label="Pickup radius in km"
                min={5}
                max={150}
                step={5}
                value={r.pickupRadiusKm}
                onChange={(e) => set("pickupRadiusKm", Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
          )}
          {region && (
            <p className="text-xs text-muted">
              Starting points in {region.name}: {region.retailers.slice(0, 4).join(", ")} and {region.priceComparison[0]}. RigScout searches beyond these too.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "prefs",
      title: "Any preferences?",
      subtitle: "All optional. Leave on “Any” if you don't mind.",
      valid: true,
      body: (
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="CPU brand">
              <Segmented label="CPU brand" value={r.cpuBrand} onChange={(v) => set("cpuBrand", v)} options={[{ value: "any", label: "Any" }, { value: "amd", label: "AMD" }, { value: "intel", label: "Intel" }]} />
            </Field>
            <Field label="GPU brand">
              <Segmented
                label="GPU brand"
                value={r.gpuBrand}
                onChange={(v) => set("gpuBrand", v)}
                options={[{ value: "any", label: "Any" }, { value: "nvidia", label: "NVIDIA" }, { value: "amd", label: "AMD" }, { value: "intel", label: "Intel" }]}
              />
            </Field>
            <Field label="Size">
              <Segmented
                label="Size"
                value={r.size}
                onChange={(v) => set("size", v)}
                options={[{ value: "any", label: "Any" }, { value: "compact", label: "Compact" }, { value: "mid", label: "Mid" }, { value: "full", label: "Full" }]}
              />
            </Field>
            <Field label="Look">
              <Segmented
                label="Look"
                value={r.look}
                onChange={(v) => set("look", v)}
                options={[{ value: "any", label: "Any" }, { value: "rgb", label: "RGB" }, { value: "no_rgb", label: "No RGB" }, { value: "white", label: "White" }]}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={r.quiet} onChange={(v) => set("quiet", v)} label="Quiet matters" />
            <Toggle checked={r.wifi} onChange={(v) => set("wifi", v)} label="Needs Wi-Fi" />
          </div>
          <Field label="Parts you already have" hint="RigScout will reuse them and check they fit, e.g. “2 TB Samsung 990 Pro, Fractal North case”.">
            <input className={inputClass} aria-label="Parts you already have" value={r.existingParts} maxLength={600} onChange={(e) => set("existingParts", e.target.value)} />
          </Field>
        </div>
      ),
    },
    {
      id: "review",
      title: "Ready to scout",
      subtitle: "RigScout will spend a few minutes searching shops and marketplaces, then check every pick.",
      valid: true,
      body: <Review r={r} onNotes={(v) => set("notes", v)} />,
    },
  ];

  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to step ${i + 1}: ${s.title}`}
            onClick={() => i < index && setStepIndex(i)}
            className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= index ? "bg-accent" : "bg-border", i < index && "cursor-pointer")}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{step.title}</h2>
        <p className="mt-1 text-sm text-muted">{step.subtitle}</p>
        <div className="mt-6">{step.body}</div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" onClick={() => setStepIndex(index - 1)} disabled={index === 0}>
            <Icon name="back" /> Back
          </Button>
          {last ? (
            <Button onClick={onSubmit}>
              <Icon name="search" /> Find my PC
            </Button>
          ) : (
            <Button onClick={() => setStepIndex(index + 1)} disabled={!step.valid}>
              Continue <Icon name="chevron" />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Just looking?{" "}
        <button type="button" onClick={onDemo} className="font-medium text-accent underline-offset-2 hover:underline">
          Watch a demo run
        </button>{" "}
        with sample data.
      </p>
    </div>
  );
}

function Review({ r, onNotes }: { r: BuildRequest; onNotes: (v: string) => void }) {
  const rows: [string, string][] = [
    ["For", r.useCases.map((u) => USE_CASES.find((x) => x.value === u)?.label).join(", ")],
  ];
  if (r.useCases.includes("gaming")) {
    rows.push(["Games", r.games.length ? r.games.join(", ") : "Not specified"]);
    rows.push(["Target", `${r.resolution === "ultrawide" ? "Ultrawide 1440p" : r.resolution} · ${r.targetFps} FPS · ${r.graphicsQuality} settings${r.rayTracing ? " · ray tracing" : ""}`]);
  }
  rows.push(["Budget", `${money(r.budget, r.currency)}${r.budgetFlexible ? " (flexible)" : ""}${r.extras.length ? ` incl. ${r.extras.map((e) => EXTRAS.find((x) => x.value === e)?.label).join(", ")}` : ""}`]);
  rows.push(["Buying", `${r.buildType === "diy" ? "DIY parts" : r.buildType === "prebuilt" ? "Prebuilt" : "DIY + prebuilt"} · ${CONDITIONS.find((c) => c.value === r.condition)?.title}`]);
  rows.push(["Location", `${[r.city, r.postalCode].filter(Boolean).join(" ") || "—"}, ${getRegion(r.country)?.name ?? r.country}${r.pickupOk ? ` · pickup ≤ ${r.pickupRadiusKm} km` : ""}`]);

  return (
    <div className="space-y-6">
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Field label="Anything else?" hint="Other software you use, must-haves, shops you like or avoid…">
        <textarea className={cx(inputClass, "min-h-24 resize-y")} aria-label="Anything else" maxLength={1500} value={r.notes} onChange={(e) => onNotes(e.target.value)} />
      </Field>
    </div>
  );
}
