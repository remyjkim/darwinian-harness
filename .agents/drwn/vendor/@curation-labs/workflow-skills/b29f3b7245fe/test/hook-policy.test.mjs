// ABOUTME: Tests for the org-conventions hook policy.
// ABOUTME: Verifies the policy fires on Skill tool calls and injects the correct additionalContext.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARD_ROOT } from "./helpers.mjs";

const POLICY_PATH = join(CARD_ROOT, "hooks", "org-conventions", "policy.ts");

/**
 * Read the policy.ts source and evaluate its decision logic.
 * Since the policy imports from "darwinian/hook-policy" (which is only available
 * in a drwn environment), we test the decision logic by:
 * 1. Verifying the source has the correct structure (matcher, policyKind, beforeToolCall).
 * 2. Extracting the additionalContext string and asserting its content.
 * 3. If the drwn package is resolvable, dynamically import and test the actual function.
 */

describe("hook policy source structure", () => {
  it("policy.ts exists", () => {
    assert.ok(existsSync(POLICY_PATH), "hooks/org-conventions/policy.ts must exist");
  });

  it("uses observer policyKind (never blocks Skill calls)", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /policyKind:\s*["']observer["']/.test(src),
      "policy must use 'observer' kind so throw/timeout never blocks Skill calls",
    );
  });

  it("matches the Skill tool", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /matcher:\s*["']Skill["']/.test(src),
      'matcher must be "Skill" to fire on every Skill tool invocation',
    );
  });

  it("defines a beforeToolCall function", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /beforeToolCall/.test(src),
      "must define beforeToolCall to inject context on skill load",
    );
  });

  it("returns an allow decision with additionalContext", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /action:\s*["']allow["']/.test(src),
      'must return action: "allow" (never deny or ask)',
    );
    assert.ok(
      /additionalContext/.test(src),
      "must return additionalContext with the convention override message",
    );
  });
});

describe("hook policy additionalContext content", () => {
  it("mentions .ai/rules/ as the convention source", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /\.ai\/rules/.test(src),
      "additionalContext must reference .ai/rules/ as the convention source",
    );
  });

  it("mentions the clNNNN grammar for doc/plan paths", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /clNNNN/.test(src),
      "additionalContext must mention the clNNNN_ doc/plan naming grammar",
    );
  });

  it("mentions commit prefixes from repo-wide/01_git_conventions.md", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /git.conventions|commit.prefix/i.test(src),
      "additionalContext must point to the commit prefix table",
    );
  });

  it("mentions pnpm test commands from repo-wide/02_test_stack.md", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /pnpm.*test|test.stack/i.test(src),
      "additionalContext must point to the pnpm test commands",
    );
  });

  it("states that rules win when skills conflict", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.ok(
      /rules\s+win|rules\s+take\s+precedence/i.test(src),
      "additionalContext must state that .ai/rules/ overrides skill conventions",
    );
  });

  it("injects the workflow v0.4 state contract", () => {
    const src = readFileSync(POLICY_PATH, "utf8");
    assert.match(src, /read its generated ID and rewrite the title as \[I<N>\]/);
    assert.match(src, /Owner Status and Reviewer Status move independently/);
    assert.match(src, /earliest ready, unapproved gate/);
    assert.match(src, /Owner Status = Received/);
    assert.match(src, /Owner alert\/inbox, not a work phase/);
    assert.match(src, /tracker property, issue Status table, and newest-first Issue Thread/);
    assert.match(src, /actual Notion user mentions for both endpoints/);
    assert.match(src, /Owner and Reviewer properties/);
    assert.match(src, /Slack is an alert channel, not workflow state/);
  });
});

describe("hook policy decision evaluation", () => {
  // Attempt to dynamically import the actual policy. This works if drwn is on the
  // module resolution path (e.g. in a drwn-generated environment). If not, we fall
  // back to source-level assertions (which the tests above already cover).
  let policy = null;

  before(async () => {
    try {
      // The policy imports "darwinian/hook-policy" — try resolving it via the drwn repo.
      // This will only work in environments where drwn is installed/linked.
      const module = await import(POLICY_PATH);
      policy = module.default;
    } catch {
      // Expected in non-drwn environments. Source-level tests cover the logic.
      policy = null;
    }
  });

  it("returns an allow decision with additionalContext for a Skill tool call", async () => {
    if (!policy) return; // skip in non-drwn environments
    const event = {
      runtime: "claude-code",
      phase: "pre-tool",
      toolName: "Skill",
      input: { skill: "test-driven-development" },
    };
    const decision = await policy.beforeToolCall?.(event);
    assert.ok(decision, "beforeToolCall must return a decision");
    assert.equal(decision.action, "allow");
    assert.ok(decision.additionalContext, "decision must include additionalContext");
    assert.ok(/\.ai\/rules/.test(decision.additionalContext));
  });

  it("does not fire on non-Skill tools", async () => {
    if (!policy || !policy.matcher) return;
    const matches = (toolName) => new RegExp(policy.matcher).test(toolName);
    assert.ok(matches("Skill"), 'should match "Skill"');
    assert.ok(!matches("Read"), 'should not match "Read"');
    assert.ok(!matches("Bash"), 'should not match "Bash"');
  });
});
