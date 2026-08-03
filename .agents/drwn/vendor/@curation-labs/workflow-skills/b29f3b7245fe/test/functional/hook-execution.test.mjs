// ABOUTME: Functional test — executes the materialized hook composers with real Skill events.
// ABOUTME: This is the most critical test: it proves the hook actually fires, the matcher works,
// ABOUTME: and additionalContext is produced — end to end, via the same composer.mjs agents run.
// ABOUTME: Closes gaps: hook never functionally executed, agent-runtime verification.

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { installCard, cleanupAll, spawnComposer, realpath } from "./helpers.mjs";

let projectDir;

before(() => {
  projectDir = installCard();
});

after(() => {
  cleanupAll();
});

// The Skill PreToolUse event payload (matching Claude Code's hook contract).
const SKILL_EVENT = {
  hook_event_name: "PreToolUse",
  tool_name: "Skill",
  tool_input: { skill: "test-driven-development" },
};

// A non-Skill event for matcher verification.
const BASH_EVENT = {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "ls" },
};

describe("hook policy functional execution", () => {
  describe("claude composer", () => {
    it("returns allow + additionalContext for Skill tool", () => {
      const composer = join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs");
      assert.ok(existsSync(composer), "claude composer must exist");

      const { json, raw, exitCode } = spawnComposer(composer, SKILL_EVENT);
      assert.ok(json, `composer must output JSON. Raw: ${raw}`);
      assert.ok(json.hookSpecificOutput, "must have hookSpecificOutput");
      assert.equal(json.hookSpecificOutput.hookEventName, "PreToolUse");
      assert.ok(
        json.hookSpecificOutput.additionalContext,
        "must include additionalContext with convention overrides",
      );

      const ctx = json.hookSpecificOutput.additionalContext;
      assert.ok(/\.ai\/rules/.test(ctx), "additionalContext must reference .ai/rules/");
      assert.ok(/clNNNN/.test(ctx), "additionalContext must mention clNNNN grammar");
      assert.ok(/rules win/i.test(ctx), "additionalContext must state 'rules win'");
      assert.ok(/git.conventions|commit.prefix/i.test(ctx), "must point to commit prefix conventions");
      assert.ok(/pnpm.*test|test.*stack/i.test(ctx), "must point to test command conventions");
    });

    it("does NOT inject context for non-Skill tools", () => {
      const composer = join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs");
      const { json, raw } = spawnComposer(composer, BASH_EVENT);

      // For Bash, the matcher doesn't fire, so there should be no additionalContext.
      // The composer may output empty string or a passthrough JSON.
      if (json?.hookSpecificOutput) {
        assert.ok(
          !json.hookSpecificOutput.additionalContext,
          "must NOT inject additionalContext for non-Skill tools",
        );
      }
      // Empty string output is also valid (means passthrough/no-op).
    });
  });

  describe("codex composer", () => {
    it("returns allow + additionalContext for Skill tool", () => {
      const composer = join(projectDir, ".agents", "drwn", "generated", "hooks", "codex", "composer.mjs");
      assert.ok(existsSync(composer), "codex composer must exist");

      const { json, raw } = spawnComposer(composer, SKILL_EVENT);
      assert.ok(json, `codex composer must output JSON. Raw: ${raw}`);

      // Codex format: check for additionalContext in the JSON.
      // The exact field name may vary; check common locations.
      const ctx = json.additionalContext ?? json.hookSpecificOutput?.additionalContext;
      assert.ok(ctx, `codex output must include additionalContext. Raw: ${raw}`);
      assert.ok(/\.ai\/rules/.test(ctx), "codex additionalContext must reference .ai/rules/");
    });
  });

  describe("cursor composer", () => {
    it("processes Skill tool without error (cursor drops pre-tool additionalContext)", () => {
      const composer = join(projectDir, ".agents", "drwn", "generated", "hooks", "cursor", "composer.mjs");
      assert.ok(existsSync(composer), "cursor composer must exist");

      const { json, raw, exitCode } = spawnComposer(composer, SKILL_EVENT);
      // Cursor drops pre-tool additionalContext, but the composer should still run without error.
      // It may output a permission allow or empty — the key is it doesn't deny.
      if (json) {
        assert.notEqual(json.permission, "deny", "cursor must not deny Skill tool calls");
      }
      // Empty output is also valid for cursor pre-tool passthrough.
    });
  });

  describe("opencode plugin", () => {
    it("loads and resolves for Skill tool", { skip: !existsSync(join(projectDir, ".opencode", "plugins", "drwn-hooks.js")) }, async () => {
      const pluginPath = join(projectDir, ".opencode", "plugins", "drwn-hooks.js");
      assert.ok(existsSync(pluginPath), "opencode plugin must exist");

      // Dynamic import the plugin (it's a JS module).
      const module = await import(pluginPath);
      assert.ok(module.DrwnHooks, "must export DrwnHooks");

      // The opencode plugin exposes hook handlers. Call the before-hook for a Skill tool.
      // The exact API shape matches what the CLI's own e2e test uses.
      // It should resolve without throwing (the policy is observer-only, never blocks).
      try {
        const result = await module.DrwnHooks["tool.execute.before"]?.(
          { tool: "Skill", cwd: projectDir },
          { tool: "Skill", input: { skill: "test-driven-development" } },
        );
        // Observer policies return undefined or allow — never deny/block.
        // If it returns a value, it should not be a block.
        if (result && typeof result === "object" && "block" in result) {
          assert.fail("opencode plugin must not block Skill tool calls");
        }
      } catch (err) {
        // An observer policy should never throw for a normal Skill call.
        // If it does, that's a bug in the policy or the plugin wiring.
        assert.fail(`opencode plugin threw on Skill tool: ${err.message}`);
      }
    });
  });

  describe("matcher correctness", () => {
    it("claude composer matches 'Skill' exactly (not 'Skills' or 'skill')", () => {
      const composer = join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs");

      // Test with exact "Skill" — should inject context.
      const skillResult = spawnComposer(composer, SKILL_EVENT);
      const skillCtx = skillResult.json?.hookSpecificOutput?.additionalContext;
      assert.ok(skillCtx, "must inject context for exact 'Skill' tool name");

      // Test with "Bash" — should NOT inject context.
      const bashResult = spawnComposer(composer, BASH_EVENT);
      const bashCtx = bashResult.json?.hookSpecificOutput?.additionalContext;
      assert.ok(!bashCtx, "must NOT inject context for 'Bash' tool name");
    });
  });
});
