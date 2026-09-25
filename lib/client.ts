import type { AgentEvent, BuildRequest } from "./types";

/** POST the questionnaire and feed each server-sent event to `onEvent`. */
export async function streamBuild(
  body: { request: BuildRequest; demo?: boolean; accessCode?: string },
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => null);
    onEvent({ type: "error", code: "api_error", message: detail?.error ?? `Request failed (${res.status})` });
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as AgentEvent);
        } catch {
          // ignore a malformed line rather than killing the stream
        }
      }
    }
  }
}
