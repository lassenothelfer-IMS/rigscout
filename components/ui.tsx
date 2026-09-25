"use client";

import type { ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const ICONS = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.35-4.35",
  page: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h6",
  spark: "M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8",
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  x: "M18 6 6 18M6 6l12 12",
  chevron: "m9 18 6-6-6-6",
  back: "m15 18-6-6 6-6",
  link: "M7 17 17 7M7 7h10v10",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  cpu: "M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 5h4v4h-4z",
  box: "M21 8 12 3 3 8m18 0v8l-9 5m9-13-9 5m0 8-9-5V8m9 13v-8M3 8l9 5",
  copy: "M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8Zm-4 8V5a1 1 0 0 1 1-1h11",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5m5 4a9 9 0 0 1-15.5 6.2L3 16m0 5v-5h5",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        selected ? "border-accent bg-accent-soft text-accent font-medium" : "border-border bg-surface text-text hover:border-border-strong",
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
            value === o.value ? "bg-surface text-text font-medium shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cx(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-accent",
          checked ? "bg-accent" : "bg-border-strong",
        )}
      >
        <span className={cx("absolute top-1 size-4 rounded-full bg-white transition-all", checked ? "left-5" : "left-1")} />
      </span>
    </label>
  );
}

export function OptionCard({
  selected,
  onClick,
  title,
  desc,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "rounded-xl border p-4 text-left transition-colors",
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cx("text-sm font-semibold", selected && "text-accent")}>{title}</span>
        {badge && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{badge}</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">{desc}</span>
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted/70 outline-none focus:border-accent";

type Tone = "good" | "warn" | "bad" | "neutral" | "accent";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const tones: Record<Tone, string> = {
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone])}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "secondary" && "border border-border bg-surface text-text hover:border-border-strong",
        variant === "ghost" && "text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
