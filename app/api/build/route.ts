import Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "@/lib/agent";
import { runDemo } from "@/lib/demo";
import { BuildRequestSchema } from "@/lib/request";
import type { AgentEvent } from "@/lib/types";

// A research run takes a few minutes; let hosts that honour this keep it alive.
export const maxDuration = 800;

// Every real run costs money, so bound how many run at once (per server instance).
const MAX_CONCURRENT_RUNS = Number(process.env.RIGSCOUT_MAX_CONCURRENT) || 2;
let activeRuns = 0;

/** Turns an Anthropic API error into something a first-time user can act on. */
function describeApiError(err: InstanceType<typeof Anthropic.APIError>): { message: string; code: "no_api_key" | "api_error" } {
  const body = err.error as { error?: { message?: string; details?: { error_code?: string } } } | undefined;
  const detail = body?.error?.message ?? err.message;
  const ref = err.requestID ? ` (request ${err.requestID})` : "";
  const lower = detail.toLowerCase();

  if (body?.error?.details?.error_code === "enforced_spend_limit_reached" || /spend limit|usage limit/.test(lower)) {
    return { code: "api_error", message: `Your Anthropic spend limit is reached. Raise it in the Console (Settings → Limits); retrying won't help until then.${ref}` };
  }
  if (/credit balance|billing/.test(lower)) {
    return { code: "api_error", message: `Your Anthropic account has no credits. Add some under Billing in the Anthropic Console, then try again.${ref}` };
  }
  if (/web search|web_search|web fetch|web_fetch/.test(lower) && /not enabled|disabled/.test(lower)) {
    return { code: "api_error", message: `Web search is turned off for your Anthropic organization. An admin can enable it in the Console privacy settings.${ref}` };
  }
  if (err.status === 404) {
    return { code: "api_error", message: `The model was not found. Check RIGSCOUT_MODEL in .env.local. ${detail}${ref}` };
  }
  if (err.status === 429) {
    return { code: "api_error", message: `Rate limited by the Anthropic API (new accounts have low limits). Wait a minute and try again, or use RIGSCOUT_EFFORT=medium.${ref}` };
  }
  return { code: "api_error", message: `Anthropic API error${err.status ? ` ${err.status}` : ""}: ${detail}${ref}` };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { request?: unknown; demo?: boolean } | null;
  const parsed = BuildRequestSchema.safeParse(body?.request);
  if (!parsed.success) {
    return Response.json({ error: "Invalid questionnaire", issues: parsed.error.issues }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };
      const emit = (e: AgentEvent) => send(`data: ${JSON.stringify(e)}\n\n`);
      // Searches can go quiet for a while; keep proxies from closing the connection.
      const ping = setInterval(() => send(": ping\n\n"), 15000);

      let counted = false;
      try {
        if (body?.demo) {
          await runDemo(parsed.data, emit, request.signal);
        } else if (activeRuns >= MAX_CONCURRENT_RUNS) {
          emit({ type: "error", code: "api_error", message: "RigScout is busy with other searches. Try again in a few minutes." });
        } else if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
          emit({
            type: "error",
            code: "no_api_key",
            message: "No Anthropic API key configured. Add ANTHROPIC_API_KEY to .env.local and restart the server, or try the demo.",
          });
        } else {
          activeRuns++;
          counted = true;
          await runAgent(parsed.data, emit, request.signal);
        }
      } catch (err) {
        if (request.signal.aborted) {
          // Browser went away; nothing to report.
        } else if (err instanceof Anthropic.AuthenticationError) {
          emit({ type: "error", code: "no_api_key", message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." });
        } else if (err instanceof Anthropic.APIError) {
          const { code, message } = describeApiError(err);
          emit({ type: "error", code, message });
        } else {
          console.error(err);
          emit({ type: "error", code: "api_error", message: err instanceof Error && err.message.startsWith("RIGSCOUT_") ? err.message : "Something went wrong during research. Please try again." });
        }
      } finally {
        if (counted) activeRuns--;
        clearInterval(ping);
        emit({ type: "done" });
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by a disconnect
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
