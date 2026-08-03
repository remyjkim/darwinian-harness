// ABOUTME: Verifies read-only `drwn card source` commands.
// ABOUTME: Protects source-listing, source-inspection, and source-doctor output contracts.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldSourceFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = join(fixture.root, "catalog");
  expect((await runAgentsCli(["card", "new", "@me/example", "--into", join(catalog, "cards"), "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["config", "set", "catalogCheckouts", JSON.stringify([catalog])], envFor(fixture))).exitCode).toBe(0);
  return fixture;
}

test("card source list is deprecated with catalog and explicit-path guidance", async () => {
  const fixture = await scaffoldSourceFixture();

  const json = await runAgentsCli(["card", "source", "list", "--json"], envFor(fixture));
  const text = await runAgentsCli(["card", "source", "list"], envFor(fixture));

  expect(json.exitCode).toBe(1);
  expect(JSON.parse(json.stdout)).toMatchObject({ deprecated: true });
  expect(text.exitCode).toBe(1);
  expect(text.stderr).toContain("deprecated");
  expect(text.stderr).toContain("catalogCheckouts");
});

test("card source show supports json and text output", async () => {
  const fixture = await scaffoldSourceFixture();

  const json = await runAgentsCli(["card", "source", "show", "@me/example", "--json"], envFor(fixture));
  const text = await runAgentsCli(["card", "source", "show", "@me/example"], envFor(fixture));

  expect(json.exitCode).toBe(0);
  const parsed = JSON.parse(json.stdout);
  expect(parsed.name).toBe("@me/example");
  expect(parsed.manifest.version).toBe("1.0.0");
  expect(parsed.manifestSkills).toEqual([]);
  expect(text.exitCode).toBe(0);
  expect(text.stdout).toContain("@me/example");
  expect(text.stdout).toContain("bundledSkills");
});

test("card source doctor supports json and text output for a healthy source", async () => {
  const fixture = await scaffoldSourceFixture();

  const json = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));
  const text = await runAgentsCli(["card", "source", "doctor", "@me/example"], envFor(fixture));

  expect(json.exitCode).toBe(0);
  expect(JSON.parse(json.stdout).ok).toBe(true);
  expect(text.exitCode).toBe(0);
  expect(text.stdout).toContain("No issues found.");
});

test("card source doctor exits zero and reports ok false for nonfatal source issues", async () => {
  const fixture = await scaffoldSourceFixture();
  const sourceDir = join(fixture.root, "catalog", "cards", "example");
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.skills = { include: ["alpha"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });

  const result = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.ok).toBe(false);
  expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("missing_skill_md");
});
