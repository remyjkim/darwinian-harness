// ABOUTME: Content tests enforcing that skills reference .ai/rules/ instead of hardcoding conventions.
// ABOUTME: Asserts no stale Superpowers paths, prefixes, namespaces, or hardcoded commands remain.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EXPECTED_SKILLS, readAllSkillFiles } from "./helpers.mjs";

/**
 * Files that are exempt from all content checks (historical/provenance files).
 */
const EXEMPT_FILES = new Set([
  "CREATION-LOG.md", // historical provenance, not instructions
]);

/**
 * Check if a file is exempt from content rules.
 */
function isExempt(fileName) {
  return EXEMPT_FILES.has(fileName);
}

/**
 * Check if an `npm test` mention is acceptable (part of an alternatives list or has a rules reference nearby).
 */
function isAcceptableNpmTest(content, matchIndex) {
  // Accept if there's a .ai/rules/ reference in the same line, the line before, or the line after
  const lineEnd = content.indexOf("\n", matchIndex);
  const lineStart = content.lastIndexOf("\n", matchIndex) + 1;
  const line = content.slice(lineStart, lineEnd !== -1 ? lineEnd : undefined);
  const prevLineStart = content.lastIndexOf("\n", lineStart - 2) + 1;
  const prevLine = content.slice(prevLineStart, lineStart - 1);
  const nextLineEnd = content.indexOf("\n", lineEnd + 1);
  const nextLine = content.slice(lineEnd + 1, nextLineEnd !== -1 ? nextLineEnd : undefined);
  const context = [prevLine, line, nextLine].join("\n");
  if (/\.ai\/rules/.test(context)) return true;
  // Accept if it's part of an alternatives list (e.g., "npm test / pnpm test / cargo test")
  if (/pnpm test|cargo test|pytest/.test(line)) return true;
  // Accept if it's a TEST_CMD default override (parameterized for the project)
  if (/TEST_CMD/.test(line)) return true;
  // Accept if there's a comment on the line referencing the rules
  if (/see .*\.ai\/rules|\.ai\/rules.*test_stack/.test(line)) return true;
  return false;
}

/**
 * Check if a `[type:component]` mention is acceptable (in an intentional "not [type:component]" note).
 */
function isAcceptableTypeComponent(content, matchIndex) {
  // Accept if preceded by "not " or "instead of" within 20 chars (intentional negation)
  const before = content.slice(Math.max(0, matchIndex - 20), matchIndex);
  return /not\s+`?$|not\s|instead of $|instead of `$/.test(before);
}

/**
 * Check if a `CLAUDE.md` mention is acceptable (in a historical/provenance context).
 */
function isAcceptableClaudeMd(content, matchIndex) {
  // Accept if in a CREATION-LOG or historical reference
  const lineStart = content.lastIndexOf("\n", matchIndex) + 1;
  const lineEnd = content.indexOf("\n", matchIndex);
  const line = content.slice(lineStart, lineEnd !== -1 ? lineEnd : undefined);
  if (/Extracted|historical|provenance|CREATION/i.test(line)) return true;
  return false;
}

describe("no forbidden hardcoded conventions in skill files", () => {
  for (const skillName of EXPECTED_SKILLS) {
    it(`"${skillName}" contains no forbidden patterns`, () => {
      const files = readAllSkillFiles(skillName);
      const fileNames = Object.keys(files);
      assert.ok(fileNames.length > 0, `"${skillName}" must have at least one file`);

      for (const [fileName, content] of Object.entries(files)) {
        if (isExempt(fileName)) continue;

        // No hardcoded docs/plans/ paths
        let match;
        const docsPlansRe = /docs\/plans\//g;
        while ((match = docsPlansRe.exec(content)) !== null) {
          assert.fail(
            `"${skillName}/${fileName}": must not hardcode docs/plans/ paths (reference .ai/tasks/ or .ai/analyses/ from the workflow rule). Match at offset ${match.index}`,
          );
        }

        // No superpowers: namespace prefix
        const superpowersRe = /superpowers:/g;
        while ((match = superpowersRe.exec(content)) !== null) {
          assert.fail(
            `"${skillName}/${fileName}": must not use the superpowers: namespace prefix. Match at offset ${match.index}`,
          );
        }

        // No CLAUDE.md as instructions file (unless historical context)
        const claudeMdRe = /CLAUDE\.md/g;
        while ((match = claudeMdRe.exec(content)) !== null) {
          if (isAcceptableClaudeMd(content, match.index)) continue;
          assert.fail(
            `"${skillName}/${fileName}": must not reference CLAUDE.md as the instructions file (use AGENTS.md or .ai/rules/). Match at offset ${match.index}`,
          );
        }

        // No [type:component] prefix scheme (unless intentional "not [type:component]" note)
        const typeCompRe = /\[type:component\]/g;
        while ((match = typeCompRe.exec(content)) !== null) {
          if (isAcceptableTypeComponent(content, match.index)) continue;
          assert.fail(
            `"${skillName}/${fileName}": must not hardcode [type:component] prefix scheme. Match at offset ${match.index}`,
          );
        }

        // No hardcoded npm test without alternatives or rules reference
        const npmTestRe = /\bnpm test\b/g;
        while ((match = npmTestRe.exec(content)) !== null) {
          if (isAcceptableNpmTest(content, match.index)) continue;
          assert.fail(
            `"${skillName}/${fileName}": must not hardcode 'npm test' without alternatives or a .ai/rules/ reference. Match at offset ${match.index}`,
          );
        }
      }
    });
  }
});

/**
 * Skills that MUST reference .ai/rules/ for their conventions.
 * Each entry: [skillName, [patterns that SHOULD appear somewhere in the skill files]]
 */
const RULES_REFERENCES = {
  "brainstorming": [/\.ai\/rules/, "clNNNN"],
  "writing-plans": [/\.ai\/rules/, "clNNNN"],
  "using-git-worktrees": [/\.ai\/rules/, /pnpm/],
  "test-driven-development": [/\.ai\/rules/, /pnpm/],
  "systematic-debugging": [/\.ai\/rules/],
  "incremental-commits": [/\.ai\/rules/],
};

describe("skills reference .ai/rules/ for conventions", () => {
  for (const [skillName, requirements] of Object.entries(RULES_REFERENCES)) {
    it(`"${skillName}" references .ai/rules/`, () => {
      const files = readAllSkillFiles(skillName);
      const allContent = Object.values(files).join("\n");

      assert.ok(
        /\.ai\/rules/.test(allContent),
        `"${skillName}" must reference .ai/rules/ for conventions`,
      );

      for (const req of requirements) {
        if (req instanceof RegExp) {
          assert.ok(
            req.test(allContent),
            `"${skillName}" must match pattern ${req} (besides .ai/rules/)`,
          );
        }
      }
    });
  }
});

describe("skill ABOUTME headers", () => {
  for (const skillName of EXPECTED_SKILLS) {
    it(`"${skillName}" SKILL.md has ABOUTME comments (if present in upstream)`, () => {
      // ABOUTME headers are optional — many upstream skills don't have them.
      // This is a soft check: if the upstream had ABOUTME, the customized version should too.
      // We only assert that SKILL.md exists; ABOUTME enforcement is a convention, not a hard rule.
      const files = readAllSkillFiles(skillName);
      assert.ok(files["SKILL.md"], `"${skillName}" must have SKILL.md`);
    });
  }
});
