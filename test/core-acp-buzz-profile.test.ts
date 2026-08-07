// ABOUTME: Locks Buzz ACP client detection and delivery-tool result correlation.
// ABOUTME: Failed, mismatched, and non-delivery tool results never satisfy delivery.

import { describe, expect, test } from "bun:test";
import {
  BuzzDeliveryTracker,
  createBuzzClientProfile,
} from "../cli/core/acp/buzz-profile";
import type { StreamEntry } from "../cli/core/acp/project-events";

function event(input: Record<string, unknown> & { type: string }): StreamEntry {
  return { v: 1, seq: 1, ts: 1, ...input };
}

describe("Buzz ACP profile", () => {
  test("matches only Buzz's exact initialize client name", () => {
    const profile = createBuzzClientProfile();

    profile.observeInitialize({ clientInfo: { name: "buzz-acp", version: "0.5.5" } });
    expect(profile.isBuzz()).toBe(true);

    profile.observeInitialize({ clientInfo: { name: "Buzz ACP", version: "0.5.5" } });
    expect(profile.isBuzz()).toBe(true);
  });

  test("does not infer Buzz when initialize omits clientInfo", () => {
    const profile = createBuzzClientProfile();
    profile.observeInitialize({ protocolVersion: 1 });
    profile.observeInitialize({ clientInfo: { name: "buzz-acp", version: "0.5.5" } });
    expect(profile.isBuzz()).toBe(false);
  });
});

describe("Buzz delivery tracker", () => {
  test.each(["buzz_messages_send", "buzz_messages_thread"])(
    "requires a correlated successful result for %s",
    (toolName) => {
      const tracker = new BuzzDeliveryTracker();
      tracker.observe(event({ type: "tool.call", toolCallId: "call_1", toolName }));
      expect(tracker.delivered).toBe(false);

      tracker.observe(event({
        type: "tool.result",
        toolCallId: "call_1",
        result: { content: [{ type: "text", text: "sent" }], isError: false },
      }));
      expect(tracker.delivered).toBe(true);
    },
  );

  test("failed, mismatched, and unrelated results do not satisfy delivery", () => {
    const tracker = new BuzzDeliveryTracker();
    tracker.observe(event({ type: "tool.call", toolCallId: "call_1", toolName: "buzz_messages_send" }));
    tracker.observe(event({ type: "tool.result", toolCallId: "other", result: { isError: false } }));
    tracker.observe(event({ type: "tool.result", toolCallId: "call_1" }));
    tracker.observe(event({ type: "tool.result", toolCallId: "call_1", result: { isError: true } }));
    tracker.observe(event({ type: "tool.result", toolCallId: "call_1", result: { isError: false } }));
    tracker.observe(event({ type: "tool.call", toolCallId: "call_2", toolName: "unrelated_tool" }));
    tracker.observe(event({ type: "tool.result", toolCallId: "call_2", result: { isError: false } }));
    expect(tracker.delivered).toBe(false);
  });
});
