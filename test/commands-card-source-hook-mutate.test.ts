// ABOUTME: Verifies semantic hook policy mutation through `drwn card source`.
// ABOUTME: Protects scaffold templates, manifest updates, diagnostics, and read-only guards.

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

test("add-hook --dry-run --json reports scaffold and manifest changes without writing", async () => {
  const fixture = await scaffoldSourceFixture();
  const policyPath = join(sourceDir(fixture), "hooks", "audit", "policy.ts");

  const result = await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit", "--dry-run", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.changes.map((change: { action: string }) => change.action)).toEqual(["add-hook", "update-manifest"]);
  expect(existsSync(policyPath)).toBe(false);
  expect((await readManifest(fixture)).hooks).toBeUndefined();
});

test("add-hook scaffolds policy.ts and appends hooks.include", async () => {
  const fixture = await scaffoldSourceFixture();
  const policyPath = join(sourceDir(fixture), "hooks", "audit", "policy.ts");

  const result = await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(policyPath)).toBe(true);
  const policy = await readFile(policyPath, "utf8");
  expect(policy).toContain("defineToolPolicy");
  expect(policy).toContain('policyKind: "observer"');
  expect((await readManifest(fixture)).hooks.include).toEqual(["audit"]);
});

test("add-hook rejects duplicate and unsafe names", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], envFor(fixture))).exitCode).toBe(0);

  const duplicate = await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], envFor(fixture));
  const unsafe = await runAgentsCli(["card", "source", "add-hook", "@me/example", "../audit"], envFor(fixture));

  expect(duplicate.exitCode).not.toBe(0);
  expect(duplicate.stderr).toContain("Hook already exists");
  expect(unsafe.exitCode).not.toBe(0);
  expect(unsafe.stderr).toContain("Invalid hook policy");
});

test("remove-hook supports dry-run, deletion, and keep-files", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], envFor(fixture))).exitCode).toBe(0);
  const policyDir = join(sourceDir(fixture), "hooks", "audit");

  const dryRun = await runAgentsCli(["card", "source", "remove-hook", "@me/example", "audit", "--dry-run", "--json"], envFor(fixture));
  expect(dryRun.exitCode).toBe(0);
  expect(JSON.parse(dryRun.stdout).changes.map((change: { action: string }) => change.action))
    .toEqual(["remove-hook-files", "update-manifest"]);
  expect(existsSync(policyDir)).toBe(true);
  expect((await readManifest(fixture)).hooks.include).toEqual(["audit"]);

  const removed = await runAgentsCli(["card", "source", "remove-hook", "@me/example", "audit"], envFor(fixture));
  expect(removed.exitCode).toBe(0);
  expect(existsSync(policyDir)).toBe(false);

  expect((await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], envFor(fixture))).exitCode).toBe(0);
  const kept = await runAgentsCli(["card", "source", "remove-hook", "@me/example", "audit", "--keep-files"], envFor(fixture));
  expect(kept.exitCode).toBe(0);
  expect(existsSync(policyDir)).toBe(true);
  expect((await readManifest(fixture)).hooks.include).toEqual([]);
});

test("hook mutations honor DRWN_STORE_READONLY while dry-run still reports plans", async () => {
  const fixture = await scaffoldSourceFixture();
  const readonlyEnv = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };

  const blockedAdd = await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], readonlyEnv);
  const dryRunAdd = await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit", "--dry-run", "--json"], readonlyEnv);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/example", "audit"], envFor(fixture))).exitCode).toBe(0);
  const blockedRemove = await runAgentsCli(["card", "source", "remove-hook", "@me/example", "audit"], readonlyEnv);
  const dryRunRemove = await runAgentsCli(["card", "source", "remove-hook", "@me/example", "audit", "--dry-run", "--json"], readonlyEnv);

  expect(blockedAdd.exitCode).not.toBe(0);
  expect(blockedAdd.stderr).toContain("read-only");
  expect(dryRunAdd.exitCode).toBe(0);
  expect(blockedRemove.exitCode).not.toBe(0);
  expect(blockedRemove.stderr).toContain("read-only");
  expect(dryRunRemove.exitCode).toBe(0);
});

test("card source doctor reports hook directory issues", async () => {
  const fixture = await scaffoldSourceFixture();
  const manifest = await readManifest(fixture);
  manifest.hooks = { include: ["audit", "broken"] };
  await writeFile(join(sourceDir(fixture), "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir(fixture), "hooks", "broken"), { recursive: true });
  await mkdir(join(sourceDir(fixture), "hooks", "orphan"), { recursive: true });
  await writeFile(join(sourceDir(fixture), "hooks", "orphan", "policy.ts"), "export default {};\n");

  const result = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.ok).toBe(false);
  expect(parsed.issues.map((issue: { code: string }) => issue.code)).toEqual(
    expect.arrayContaining(["missing_hook_dir", "missing_policy_ts", "orphaned_hook_dir"]),
  );
});

test("card source doctor reports invalid policy modules", async () => {
  const fixture = await scaffoldSourceFixture();
  const manifest = await readManifest(fixture);
  manifest.hooks = { include: ["bad"] };
  await writeFile(join(sourceDir(fixture), "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir(fixture), "hooks", "bad"), { recursive: true });
  await writeFile(join(sourceDir(fixture), "hooks", "bad", "policy.ts"), "export default ;\n");

  const result = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("invalid_policy_module");
});
