// ABOUTME: Enforces Foundry as the exclusive active product name without rewriting immutable history.
// ABOUTME: Exclusions are closed to history, generated vendor bytes, build output, and an unrelated external brand.

import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = join(import.meta.dir, "..");
const forbidden = ["stu", "dio"].join("");
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".toml", ".sh"]);
const explicitExclusions = [
  ".ai/", // immutable architecture/task/history evidence lives in the primary checkout
  ".agents/", // generated Card/vendor bytes are not shipped package source
  "CHANGELOG.md", // immutable release history
  "docs-docusaurus/build/", // generated output
  "skills/shared/agentcash/SKILL.md", // unrelated external stablestudio.dev product name
  "test/foundry-naming-residue.test.ts", // constructs the forbidden token under test
];

test("active shipped and current source contains no legacy product naming", () => {
  const listed = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard"], { cwd: root });
  expect(listed.exitCode).toBe(0);
  const violations: string[] = [];
  for (const path of listed.stdout.toString().split("\n").filter(Boolean).sort()) {
    if (!existsSync(join(root, path))) continue;
    if (explicitExclusions.some((prefix) => path === prefix || path.startsWith(prefix))) continue;
    if (!extensions.has(extname(path)) && !["AGENTS.md", "README.md", "INSTALL.md"].includes(path)) continue;
    const content = readFileSync(join(root, path), "utf8").toLowerCase();
    if (content.includes(forbidden)) violations.push(path);
  }
  expect(violations).toEqual([]);
});
