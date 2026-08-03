// ABOUTME: Shared test utilities for the workflow-skills card test suite.
// ABOUTME: Provides card.json loading, skill enumeration, and path helpers.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const CARD_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const EXPECTED_SKILLS = [
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "subagent-driven-development",
  "finishing-a-development-branch",
  "using-git-worktrees",
  "dispatching-parallel-agents",
  "test-driven-development",
  "systematic-debugging",
  "verification-before-completion",
  "requesting-code-review",
  "receiving-code-review",
  "incremental-commits",
];

export function loadCardJson() {
  const raw = readFileSync(join(CARD_ROOT, "card.json"), "utf8");
  return JSON.parse(raw);
}

export function skillDir(name) {
  return join(CARD_ROOT, "skills", name);
}

export function readSkillMd(name) {
  const path = join(skillDir(name), "SKILL.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function listSkillFiles(name) {
  const dir = skillDir(name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => join("skills", name, f));
}

/**
 * Read all files for a skill (SKILL.md + companions), returning a map of
 * relative path -> content.
 */
export function readAllSkillFiles(name) {
  const dir = skillDir(name);
  if (!existsSync(dir)) return {};
  const files = {};
  for (const entry of readdirSync(dir)) {
    files[entry] = readFileSync(join(dir, entry), "utf8");
  }
  return files;
}

/**
 * Strip YAML frontmatter from a markdown string.
 */
export function stripFrontmatter(md) {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(end + 4).trimStart();
  }
  return md;
}

/**
 * Extract YAML frontmatter (without the --- delimiters) as a raw string.
 */
export function extractFrontmatter(md) {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(4, end).trim();
  }
  return "";
}
