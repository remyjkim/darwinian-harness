// ABOUTME: Verifies read-only hook policy selection and target hook-shape planning.
// ABOUTME: Keeps launch contexts and ordinary write on one consent and composer-input contract.

import { expect, test } from "bun:test";
import type { CardLockEntry } from "../cli/core/card-lock";

function card(consented: boolean): CardLockEntry {
  return {
    name: "@test/policy",
    requested: "@test/policy@1.0.0",
    version: "1.0.0",
    path: "/locked/policy",
    integrity: "sha256-policy",
    manifest: { name: "@test/policy", version: "1.0.0" },
    skills: [],
    hooks: ["guard"],
    ...(consented ? { hookConsent: { consentedAt: "2026-08-24T00:00:00.000Z", consentedRange: "^1.0.0" } } : {}),
    registry: null,
    origin: "file",
  };
}

test("one hook planner selects consented qualified policies and renders target-native configs", async () => {
  const hooks = await import("../cli/core/hook-generator/sync-hooks") as typeof import("../cli/core/hook-generator/sync-hooks") & {
    planHookPolicies?: (input: {
      cards: CardLockEntry[];
      exclusions: Set<string>;
      strictHooks: boolean;
      contentRootsByCard?: Record<string, string>;
    }) => { policies: Array<{ cardName: string; policyName: string; policyTsPath: string }>; warnings: string[] };
    renderClaudeHookConfig?: (path: string) => unknown;
    renderCodexHookConfig?: (path: string) => unknown;
  };
  expect(typeof hooks.planHookPolicies).toBe("function");
  expect(typeof hooks.renderClaudeHookConfig).toBe("function");
  expect(typeof hooks.renderCodexHookConfig).toBe("function");

  const plan = hooks.planHookPolicies!({
    cards: [card(true)],
    exclusions: new Set(),
    strictHooks: false,
    contentRootsByCard: { "@test/policy": "/content/policy" },
  });

  expect(plan).toEqual({
    policies: [{ cardName: "@test/policy", policyName: "guard", policyTsPath: "/content/policy/hooks/guard/policy.ts" }],
    warnings: [],
  });
  expect(hooks.renderClaudeHookConfig!("/context/composer.mjs")).toMatchObject({
    PreToolUse: [{ matcher: ".*", hooks: [{ command: "node", args: ["/context/composer.mjs"] }] }],
  });
  expect(hooks.renderCodexHookConfig!("/context/composer.mjs")).toMatchObject({
    hooks: { PreToolUse: [{ matcher: ".*", hooks: [{ command: expect.stringContaining("/context/composer.mjs") }] }] },
  });
});

test("hook planner warns or strict-fails before returning unconsented policy code", async () => {
  const hooks = await import("../cli/core/hook-generator/sync-hooks") as any;
  const input = { cards: [card(false)], exclusions: new Set(), strictHooks: false };

  expect(hooks.planHookPolicies(input)).toMatchObject({ policies: [], warnings: [expect.stringContaining("missing or out-of-range")] });
  expect(() => hooks.planHookPolicies({ ...input, strictHooks: true })).toThrow(/missing or out-of-range/i);
});
