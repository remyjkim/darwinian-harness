// ABOUTME: Proves the narrow Buzz delivery wrapper uses argv plus stdin and redacts failures.
// ABOUTME: Only send and threaded-reply operations can be constructed.

import { describe, expect, test } from "bun:test";
import { executeBuzzDelivery, type BuzzCommandExecutor } from "../cli/core/buzz-tools";

describe("Buzz delivery wrapper", () => {
  test("sends content through stdin with an argv-only command", async () => {
    const calls: Array<{ argv: string[]; stdin: string }> = [];
    const executor: BuzzCommandExecutor = async (argv, stdin) => {
      calls.push({ argv, stdin });
      return { exitCode: 0, stdout: "event_123\n", stderr: "" };
    };

    const result = await executeBuzzDelivery({
      channel: "550e8400-e29b-41d4-a716-446655440000",
      content: "hello; $(do-not-run)",
    }, executor);

    expect(calls).toEqual([{
      argv: [
        "buzz", "messages", "send",
        "--channel", "550e8400-e29b-41d4-a716-446655440000",
        "--content", "-",
      ],
      stdin: "hello; $(do-not-run)",
    }]);
    expect(result).toEqual({ ok: true, receipt: "event_123" });
  });

  test("adds a reply target only for threaded delivery", async () => {
    const calls: string[][] = [];
    await executeBuzzDelivery({
      channel: "550e8400-e29b-41d4-a716-446655440000",
      replyTo: "a".repeat(64),
      content: "reply",
    }, async (argv) => {
      calls.push(argv);
      return { exitCode: 0, stdout: "sent", stderr: "" };
    });
    expect(calls[0]).toEqual([
      "buzz", "messages", "send",
      "--channel", "550e8400-e29b-41d4-a716-446655440000",
      "--content", "-",
      "--reply-to", "a".repeat(64),
    ]);
  });

  test("does not return stderr or content when Buzz fails", async () => {
    const result = await executeBuzzDelivery({ channel: "550e8400-e29b-41d4-a716-446655440000", content: "secret content" }, async () => ({
      exitCode: 7,
      stdout: "",
      stderr: "BUZZ_PRIVATE_KEY=should-never-leak secret content",
    }));
    expect(result).toEqual({ ok: false, error: "Buzz delivery failed with exit code 7" });
    expect(JSON.stringify(result)).not.toContain("secret content");
    expect(JSON.stringify(result)).not.toContain("BUZZ_PRIVATE_KEY");
  });

  test("rejects empty channel, content, or reply target before execution", async () => {
    let calls = 0;
    const executor: BuzzCommandExecutor = async () => {
      calls += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    await expect(executeBuzzDelivery({ channel: "", content: "x" }, executor)).rejects.toThrow("channel");
    await expect(executeBuzzDelivery({ channel: "not-a-uuid", content: "x" }, executor)).rejects.toThrow("UUID");
    await expect(executeBuzzDelivery({ channel: "550e8400-e29b-41d4-a716-446655440000", content: "" }, executor)).rejects.toThrow("content");
    await expect(executeBuzzDelivery({ channel: "550e8400-e29b-41d4-a716-446655440000", content: "x", replyTo: "" }, executor)).rejects.toThrow("replyTo");
    await expect(executeBuzzDelivery({ channel: "550e8400-e29b-41d4-a716-446655440000", content: "x", replyTo: "not-an-event" }, executor)).rejects.toThrow("Nostr event id");
    await expect(executeBuzzDelivery({ channel: "550e8400-e29b-41d4-a716-446655440000", content: "🙂".repeat(20_000) }, executor)).rejects.toThrow("65536-byte limit");
    expect(calls).toBe(0);
  });
});
