// ABOUTME: Functional test — verifies .ai/rules/ paths referenced by materialized skills resolve in a real repo.
// ABOUTME: Creates a git worktree of darwinian-services, installs the card, checks that referenced rules files exist.
// ABOUTME: Closes gaps: worktree isolation, behavioral test.

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createWorktree,
  cleanupAll,
  installCardInDir,
  REPO_WITH_RULES,
} from "./helpers.mjs";

let worktree;

before(() => {
  // Skip if the source repo doesn't exist.
  if (!existsSync(REPO_WITH_RULES)) {
    throw new Error(`Source repo not found: ${REPO_WITH_RULES}`);
  }
  worktree = createWorktree(REPO_WITH_RULES);

  // .ai/rules/ is untracked in darwinian-services, so git worktree won't have it.
  // Copy it into the worktree so the rules paths resolve.
  const rulesSrc = join(REPO_WITH_RULES, ".ai", "rules");
  const rulesDst = join(worktree.path, ".ai", "rules");
  if (existsSync(rulesSrc)) {
    spawnSync("cp", ["-R", rulesSrc, rulesDst], { encoding: "utf8", timeout: 10_000 });
  }

  installCardInDir(worktree.path);
});

after(() => {
  if (worktree) worktree.cleanup();
  cleanupAll();
});

/**
 * Read a materialized skill's content from the worktree's .claude/skills/.
 */
function readMaterializedSkill(name) {
  const path = join(worktree.path, ".claude", "skills", name, "SKILL.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/**
 * Extract all .ai/rules/ paths referenced in a skill's content.
 */
function extractRulesPaths(content) {
  const paths = [];
  const re = /(\.ai\/rules\/[^\s)"'`,]+)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    paths.push(match[1].replace(/[.,;:]$/, ""));
  }
  return [...new Set(paths)];
}

describe("rules resolution in a real repo worktree", () => {
  it("worktree has .ai/rules/ directory", () => {
    assert.ok(existsSync(join(worktree.path, ".ai", "rules")), "worktree must have .ai/rules/");
  });

  it("card installed in worktree without error", () => {
    assert.ok(
      existsSync(join(worktree.path, ".claude", "skills")),
      "card must be installed (.claude/skills/ exists)",
    );
  });

  // For each skill that references .ai/rules/, verify the referenced files exist.
  const skillsWithRules = [
    "brainstorming",
    "writing-plans",
    "executing-plans",
    "subagent-driven-development",
    "finishing-a-development-branch",
    "using-git-worktrees",
    "test-driven-development",
    "systematic-debugging",
    "verification-before-completion",
    "requesting-code-review",
    "receiving-code-review",
    "incremental-commits",
  ];

  for (const skillName of skillsWithRules) {
    it(`"${skillName}" references rules paths that exist in the repo`, () => {
      const content = readMaterializedSkill(skillName);
      assert.ok(content, `${skillName} must be materialized`);

      const rulesPaths = extractRulesPaths(content);
      assert.ok(rulesPaths.length > 0, `${skillName} must reference at least one .ai/rules/ path`);

      for (const relPath of rulesPaths) {
        const fullPath = join(worktree.path, relPath);
        assert.ok(
          existsSync(fullPath),
          `${skillName} references "${relPath}" but that file does not exist in the worktree`,
        );
      }
    });
  }

  it("materialized brainstorming references the workflow rule (GATE 1)", () => {
    const content = readMaterializedSkill("brainstorming");
    assert.ok(content.includes("06_issue_workflow"), "must reference the workflow rule");
  });

  it("materialized writing-plans references the workflow rule (GATE 2)", () => {
    const content = readMaterializedSkill("writing-plans");
    assert.ok(content.includes("06_issue_workflow"), "must reference the workflow rule");
  });

  it("materialized incremental-commits references the git conventions rule", () => {
    const content = readMaterializedSkill("incremental-commits");
    assert.ok(content.includes("01_git_conventions"), "must reference the git conventions rule");
  });

  it("materialized test-driven-development references the test stack rule", () => {
    const content = readMaterializedSkill("test-driven-development");
    assert.ok(content.includes("02_test_stack"), "must reference the test stack rule");
  });

  it("materialized systematic-debugging references the investigation rule", () => {
    const content = readMaterializedSkill("systematic-debugging");
    assert.ok(content.includes("02_investigation"), "must reference the investigation rule");
  });
});
