// ABOUTME: Verifies the public CLI for strict Card catalog and author-scope preferences.
// ABOUTME: Protects JSON parsing, stable output, validation, and non-mutating failures.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveUserConfigPath } from "../cli/core/paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("config get exposes empty defaults without creating preferences", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["config", "get", "catalogCheckouts"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("[]");
  expect(existsSync(resolveUserConfigPath(fixture.agentsDir))).toBe(false);
});

test("config set round-trips catalogCheckouts and defaultAuthorScope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  expect((await runAgentsCli([
    "config", "set", "catalogCheckouts", '["~/dev/darwinian-cards","/work/personal-cards"]',
  ], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli([
    "config", "set", "defaultAuthorScope", "@curation-labs",
  ], envFor(fixture))).exitCode).toBe(0);
  const get = await runAgentsCli(["config", "get", "defaultAuthorScope", "--json"], envFor(fixture));

  expect(JSON.parse(get.stdout)).toEqual({ key: "defaultAuthorScope", value: "@curation-labs" });
  expect(JSON.parse(await readFile(resolveUserConfigPath(fixture.agentsDir), "utf8"))).toMatchObject({
    schema: "drwn.user-preferences",
    schemaVersion: 1,
    catalogCheckouts: ["~/dev/darwinian-cards", "/work/personal-cards"],
    defaultAuthorScope: "@curation-labs",
  });
});

test("config set rejects invalid values without changing persisted preferences", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["config", "set", "catalogCheckouts", "[]"], envFor(fixture))).exitCode).toBe(0);
  const path = resolveUserConfigPath(fixture.agentsDir);
  const before = await readFile(path, "utf8");

  for (const args of [
    ["config", "set", "catalogCheckouts", "not-json"],
    ["config", "set", "catalogCheckouts", '["same","same"]'],
    ["config", "set", "defaultAuthorScope", "not-a-scope"],
    ["config", "set", "unknown", "value"],
  ]) {
    expect((await runAgentsCli(args, envFor(fixture))).exitCode).not.toBe(0);
    expect(await readFile(path, "utf8")).toBe(before);
  }
});
