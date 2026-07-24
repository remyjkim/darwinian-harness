// ABOUTME: Shared helpers for reading a chat run from the Deploy API (I65 Fix 4).
// ABOUTME: Wraps the runId-addressed poll route, transcript text projection, and the console URL.

import type { AgentsContext } from "../context";
import { fetchJsonWithWorkerAuth } from "./worker-http";

/** One transcript event as returned by `GET /api/chat/:runId/poll`. */
export interface RunTranscriptEvent {
  seq: number;
  kind: string;
  thought?: string;
  text?: string;
  output?: unknown;
  [key: string]: unknown;
}

/** The poll route's response: engine run status + transcript slice since `since`. */
export interface RunPollResponse {
  status: string;
  result?: unknown;
  lastSeq: number;
  events: RunTranscriptEvent[];
  [key: string]: unknown;
}

/** The console page for a conversation — same-origin with the Deploy API. */
export function runWebUrl(apiBaseUrl: string, runId: string): string {
  return `${apiBaseUrl}/c/${encodeURIComponent(runId)}`;
}

/** A run no longer making progress: done, failed, or unknown (mirrors engine isTerminalRunStatus + yielded). */
export function isSettledRunStatus(status: string): boolean {
  return status !== "running";
}

/**
 * Coerce a worker_result `output` into display text — mirrors the console's
 * projector: `{text}` plain-prose, `{result}` structured, `{error}` failure,
 * JSON dump fallback.
 */
export function coerceWorkerText(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.result === "string") return o.result;
    if (typeof o.error === "string") return `Error: ${o.error}`;
    return JSON.stringify(output);
  }
  return output == null ? "" : String(output);
}

/**
 * The user-visible text of one transcript event, or null when the event is not
 * a display bubble (the user's own message, unknown kinds).
 */
export function transcriptEventText(event: RunTranscriptEvent): string | null {
  if (event.kind === "orchestrator_turn" && typeof event.thought === "string" && event.thought.trim()) {
    return event.thought;
  }
  if (event.kind === "worker_result") {
    const text = coerceWorkerText(event.output).trim();
    return text ? text : null;
  }
  return null;
}

/** Fetch one poll frame for a run (status + transcript events after `since`). */
export async function pollRunOnce(
  context: Pick<AgentsContext, "agentsDir">,
  apiBaseUrl: string,
  runId: string,
  since: number,
): Promise<{ response: Response; body: RunPollResponse }> {
  return fetchJsonWithWorkerAuth<RunPollResponse>(
    context,
    `${apiBaseUrl}/api/chat/${encodeURIComponent(runId)}/poll?since=${since}`,
  );
}

/** Human-readable failure text from a terminal `result` payload. */
export function describeRunFailure(result: unknown): string {
  if (result && typeof result === "object" && typeof (result as { error?: unknown }).error === "string") {
    return (result as { error: string }).error;
  }
  if (typeof result === "string" && result.trim()) return result;
  return result == null ? "unknown failure" : JSON.stringify(result);
}
