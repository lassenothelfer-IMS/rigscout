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

// USD per million tokens, for the running cost estimate and the spend cap.
// Only models that support this request shape (adaptive thinking, effort, the
// 20260209 web tools, server-side fallbacks) belong here; anything else is
// refused up front instead of failing with a 400 mid-run.
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};
const SEARCH_COST_USD = 0.01;

const MODEL = process.env.RIGSCOUT_MODEL || "claude-opus-5";
if (!(MODEL in PRICING)) {
  throw new Error(`RIGSCOUT_MODEL "${MODEL}" is not supported. Use one of: ${Object.keys(PRICING).join(", ")}.`);
}
const EFFORT = (process.env.RIGSCOUT_EFFORT || "high") as "low" | "medium" | "high" | "xhigh" | "max";

const MAX_REQUESTS = 25; // API calls per run, incl. pause_turn continuations
const MAX_REJECTIONS = 3; // times submit_recommendations may bounce before we accept with warnings
const MAX_TRANSIENT_RETRIES = 3;
// Run-wide limits. max_uses on the web tools only bounds one API request, and a run makes many,
// so these are what actually cap a run. At the soft limit the agent is told to wrap up;
// at 1.5x the run is stopped.
const MAX_COST_USD = Number(process.env.RIGSCOUT_MAX_COST_USD) || 6;
const MAX_SEARCHES = Number(process.env.RIGSCOUT_MAX_SEARCHES) || 60;
const MAX_PROMPT_TOKENS = 500_000; // history is re-read on every request; stay well inside the 1M window
const HARD_LIMIT_FACTOR = 1.5;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Temporary failures worth retrying in place: overloaded/api_error (also as mid-stream SSE errors), 5xx, dropped connections, plain rate limits. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError) || err instanceof Anthropic.APIUserAbortError) return false;
  if (err instanceof Anthropic.APIConnectionError) return true;
  const body = err.error as { error?: { type?: string; details?: { error_code?: string } } } | undefined;
  if (body?.error?.details?.error_code === "enforced_spend_limit_reached") return false; // lasts until the limit is raised
  const type = body?.error?.type;
  if (err.status === undefined) return type === "overloaded_error" || type === "api_error";
  return err.status === 429 || err.status === 529 || err.status >= 500;
}

type Emit = (e: AgentEvent) => void;

function buildTools(req: BuildRequest): BetaToolUnion[] {
  const region = getRegion(req.country);
  return [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 20,
      blocked_domains: BLOCKED_DOMAINS,
      user_location: region
        ? { type: "approximate", country: region.code, timezone: region.timezone, ...(req.city.trim() ? { city: req.city.trim() } : {}) }
        : undefined,
    },
    {
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_uses: 12,
      blocked_domains: BLOCKED_DOMAINS,
      max_content_tokens: 8000,
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
  let transientRetries = 0;
  let nudged = false;
  let promptTokens = 0; // size of the most recent request's prompt
  let wrapUpSent = false;

  const addUsage = (u: BetaMessage["usage"]) => {
    usage.input += u.input_tokens;
    usage.output += u.output_tokens;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.searches += u.server_tool_use?.web_search_requests ?? 0;
    usage.fetches += u.server_tool_use?.web_fetch_requests ?? 0;
    promptTokens = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  };

  const cost = () => {
    const price = PRICING[MODEL];
    return (
      ((usage.input + usage.cacheWrite * 1.25) * price.input + usage.cacheRead * price.cacheRead + usage.output * price.output) / 1e6 +
      usage.searches * SEARCH_COST_USD
    );
  };

  const emitUsage = () => {
    const costUsd = cost();
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
        } else {
          emit({ type: "status", message: `A web search failed (${block.content.error_code}).` });
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
          emit({ type: "status", message: `A page could not be fetched (${block.content.error_code}).` });
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

    const spent = cost();
    if (spent >= MAX_COST_USD * HARD_LIMIT_FACTOR || usage.searches >= MAX_SEARCHES * HARD_LIMIT_FACTOR) {
      emit({
        type: "error",
        code: "incomplete",
        message: `Stopped at the spending limit (~$${spent.toFixed(2)}) before the agent finished. Try again with fewer constraints, or raise RIGSCOUT_MAX_COST_USD.`,
      });
      return;
    }
    const overSoftLimit = spent >= MAX_COST_USD || usage.searches >= MAX_SEARCHES || promptTokens >= MAX_PROMPT_TOKENS || step >= MAX_REQUESTS - 4;
    if (overSoftLimit && !wrapUpSent) {
      // Tell the agent to stop researching. Needs a user turn to attach to; after a
      // pause_turn the last message is the assistant's, so try again next iteration.
      const last = messages[messages.length - 1];
      if (last?.role === "user") {
        const note = {
          type: "text" as const,
          text: "Research budget reached. Do not search or fetch any more. Call submit_recommendations now with the best-supported result you have, and mention in warnings anything you could not verify.",
        };
        last.content = typeof last.content === "string" ? [{ type: "text", text: last.content }, note] : [...last.content, note];
        wrapUpSent = true;
        emit({ type: "status", message: "Research budget reached, asking the agent to wrap up." });
      }
    }

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
      if (signal.aborted) throw err;
      // Whatever this failed turn already ran was billed; count it before retrying.
      const partial = stream.currentMessage;
      stream.abort();
      if (partial) {
        addUsage(partial.usage);
        emitUsage();
      }
      if (isTransient(err) && transientRetries < MAX_TRANSIENT_RETRIES) {
        const wait = 5000 * 3 ** transientRetries++; // 5s, 15s, 45s
        emit({ type: "status", message: `Anthropic is busy, retrying in ${wait / 1000}s…` });
        await sleep(wait, signal);
        continue;
      }
      // Eager input streaming can yield tool input that isn't parseable JSON;
      // re-issue that turn. Real API errors propagate.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      emit({ type: "status", message: "A step came back garbled, retrying it." });
      continue;
    }
    transientRetries = 0;

    addUsage(msg.usage);
    emitUsage();

    if (msg.stop_reason === "refusal") {
      emit({ type: "error", code: "api_error", message: "The model declined to continue this request." });
      return;
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }

    // Anything but a normal end or a tool call (max_tokens, context window exceeded, ...) can leave
    // half-finished blocks that would make the next request a 400, so stop instead of nudging.
    if (msg.stop_reason !== "end_turn" && msg.stop_reason !== "tool_use") {
      emit({
        type: "error",
        code: "incomplete",
        message:
          msg.stop_reason === "max_tokens"
            ? "The agent's answer was cut off (output too long). Please try again."
            : `The agent stopped early (${msg.stop_reason}). Please try again.`,
      });
      return;
    }
    const toolUses = msg.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");

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
        const { problems, result } = await reviewSubmission(parsed.data, req, seen, maxBudget, gaming, emit, signal);
        if (signal.aborted) return;
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
  signal: AbortSignal,
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
  const statuses = await verifyLinks(urls, seen, signal);
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
