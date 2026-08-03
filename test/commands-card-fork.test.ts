// ABOUTME: Verifies drwn card fork copies a source and rewrites card.json.
// ABOUTME: Ensures the original source remains untouched.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("card fork copies source into a new scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceRoot = join(fixture.root, "sources", "backend-upstream");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(sourceRoot, "card.json"), `${JSON.stringify({ name: "@team/backend", version: "1.0.0" }, null, 2)}\n`);
  await writeFile(join(sourceRoot, "README.md"), "original\n");

  const targetParent = join(fixture.root, "forks");
  const result = await runAgentsCli(["card", "fork", sourceRoot, "--scope", "@you", "--into", targetParent], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/@you\/backend/);
  const forked = join(targetParent, "backend", "card.json");
  const manifest = JSON.parse(await readFile(forked, "utf8"));
  expect(manifest.name).toBe("@you/backend");
  expect(await readFile(join(sourceRoot, "README.md"), "utf8")).toBe("original\n");
});
