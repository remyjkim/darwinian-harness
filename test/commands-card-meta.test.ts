// ABOUTME: Verifies the card meta show command surfaces distributable metadata.
// ABOUTME: Guards JSON output and successor display for operator inspection.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeCardMeta } from "../cli/core/card-meta";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { publishCard } from "../cli/core/card-store";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldCardWithMeta() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = join(fixture.root, "card-source");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version: "1.0.0" }, null, 2));
  await publishCard(fixture.agentsDir, sourceDir);
  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@me/tool");
  await writeCardMeta(barePath, {
    deprecations: { "1.0.0": "Renamed" },
    successor: "@me/tool-next",
  });
  return { env: envFor(fixture) };
}

test("card meta show prints deprecations and successor", async () => {
  const { env } = await scaffoldCardWithMeta();
  const result = await runAgentsCli(["card", "meta", "show", "@me/tool"], env);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("1.0.0");
  expect(result.stdout).toContain("Renamed");
  expect(result.stdout).toContain("@me/tool-next");
});

test("card meta show --json emits structured metadata", async () => {
  const { env } = await scaffoldCardWithMeta();
  const result = await runAgentsCli(["card", "meta", "show", "@me/tool", "--json"], env);
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.deprecations["1.0.0"]).toBe("Renamed");
  expect(parsed.successor).toBe("@me/tool-next");
});
