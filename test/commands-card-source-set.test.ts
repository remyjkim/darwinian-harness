// ABOUTME: Verifies semantic manifest edits through `drwn card source set`.
// ABOUTME: Protects validation, dry-run output, and store read-only behavior for source manifests.

import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldSourceFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/example", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  return fixture;
}

async function readManifest(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "sources", "@me", "example", "card.json"), "utf8"));
}

test("set --dry-run --json reports old and new description without writing", async () => {
  const fixture = await scaffoldSourceFixture();

  const result = await runAgentsCli(
    ["card", "source", "set", "@me/example", "--description", "Example card", "--dry-run", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.changes).toContainEqual({ field: "description", oldValue: "", newValue: "Example card" });
  expect((await readManifest(fixture)).description).toBe("");
});

test("set updates version, license, and harness min version", async () => {
  const fixture = await scaffoldSourceFixture();

  const result = await runAgentsCli(
    [
      "card",
      "source",
      "set",
      "@me/example",
      "--version",
      "1.2.3",
      "--license",
      "MIT",
      "--harness-min-version",
      "0.1.0",
    ],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const manifest = await readManifest(fixture);
  expect(manifest.version).toBe("1.2.3");
  expect(manifest.license).toBe("MIT");
  expect(manifest.harness.minVersion).toBe("0.1.0");
});

test("set updates Wave 2 quality fields", async () => {
  const fixture = await scaffoldSourceFixture();

  const result = await runAgentsCli(
    [
      "card",
      "source",
      "set",
      "@me/example",
      "--stability",
      "stable",
      "--last-validated-with",
      "1.2.3",
      "--test-status-badge",
      "https://example.com/status.svg",
    ],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const manifest = await readManifest(fixture);
  expect(manifest.stability).toBe("stable");
  expect(manifest.lastValidatedWith).toBe("1.2.3");
  expect(manifest.testStatusBadge).toBe("https://example.com/status.svg");
});

test("set authors, replaces, and clears explicit instructions with conflict validation", async () => {
  const fixture = await scaffoldSourceFixture();
  const sourceDir = join(
    fixture.agentsDir,
    "drwn",
    "sources",
    "@me",
    "example",
  );

  const inline = await runAgentsCli(
    [
      "card",
      "source",
      "set",
      "@me/example",
      "--instructions-text",
      "Operate carefully.",
    ],
    envFor(fixture),
  );
  expect(inline.exitCode).toBe(0);
  expect((await readManifest(fixture)).instructions).toEqual({
    text: "Operate carefully.",
  });

  await writeFile(join(sourceDir, "INSTRUCTIONS.md"), "Use the source file.\n");
  const path = await runAgentsCli(
    [
      "card",
      "source",
      "set",
      "@me/example",
      "--instructions-path",
      "INSTRUCTIONS.md",
    ],
    envFor(fixture),
  );
  expect(path.exitCode).toBe(0);
  expect((await readManifest(fixture)).instructions).toEqual({
    path: "INSTRUCTIONS.md",
  });

  const missing = await runAgentsCli(
    [
      "card",
      "source",
      "set",
      "@me/example",
      "--instructions-path",
      "MISSING.md",
    ],
    envFor(fixture),
  );
  expect(missing.exitCode).not.toBe(0);
  expect((await readManifest(fixture)).instructions).toEqual({
    path: "INSTRUCTIONS.md",
  });

  const conflict = await runAgentsCli(
    [
      "card",
      "source",
      "set",
      "@me/example",
      "--instructions-text",
      "x",
      "--instructions-path",
      "x.md",
    ],
    envFor(fixture),
  );
  expect(conflict.exitCode).not.toBe(0);

  const cleared = await runAgentsCli(
    ["card", "source", "set", "@me/example", "--clear-instructions"],
    envFor(fixture),
  );
  expect(cleared.exitCode).toBe(0);
  expect((await readManifest(fixture)).instructions).toBeUndefined();
});

test("set rejects missing patch flags and invalid values without writing", async () => {
  const fixture = await scaffoldSourceFixture();

  const noFlags = await runAgentsCli(["card", "source", "set", "@me/example"], envFor(fixture));
  const badVersion = await runAgentsCli(["card", "source", "set", "@me/example", "--version", "1.2"], envFor(fixture));
  const badHarness = await runAgentsCli(["card", "source", "set", "@me/example", "--harness-min-version", "next"], envFor(fixture));
  const badStability = await runAgentsCli(["card", "source", "set", "@me/example", "--stability", "beta"], envFor(fixture));
  const badValidated = await runAgentsCli(["card", "source", "set", "@me/example", "--last-validated-with", "latest"], envFor(fixture));
  const badBadge = await runAgentsCli(["card", "source", "set", "@me/example", "--test-status-badge", "file://status.svg"], envFor(fixture));

  expect(noFlags.exitCode).not.toBe(0);
  expect(noFlags.stderr).toContain("No manifest fields");
  for (const result of [badVersion, badHarness, badStability, badValidated, badBadge]) {
    expect(result.exitCode).not.toBe(0);
  }
  expect((await readManifest(fixture)).version).toBe("1.0.0");
});

test("set honors DRWN_STORE_READONLY while dry-run still reports old and new values", async () => {
  const fixture = await scaffoldSourceFixture();
  const readonlyEnv = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };

  const blocked = await runAgentsCli(["card", "source", "set", "@me/example", "--description", "Blocked"], readonlyEnv);
  const dryRun = await runAgentsCli(
    ["card", "source", "set", "@me/example", "--description", "Preview", "--dry-run", "--json"],
    readonlyEnv,
  );

  expect(blocked.exitCode).not.toBe(0);
  expect(blocked.stderr).toContain("read-only");
  expect(dryRun.exitCode).toBe(0);
  expect(JSON.parse(dryRun.stdout).changes).toContainEqual({
    field: "description",
    oldValue: "",
    newValue: "Preview",
  });
  expect((await readManifest(fixture)).description).toBe("");
});
