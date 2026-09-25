import Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "@/lib/agent";
import { runDemo } from "@/lib/demo";
import { BuildRequestSchema } from "@/lib/request";
import type { AgentEvent } from "@/lib/types";

// A research run takes a few minutes; let hosts that honour this keep it alive.
export const maxDuration = 800;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { request?: unknown; demo?: boolean; accessCode?: string } | null;
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

      try {
        const accessCode = process.env.RIGSCOUT_ACCESS_CODE;
        if (body?.demo) {
          await runDemo(parsed.data, emit, request.signal);
        } else if (accessCode && body?.accessCode !== accessCode) {
          emit({ type: "error", code: "access_denied", message: "This RigScout instance needs an access code." });
        } else if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
          emit({
            type: "error",
            code: "no_api_key",
            message: "No Anthropic API key configured. Add ANTHROPIC_API_KEY to .env.local and restart the server, or try the demo.",
          });
        } else {
          await runAgent(parsed.data, emit, request.signal);
        }
      } catch (err) {
        if (request.signal.aborted) {
          // Browser went away; nothing to report.
        } else if (err instanceof Anthropic.AuthenticationError) {
          emit({ type: "error", code: "no_api_key", message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." });
        } else if (err instanceof Anthropic.RateLimitError) {
          emit({ type: "error", code: "api_error", message: "Rate limited by the Anthropic API. Wait a minute and try again." });
        } else if (err instanceof Anthropic.APIError) {
          emit({ type: "error", code: "api_error", message: `Anthropic API error ${err.status ?? ""}: ${err.message}` });
        } else {
          console.error(err);
          emit({ type: "error", code: "api_error", message: "Something went wrong during research. Please try again." });
        }
      } finally {
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
