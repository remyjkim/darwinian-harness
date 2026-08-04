// ABOUTME: Pure projection from Deploy API StreamEntry events onto ACP session/update payloads.
// ABOUTME: Per-entry and order-independent; unknown types and envelope versions project to nothing.

import type { SessionUpdate } from "@agentclientprotocol/sdk";

/**
 * One entry from GET /api/minds/:slug/chat/:runId/stream-poll. Mirrors the wire shape of
 * stream-protocol's StreamEventSchema: a `{v, seq, ts}` envelope around a typed event with
 * passthrough fields. `v` gates compatibility; consumers ignore entries they cannot read.
 */
export interface StreamEntry {
  v: number;
  seq: number;
  ts: number;
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  [key: string]: unknown;
}

const SUPPORTED_ENVELOPE_VERSION = 1;

export function projectStreamEntry(entry: StreamEntry): SessionUpdate[] {
  if (entry.v !== SUPPORTED_ENVELOPE_VERSION) return [];
  switch (entry.type) {
    case "text.delta":
      if (typeof entry.text !== "string" || entry.text.length === 0) return [];
      return [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: entry.text } }];
    case "reasoning.delta":
      if (typeof entry.text !== "string" || entry.text.length === 0) return [];
      return [{ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: entry.text } }];
    case "tool.call":
      if (typeof entry.toolCallId !== "string") return [];
      return [
        {
          sessionUpdate: "tool_call",
          toolCallId: entry.toolCallId,
          title: typeof entry.toolName === "string" ? entry.toolName : entry.toolCallId,
          status: "in_progress",
          rawInput: entry.args,
        },
      ];
    case "tool.result":
      if (typeof entry.toolCallId !== "string") return [];
      return [
        {
          sessionUpdate: "tool_call_update",
          toolCallId: entry.toolCallId,
          status: "completed",
          rawOutput: entry.result,
        },
      ];
    default:
      // step, agent.completed, agent.failed, and unknown types carry no session/update:
      // terminal events resolve the prompt in the session layer, and usage has no ACP
      // vehicle Buzz reads (its usage rides a goose-private method).
      return [];
  }
}
