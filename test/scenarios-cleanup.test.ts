// ABOUTME: Verifies write-record-backed cleanup removes only drwn-owned paths.
// ABOUTME: Protects user content from accidental deletion during materialization changes.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clearMachineBlueprint, cleanupTempRoots, installMachineBlueprint, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

test("replacing the machine Blueprint removes its previously materialized skill on next write", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  await installMachineBlueprint(fixture, { skills: ["alpha"] });
  expect((await runAgentsCli(["write", "--skills-only"], envFor(fixture))).exitCode).toBe(0);
  const linkPath = join(fixture.homeDir, ".claude", "skills", "alpha");
  expect(lstatSync(linkPath).isDirectory()).toBe(true);

  await clearMachineBlueprint(fixture);
  const result = await runAgentsCli(["write", "--skills-only", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).changes).toContain(`remove ${linkPath}`);
  expect(existsSync(linkPath)).toBe(false);
});

test("cleanup preserves user content that replaced a removed managed copy", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineBlueprint(fixture, { skills: ["alpha"] });
  expect((await runAgentsCli(["write", "--skills-only"], envFor(fixture))).exitCode).toBe(0);
  const linkPath = join(fixture.homeDir, ".claude", "skills", "alpha");
  await rm(linkPath, { recursive: true, force: true });
  await mkdir(linkPath, { recursive: true });
  await writeFile(join(linkPath, "SKILL.md"), "user content\n");

  await clearMachineBlueprint(fixture);

  const result = await runAgentsCli(["write", "--skills-only", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(linkPath, "SKILL.md"))).toBe(true);
  expect(JSON.parse(result.stdout).warnings.some((warning: string) => warning.includes("preserved user-owned path"))).toBe(true);
});
