// ABOUTME: Verifies persona and beliefs source authoring through `drwn card source`.
// ABOUTME: Protects explicit visibility, dry-run output, doctor diagnostics, and read-only behavior.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

test("add-persona --dry-run --json reports scaffold and manifest changes without writing", async () => {
  const fixture = await scaffoldSourceFixture();
  const personaPath = join(sourceDir(fixture), "persona", "voice", "PERSONA.md");

  const result = await runAgentsCli(
    ["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal", "--dry-run", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.changes.map((change: { action: string }) => change.action)).toEqual(["add-persona", "update-manifest"]);
  expect(existsSync(personaPath)).toBe(false);
  expect((await readManifest(fixture)).persona).toBeUndefined();
});

test("mind content source commands scaffold files and append explicit visibility", async () => {
  const fixture = await scaffoldSourceFixture();

  const persona = await runAgentsCli(
    ["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal"],
    envFor(fixture),
  );
  const belief = await runAgentsCli(
    ["card", "source", "add-belief", "@me/example", "engineering", "--visibility", "public"],
    envFor(fixture),
  );

  expect(persona.exitCode).toBe(0);
  expect(belief.exitCode).toBe(0);
  expect(existsSync(join(sourceDir(fixture), "persona", "voice", "PERSONA.md"))).toBe(true);
  expect(existsSync(join(sourceDir(fixture), "beliefs", "engineering", "BELIEF.md"))).toBe(true);

  const manifest = await readManifest(fixture);
  expect(manifest.persona).toEqual({ include: ["voice"], visibility: "internal" });
  expect(manifest.beliefs).toEqual({ include: ["engineering"], visibility: "public" });
});

test("add-persona requires --visibility", async () => {
  const fixture = await scaffoldSourceFixture();

  const result = await runAgentsCli(["card", "source", "add-persona", "@me/example", "voice"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
});

test("remove-persona supports dry-run, deletion, and keep-files", async () => {
  const fixture = await scaffoldSourceFixture();
  expect(
    (await runAgentsCli(["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  const personaDir = join(sourceDir(fixture), "persona", "voice");

  const dryRun = await runAgentsCli(["card", "source", "remove-persona", "@me/example", "voice", "--dry-run", "--json"], envFor(fixture));
  expect(dryRun.exitCode).toBe(0);
  expect(JSON.parse(dryRun.stdout).changes.map((change: { action: string }) => change.action)).toEqual([
    "remove-persona-files",
    "update-manifest",
  ]);
  expect(existsSync(personaDir)).toBe(true);

  const removed = await runAgentsCli(["card", "source", "remove-persona", "@me/example", "voice"], envFor(fixture));
  expect(removed.exitCode).toBe(0);
  expect(existsSync(personaDir)).toBe(false);

  expect(
    (await runAgentsCli(["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  const kept = await runAgentsCli(["card", "source", "remove-persona", "@me/example", "voice", "--keep-files"], envFor(fixture));
  expect(kept.exitCode).toBe(0);
  expect(existsSync(personaDir)).toBe(true);
  expect((await readManifest(fixture)).persona.include).toEqual([]);
});

test("card source doctor reports persona and belief directory issues", async () => {
  const fixture = await scaffoldSourceFixture();
  const manifest = await readManifest(fixture);
  manifest.persona = { include: ["voice", "missing"], visibility: "internal" };
  manifest.beliefs = { include: ["engineering"], visibility: "public" };
  await writeFile(join(sourceDir(fixture), "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir(fixture), "persona", "voice"), { recursive: true });
  await mkdir(join(sourceDir(fixture), "persona", "orphan"), { recursive: true });
  await writeFile(join(sourceDir(fixture), "persona", "orphan", "PERSONA.md"), "orphan\n");
  await mkdir(join(sourceDir(fixture), "beliefs", "engineering"), { recursive: true });

  const result = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.ok).toBe(false);
  expect(parsed.issues.map((issue: { code: string; severity: string }) => `${issue.severity}:${issue.code}`)).toEqual(
    expect.arrayContaining([
      "error:missing_persona_dir",
      "error:missing_persona_md",
      "error:orphaned_persona_dir",
      "error:missing_belief_md",
    ]),
  );
});

test("mind content mutations honor DRWN_STORE_READONLY while dry-run still reports plans", async () => {
  const fixture = await scaffoldSourceFixture();
  const readonlyEnv = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };

  const blockedAdd = await runAgentsCli(
    ["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal"],
    readonlyEnv,
  );
  const dryRunAdd = await runAgentsCli(
    ["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal", "--dry-run", "--json"],
    readonlyEnv,
  );
  expect(
    (await runAgentsCli(["card", "source", "add-persona", "@me/example", "voice", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  const blockedRemove = await runAgentsCli(["card", "source", "remove-persona", "@me/example", "voice"], readonlyEnv);
  const dryRunRemove = await runAgentsCli(
    ["card", "source", "remove-persona", "@me/example", "voice", "--dry-run", "--json"],
    readonlyEnv,
  );

  expect(blockedAdd.exitCode).not.toBe(0);
  expect(blockedAdd.stderr).toContain("read-only");
  expect(dryRunAdd.exitCode).toBe(0);
  expect(blockedRemove.exitCode).not.toBe(0);
  expect(blockedRemove.stderr).toContain("read-only");
  expect(dryRunRemove.exitCode).toBe(0);
});
