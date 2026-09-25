import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { AgentEvent, BuildRequest, CompatCheck, ConditionPolicy, LinkStatus } from "./types";
import {
  CheckCompatibilityInput,
  SubmitInput,
  toInputSchema,
  type FinalResult,
  type ListingT,
  type SubmitT,
  type VerifiedListing,
} from "./schema";
import { checkCompatibility, hasFailures } from "./compatibility";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { getRegion } from "./regions";
import { BLOCKED_DOMAINS, domainOf, isBlocked, normalizeUrl, sourceType } from "./trust";
import { verifyLinks } from "./verify";

const MODEL = process.env.RIGSCOUT_MODEL || "claude-opus-5";
const EFFORT = (process.env.RIGSCOUT_EFFORT || "high") as "low" | "medium" | "high" | "xhigh" | "max";
const MAX_REQUESTS = 40; // API calls per run, incl. pause_turn continuations
const MAX_REJECTIONS = 3; // times submit_recommendations may bounce before we accept with warnings

// USD per million tokens, for the running cost estimate shown in the UI.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const SEARCH_COST_USD = 0.01;

type Emit = (e: AgentEvent) => void;

function buildTools(req: BuildRequest): BetaToolUnion[] {
  const region = getRegion(req.country);
  return [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 30,
      blocked_domains: BLOCKED_DOMAINS,
      user_location: region
        ? { type: "approximate", country: region.code, timezone: region.timezone, ...(req.city.trim() ? { city: req.city.trim() } : {}) }
        : undefined,
    },
    {
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_uses: 25,
      blocked_domains: BLOCKED_DOMAINS,
      max_content_tokens: 20000,
    },
    {
      name: "check_compatibility",
      description:
        "Run the deterministic compatibility checker on one candidate DIY build (CPU socket vs motherboard, RAM generation and slots, case fit for motherboard/GPU/cooler/PSU, cooler socket support, PSU wattage headroom, M.2 slots, display output). Call this whenever you have a full candidate parts list, and again after changing parts. Every FAIL must be fixed before submitting; WARNs should be addressed or explained.",
      input_schema: toInputSchema(CheckCompatibilityInput),
      eager_input_streaming: true,
    },
    {
      name: "submit_recommendations",
      description:
        "Submit the final recommendations to the customer. Call exactly once when research is complete. The submission is validated (compatibility, budget, condition policy, seller credibility, link liveness); if problems come back, fix them and call again.",
      input_schema: toInputSchema(SubmitInput),
      eager_input_streaming: true,
    },
  ];
}

function conditionAllowed(policy: ConditionPolicy, category: string, cond: ListingT["condition"]): boolean {
  switch (policy) {
    case "used_ok":
      return true;
    case "new_only":
      return cond === "new";
    case "refurb_ok":
      return cond !== "used";
    case "used_except_critical":
      return !(cond === "used" && ["psu", "storage", "prebuilt"].includes(category));
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s)"'<>\]\\]+/g;

export async function runAgent(req: BuildRequest, emit: Emit, signal: AbortSignal): Promise<void> {
  const client = new Anthropic();
  const tools = buildTools(req);
  const today = new Date().toISOString().slice(0, 10);
  const messages: BetaMessageParam[] = [{ role: "user", content: buildUserMessage(req, today) }];
  const maxBudget = (req.budgetFlexible ? req.budget * 1.1 : req.budget) * 1.02; // 2% slack for FX rounding
  const gaming = req.useCases.includes("gaming");

  const seen = new Set<string>(); // normalized URLs the agent actually saw
  const usage = { searches: 0, fetches: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let rejections = 0;
  let jsonRetries = 0;
  let nudged = false;

  const emitUsage = () => {
    const price = PRICING[MODEL] ?? PRICING["claude-opus-5"];
    const costUsd =
      ((usage.input + usage.cacheWrite * 1.25 + usage.cacheRead * 0.1) * price.input + usage.output * price.output) / 1e6 +
      usage.searches * SEARCH_COST_USD;
    emit({
      type: "usage",
      searches: usage.searches,
      fetches: usage.fetches,
      inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
      outputTokens: usage.output,
      costUsd,
    });
  };

  const onBlock = (block: BetaContentBlock) => {
    switch (block.type) {
      case "server_tool_use":
        if (block.name === "web_search") emit({ type: "search", query: String(block.input.query ?? "") });
        if (block.name === "web_fetch") emit({ type: "fetch", url: String(block.input.url ?? "") });
        break;
      case "web_search_tool_result":
        if (Array.isArray(block.content)) {
          for (const r of block.content) seen.add(normalizeUrl(r.url));
          const domains = [...new Set(block.content.map((r) => domainOf(r.url)).filter(Boolean))];
          emit({ type: "results", count: block.content.length, domains: domains.slice(0, 6) });
        } else if (block.content.error_code === "max_uses_exceeded") {
          emit({ type: "status", message: "Search limit for this step reached." });
        }
        break;
      case "web_fetch_tool_result":
        if (block.content.type === "web_fetch_result") {
          seen.add(normalizeUrl(block.content.url));
          const src = block.content.content.source;
          if (src.type === "text") for (const m of src.data.match(URL_IN_TEXT) ?? []) seen.add(normalizeUrl(m));
          emit({ type: "fetched", url: block.content.url, ok: true, title: block.content.content.title ?? undefined });
        } else {
          emit({ type: "fetched", url: "", ok: false });
        }
        break;
      case "text":
        for (const c of block.citations ?? []) if ("url" in c && c.url) seen.add(normalizeUrl(c.url));
        if (block.text.trim()) emit({ type: "note", text: block.text.trim() });
        break;
      case "thinking":
        if (block.thinking.trim()) emit({ type: "thinking", text: block.thinking.trim() });
        break;
    }
  };

  emit({ type: "status", message: `Researching with ${MODEL}…` });

  for (let step = 0; step < MAX_REQUESTS; step++) {
    if (signal.aborted) return;

    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        system: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: EFFORT },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        tools,
        messages,
      },
      { signal },
    );
    stream.on("contentBlock", onBlock);

    let msg: BetaMessage;
    try {
      msg = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Eager input streaming can yield tool input that isn't parseable JSON;
      // re-issue that turn. Everything else (API errors, aborts) propagates.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
      emit({ type: "status", message: "A step came back garbled – retrying it." });
      continue;
    }

    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
    usage.searches += msg.usage.server_tool_use?.web_search_requests ?? 0;
    usage.fetches += msg.usage.server_tool_use?.web_fetch_requests ?? 0;
    emitUsage();

    if (msg.stop_reason === "refusal") {
      emit({ type: "error", code: "api_error", message: "The model declined to continue this request." });
      return;
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }

    const toolUses = msg.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "max_tokens" && toolUses.length) {
      emit({ type: "error", code: "incomplete", message: "The recommendation was cut off (output too long). Please try again." });
      return;
    }

    if (toolUses.length === 0) {
      if (nudged) {
        emit({ type: "error", code: "incomplete", message: "The agent stopped without submitting recommendations." });
        return;
      }
      nudged = true;
      messages.push({ role: "assistant", content: msg.content });
      messages.push({ role: "user", content: "Please finish by calling submit_recommendations with your complete result." });
      continue;
    }

    messages.push({ role: "assistant", content: msg.content });
    const results: BetaToolResultBlockParam[] = [];
    let final: FinalResult | null = null;

    for (const tu of toolUses) {
      if (tu.name === "check_compatibility") {
        const parsed = CheckCompatibilityInput.safeParse(tu.input);
        if (!parsed.success) {
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Invalid input:\n${z.prettifyError(parsed.error)}` });
          continue;
        }
        const checks = checkCompatibility(parsed.data.parts, { wantsWifi: req.wifi, gaming });
        emit({ type: "compat", checks });
        results.push({ type: "tool_result", tool_use_id: tu.id, content: formatChecks(checks) });
      } else if (tu.name === "submit_recommendations") {
        const parsed = SubmitInput.safeParse(tu.input);
        if (!parsed.success) {
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Invalid input:\n${z.prettifyError(parsed.error)}` });
          continue;
        }
        const { problems, result } = await reviewSubmission(parsed.data, req, seen, maxBudget, gaming, emit);
        if (problems.length && rejections < MAX_REJECTIONS) {
          rejections++;
          emit({ type: "rejected", problems });
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: `Not accepted yet. Fix these problems and submit again:\n${problems.map((p) => `- ${p}`).join("\n")}`,
          });
        } else {
          if (problems.length) result.warnings.push(...problems.map((p) => `Unresolved check: ${p}`));
          final = result;
        }
      } else {
        results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Unknown tool ${tu.name}` });
      }
    }

    if (final) {
      emit({ type: "result", result: final });
      return;
    }
    messages.push({ role: "user", content: results });
  }

  emit({ type: "error", code: "incomplete", message: "The research took too many steps without finishing. Try again, perhaps with fewer constraints." });
}

function formatChecks(checks: CompatCheck[]): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const head = fails ? `${fails} FAIL, ${warns} WARN – fix the failures.` : warns ? `No failures, ${warns} WARN.` : "All checks passed.";
  return [head, ...checks.map((c) => `${c.status.toUpperCase()} ${c.rule}: ${c.message}`)].join("\n");
}

async function reviewSubmission(
  sub: SubmitT,
  req: BuildRequest,
  seen: Set<string>,
  maxBudget: number,
  gaming: boolean,
  emit: Emit,
): Promise<{ problems: string[]; result: FinalResult }> {
  const problems: string[] = [];

  if (req.buildType !== "prebuilt" && sub.builds.length === 0) problems.push("The customer wants a DIY build, but none was submitted.");
  if (req.buildType !== "diy" && sub.prebuilts.length === 0) problems.push("The customer wants prebuilt options, but none were submitted.");

  // Every listing we'd show, with a label for error messages.
  const listings: { label: string; category: string; listing: ListingT; primary: boolean }[] = [];
  sub.builds.forEach((b) =>
    b.parts.forEach((p) => {
      if (!p.listing && !p.owned) problems.push(`"${b.name}" / ${p.name}: missing listing (only owned parts may omit it).`);
      if (p.listing) listings.push({ label: `"${b.name}" / ${p.name}`, category: p.category, listing: p.listing, primary: true });
      p.alternatives?.forEach((a) => listings.push({ label: `"${b.name}" / ${p.name} (alternative)`, category: p.category, listing: a, primary: false }));
    }),
  );
  sub.prebuilts.forEach((p) => listings.push({ label: `Prebuilt "${p.name}"`, category: "prebuilt", listing: p.listing, primary: true }));
  sub.extras.forEach((e) => listings.push({ label: `Extra ${e.name}`, category: e.category, listing: e.listing, primary: true }));

  for (const { label, category, listing } of listings) {
    if (isBlocked(listing.url)) problems.push(`${label}: ${domainOf(listing.url)} is on the blocklist – use another seller.`);
    if (listing.credibility === "low") problems.push(`${label}: rated low credibility – replace it with a trustworthy seller.`);
    if (!conditionAllowed(req.condition, category, listing.condition)) {
      problems.push(`${label}: condition "${listing.condition}" isn't allowed by the customer's policy (${req.condition}).`);
    }
  }

  // Compatibility and budget per option.
  const extrasTotal = sub.extras.reduce((n, e) => n + e.listing.price_in_user_currency, 0);
  const buildChecks = sub.builds.map((b) => {
    const checks = checkCompatibility(b.parts, { wantsWifi: req.wifi, gaming });
    if (hasFailures(checks)) {
      problems.push(...checks.filter((c) => c.status === "fail").map((c) => `"${b.name}" compatibility – ${c.rule}: ${c.message}`));
    }
    return checks;
  });
  const buildTotals = sub.builds.map((b) => b.parts.reduce((n, p) => n + (p.owned || !p.listing ? 0 : p.listing.price_in_user_currency), 0));
  const prebuiltTotals = sub.prebuilts.map((p) => p.listing.price_in_user_currency);
  const overBudget = (name: string, total: number) => {
    if (total + extrasTotal > maxBudget) {
      problems.push(`"${name}" costs ${Math.round(total + extrasTotal)} ${req.currency} incl. extras – over the ${req.budget} ${req.currency} budget${req.budgetFlexible ? " (+10%)" : ""}.`);
    }
  };
  sub.builds.forEach((b, i) => overBudget(b.name, buildTotals[i]));
  sub.prebuilts.forEach((p, i) => overBudget(p.name, prebuiltTotals[i]));

  // Live link checks.
  const urls = listings.map((l) => l.listing.url);
  emit({ type: "verifying", count: new Set(urls).size });
  const statuses = await verifyLinks(urls, seen);
  for (const { label, listing, primary } of listings) {
    const st = statuses.get(listing.url);
    if (st === "broken") problems.push(`${label}: ${listing.url} is dead (404 / not found) – replace it.`);
    if (st === "ended" && primary) problems.push(`${label}: the listing at ${listing.url} has ended – find another offer.`);
    if (st === "unverified" && primary) {
      problems.push(`${label}: ${listing.url} never appeared in your search/fetch results and couldn't be checked – use the exact URL from a result, or fetch it to confirm.`);
    }
  }

  const verify = (l: ListingT): VerifiedListing => ({
    ...l,
    link_status: (statuses.get(l.url) ?? "unverified") as LinkStatus,
    source_type: sourceType(l.url),
    domain: domainOf(l.url),
  });

  const result: FinalResult = {
    overview: sub.overview,
    recommendation: sub.recommendation,
    builds: sub.builds.map((b, i) => ({
      ...b,
      parts: b.parts.map((p) => ({ ...p, listing: p.listing ? verify(p.listing) : undefined, alternatives: p.alternatives?.map(verify) })),
      total: buildTotals[i],
      checks: buildChecks[i],
    })),
    prebuilts: sub.prebuilts.map((p, i) => ({ ...p, listing: verify(p.listing), total: prebuiltTotals[i], checks: [] })),
    extras: sub.extras.map((e) => ({ ...e, listing: verify(e.listing) })),
    extrasTotal,
    warnings: [...sub.warnings],
    skipped_sources: sub.skipped_sources,
    currency: req.currency,
    budget: req.budget,
    targetFps: gaming ? req.targetFps : undefined,
    generatedAt: new Date().toISOString(),
  };

  return { problems: [...new Set(problems)], result };
}
