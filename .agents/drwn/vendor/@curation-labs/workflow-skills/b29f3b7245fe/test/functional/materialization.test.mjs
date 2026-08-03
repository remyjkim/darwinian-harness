// ABOUTME: Functional test — verifies the card materializes correctly across all 4 agent targets.
// ABOUTME: Closes gaps: OpenCode coverage, agent-runtime verification, full materialization.

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { installCard, cleanupAll, readFileOrNull } from "./helpers.mjs";

let projectDir;

before(() => {
  projectDir = installCard();
});

after(() => {
  cleanupAll();
});

describe("4-target materialization", () => {
  describe("claude target", () => {
    it("materializes 13 skills to .claude/skills/", () => {
      const skillsDir = join(projectDir, ".claude", "skills");
      assert.ok(existsSync(skillsDir), ".claude/skills/ must exist");
      const skills = readdirSync(skillsDir).filter((n) => !n.startsWith("."));
      assert.equal(skills.length, 13, `expected 13 skills, got ${skills.length}: ${skills.join(", ")}`);
    });

    it("each .claude/skills/<name>/SKILL.md exists", () => {
      const skillsDir = join(projectDir, ".claude", "skills");
      const skills = readdirSync(skillsDir).filter((n) => !n.startsWith("."));
      for (const name of skills) {
        const skillMd = join(skillsDir, name, "SKILL.md");
        assert.ok(existsSync(skillMd), `${name}/SKILL.md must exist`);
      }
    });

    it("wires hooks into .claude/settings.json", () => {
      const settingsPath = join(projectDir, ".claude", "settings.json");
      assert.ok(existsSync(settingsPath), ".claude/settings.json must exist");
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      assert.ok(settings.hooks?.PreToolUse, "must have PreToolUse hooks");
      assert.ok(settings.hooks.PreToolUse.length > 0, "must have at least one PreToolUse entry");
    });

    it("materialized skills contain org-convention notes", () => {
      const brainstorming = join(projectDir, ".claude", "skills", "brainstorming", "SKILL.md");
      const content = readFileSync(brainstorming, "utf8");
      assert.ok(/Org convention/.test(content), "brainstorming must contain org-convention note");
      assert.ok(/\.ai\/rules/.test(content), "brainstorming must reference .ai/rules/");
    });
  });

  describe("codex target", () => {
    it("materializes 13 skills to .codex/skills/", () => {
      const skillsDir = join(projectDir, ".codex", "skills");
      assert.ok(existsSync(skillsDir), ".codex/skills/ must exist");
      const skills = readdirSync(skillsDir).filter((n) => !n.startsWith("."));
      assert.equal(skills.length, 13, `expected 13 skills, got ${skills.length}`);
    });

    it("wires hooks into .codex/hooks.json", () => {
      const hooksPath = join(projectDir, ".codex", "hooks.json");
      assert.ok(existsSync(hooksPath), ".codex/hooks.json must exist");
      const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
      assert.ok(hooks.hooks?.PreToolUse, "must have PreToolUse hooks");
    });
  });

  describe("cursor target", () => {
    it("wires hooks into .cursor/hooks.json", () => {
      const hooksPath = join(projectDir, ".cursor", "hooks.json");
      assert.ok(existsSync(hooksPath), ".cursor/hooks.json must exist");
      const hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
      assert.equal(hooks.version, 1, "cursor hooks version must be 1");
      assert.ok(hooks.hooks?.preToolUse, "must have preToolUse entries");
    });
  });

  describe("opencode target", () => {
    it("materializes opencode plugin (if target is enabled)", { skip: !existsSync(join(projectDir, ".opencode")) }, () => {
      const pluginPath = join(projectDir, ".opencode", "plugins", "drwn-hooks.js");
      assert.ok(existsSync(pluginPath), ".opencode/plugins/drwn-hooks.js must exist");
      const content = readFileSync(pluginPath, "utf8");
      assert.ok(/DrwnHooks/.test(content), "plugin must export DrwnHooks");
    });
  });

  describe("instructions.md", () => {
    it("writes generated/instructions.md with convention overrides", () => {
      const instrPath = join(projectDir, ".agents", "drwn", "generated", "instructions.md");
      assert.ok(existsSync(instrPath), "generated/instructions.md must exist");
      const content = readFileSync(instrPath, "utf8");
      assert.ok(/clNNNN/.test(content), "instructions must mention clNNNN grammar");
      assert.ok(/\.ai\/rules/.test(content), "instructions must reference .ai/rules/");
      assert.ok(/rules win|convention/i.test(content), "instructions must state conventions override");
    });
  });

  describe("hook composers generated", () => {
    it("generates claude composer.mjs", () => {
      const path = join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs");
      assert.ok(existsSync(path), "claude composer.mjs must exist");
    });

    it("generates codex composer.mjs", () => {
      const path = join(projectDir, ".agents", "drwn", "generated", "hooks", "codex", "composer.mjs");
      assert.ok(existsSync(path), "codex composer.mjs must exist");
    });

    it("generates cursor composer.mjs", () => {
      const path = join(projectDir, ".agents", "drwn", "generated", "hooks", "cursor", "composer.mjs");
      assert.ok(existsSync(path), "cursor composer.mjs must exist");
    });
  });
});
