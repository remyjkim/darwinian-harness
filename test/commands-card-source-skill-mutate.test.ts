// ABOUTME: Verifies semantic bundled-skill mutation through `drwn card source`.
// ABOUTME: Protects copy-not-symlink behavior, dry-run contracts, and read-only store guards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
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

function sourceDir(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return join(fixture.root, "catalog", "cards", "example");
}

async function readManifest(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return JSON.parse(await readFile(join(sourceDir(fixture), "card.json"), "utf8"));
}

test("add-skill --dry-run --json reports copy and manifest changes without writing", async () => {
  const fixture = await scaffoldSourceFixture();
  const dest = join(sourceDir(fixture), "skills", "alpha");

  const result = await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha", "--dry-run", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.changes.map((change: { action: string }) => change.action)).toEqual(["copy-skill", "update-manifest"]);
  expect(existsSync(dest)).toBe(false);
  expect((await readManifest(fixture)).skills?.include ?? []).toEqual([]);
});

test("add-skill copies a repo-native shared skill and appends skills.include", async () => {
  const fixture = await scaffoldSourceFixture();
  const dest = join(sourceDir(fixture), "skills", "alpha");

  const result = await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
  expect((await lstat(dest)).isSymbolicLink()).toBe(false);
  expect((await readManifest(fixture)).skills.include).toEqual(["alpha"]);
});

test("add-skill --from accepts a direct SKILL.md path and copies the containing skill directory", async () => {
  const fixture = await scaffoldSourceFixture();
  const source = join(fixture.root, "loose-source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "SKILL.md"), "---\nname: copied-loose\ndescription: fixture\n---\n");
  await writeFile(join(source, "extra.txt"), "copied sibling\n");
  const dest = join(sourceDir(fixture), "skills", "copied-loose");

  const result = await runAgentsCli(
    ["card", "source", "add-skill", "@me/example", "copied-loose", "--from", join(source, "SKILL.md"), "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { changes: Array<{ from?: string; to?: string }> };
  expect(parsed.changes[0]?.from).toBe(source);
  expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
  expect(await readFile(join(dest, "extra.txt"), "utf8")).toBe("copied sibling\n");
  expect((await readManifest(fixture)).skills.include).toEqual(["copied-loose"]);
});

test("add-skill fails on duplicate without --replace and --replace overwrites the bundled copy", async () => {
  const fixture = await scaffoldSourceFixture();
  const destSkillMd = join(sourceDir(fixture), "skills", "alpha", "SKILL.md");
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture))).exitCode).toBe(0);
  await Bun.write(destSkillMd, "local edit\n");

  const duplicate = await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture));
  const replaced = await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha", "--replace"], envFor(fixture));

  expect(duplicate.exitCode).not.toBe(0);
  expect(duplicate.stderr).toContain("--replace");
  expect(replaced.exitCode).toBe(0);
  expect(await Bun.file(destSkillMd).text()).toContain("name: alpha");
  expect((await readManifest(fixture)).skills.include).toEqual(["alpha"]);
});

test("remove-skill --dry-run --json reports removals without writing", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture))).exitCode).toBe(0);
  const dest = join(sourceDir(fixture), "skills", "alpha");

  const result = await runAgentsCli(["card", "source", "remove-skill", "@me/example", "alpha", "--dry-run", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.changes.map((change: { action: string }) => change.action)).toEqual(["remove-skill-files", "update-manifest"]);
  expect(existsSync(dest)).toBe(true);
  expect((await readManifest(fixture)).skills.include).toEqual(["alpha"]);
});

test("remove-skill deletes files and removes only the named manifest entry", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "beta"], envFor(fixture))).exitCode).toBe(0);
  const dest = join(sourceDir(fixture), "skills", "alpha");

  const result = await runAgentsCli(["card", "source", "remove-skill", "@me/example", "alpha"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(dest)).toBe(false);
  expect((await readManifest(fixture)).skills.include).toEqual(["beta"]);
});

test("remove-skill --keep-files removes only the manifest entry", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture))).exitCode).toBe(0);
  const dest = join(sourceDir(fixture), "skills", "alpha");

  const result = await runAgentsCli(["card", "source", "remove-skill", "@me/example", "alpha", "--keep-files"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(dest)).toBe(true);
  expect((await readManifest(fixture)).skills.include).toEqual([]);
});

test("skill mutations honor DRWN_STORE_READONLY while dry-run still reports plans", async () => {
  const fixture = await scaffoldSourceFixture();
  const readonlyEnv = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };

  const blockedAdd = await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], readonlyEnv);
  const dryRunAdd = await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha", "--dry-run", "--json"], readonlyEnv);
  expect((await runAgentsCli(["card", "source", "add-skill", "@me/example", "alpha"], envFor(fixture))).exitCode).toBe(0);
  const blockedRemove = await runAgentsCli(["card", "source", "remove-skill", "@me/example", "alpha"], readonlyEnv);
  const dryRunRemove = await runAgentsCli(["card", "source", "remove-skill", "@me/example", "alpha", "--dry-run", "--json"], readonlyEnv);

  expect(blockedAdd.exitCode).not.toBe(0);
  expect(blockedAdd.stderr).toContain("read-only");
  expect(dryRunAdd.exitCode).toBe(0);
  expect(blockedRemove.exitCode).not.toBe(0);
  expect(blockedRemove.stderr).toContain("read-only");
  expect(dryRunRemove.exitCode).toBe(0);
});
