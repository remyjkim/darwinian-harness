// ABOUTME: Verifies additive capability subtraction and fail-closed identity conflicts.
// ABOUTME: Freezes shared/identical omission before target renderers consume the delta.

import { expect, test } from "bun:test";

const digest = (char: string) => `sha256-${char.repeat(64)}`;
const loadDelta = async () => await import("../cli/core/worker-launch-context/capability-delta").catch(() => ({} as any));

test("capability delta omits identical base IDs and preserves sorted assigned-only capabilities", async () => {
  const delta = await loadDelta();
  expect(typeof delta.computeWorkerCapabilityDelta).toBe("function");

  const result = delta.computeWorkerCapabilityDelta({
    kind: "skill",
    base: [{ id: "shared", identityHash: digest("a") }],
    assigned: [
      { id: "review", identityHash: digest("b") },
      { id: "shared", identityHash: digest("a") },
    ],
  });

  expect(result.map((entry: { id: string }) => entry.id)).toEqual(["review"]);
});

test("capability delta fails with a surface-specific code when an assigned ID would override the base", async () => {
  const delta = await loadDelta();
  expect(() => delta.computeWorkerCapabilityDelta({
    kind: "mcp",
    base: [{ id: "context7", identityHash: digest("a") }],
    assigned: [{ id: "context7", identityHash: digest("b") }],
  })).toThrow(expect.objectContaining({ code: "LAUNCH_MCP_CONFLICT" }));
  expect(() => delta.computeWorkerCapabilityDelta({
    kind: "skill",
    base: [{ id: "review", identityHash: digest("a") }],
    assigned: [{ id: "review", identityHash: digest("b") }],
  })).toThrow(expect.objectContaining({ code: "LAUNCH_SKILL_CONFLICT" }));
});
