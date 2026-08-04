// ABOUTME: Table-driven tests for the StreamEntry → ACP session/update projection: every
// ABOUTME: stream-events variant, unknown types, and envelope-version gating.

import { describe, expect, test } from "bun:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { projectStreamEntry, type StreamEntry } from "../cli/core/acp/project-events";

function entry(fields: Record<string, unknown>): StreamEntry {
  return { v: 1, seq: 7, ts: 1722800000000, ...fields } as StreamEntry;
}

describe("projectStreamEntry", () => {
  const cases: Array<{ name: string; input: StreamEntry; expected: SessionUpdate[] }> = [
    {
      name: "text.delta becomes agent_message_chunk",
      input: entry({ type: "text.delta", text: "hello" }),
      expected: [
        { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } },
      ],
    },
    {
      name: "reasoning.delta becomes agent_thought_chunk",
      input: entry({ type: "reasoning.delta", text: "thinking…" }),
      expected: [
        { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking…" } },
      ],
    },
    {
      name: "tool.call becomes an in_progress tool_call with rawInput",
      input: entry({ type: "tool.call", toolCallId: "t1", toolName: "search", args: { q: "x" } }),
      expected: [
        {
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          title: "search",
          status: "in_progress",
          rawInput: { q: "x" },
        },
      ],
    },
    {
      name: "tool.result becomes a completed tool_call_update with rawOutput",
      input: entry({ type: "tool.result", toolCallId: "t1", result: { hits: 3 } }),
      expected: [
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          status: "completed",
          rawOutput: { hits: 3 },
        },
      ],
    },
    {
      name: "step is dropped in v1 (usage rides a goose-private method, not ACP)",
      input: entry({ type: "step", finishReason: "stop", usage: { totalTokens: 10 } }),
      expected: [],
    },
    {
      name: "agent.completed produces no update (it resolves the prompt)",
      input: entry({ type: "agent.completed", finishReason: "stop" }),
      expected: [],
    },
    {
      name: "agent.failed produces no update (it errors the prompt)",
      input: entry({ type: "agent.failed", error: "boom" }),
      expected: [],
    },
    {
      name: "unknown event types are dropped",
      input: entry({ type: "something.future", payload: 1 }),
      expected: [],
    },
    {
      name: "unknown envelope versions are dropped entirely",
      input: entry({ v: 2, type: "text.delta", text: "future" }),
      expected: [],
    },
  ];

  for (const { name, input, expected } of cases) {
    test(name, () => {
      expect(projectStreamEntry(input)).toEqual(expected);
    });
  }

  test("mapping is per-entry and order-independent: a gap in seq changes nothing", () => {
    const early = entry({ seq: 3, type: "text.delta", text: "a" });
    const late = entry({ seq: 900, type: "text.delta", text: "b" });
    expect(projectStreamEntry(late)).toEqual([
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "b" } },
    ]);
    expect(projectStreamEntry(early)).toEqual([
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "a" } },
    ]);
  });

  test("missing text on a delta produces no update rather than an empty chunk", () => {
    expect(projectStreamEntry(entry({ type: "text.delta" }))).toEqual([]);
  });
});
