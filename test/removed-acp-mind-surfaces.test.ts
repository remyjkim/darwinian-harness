// ABOUTME: Proves ACP and active BeginningDB Worker Mind surfaces are fully removed.
// ABOUTME: Retains only a provider-neutral no-I/O worker-mind placeholder and local Card content contracts.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const repoRoot = join(import.meta.dir, "..");
const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => filesUnder(join(path, name)));
}

test("ACP and active provider-backed Mind code, dependencies, and registrations are absent", () => {
  for (const path of [
    "cli/commands/acp",
    "cli/core/acp",
    "cli/core/mind-store",
  ]) expect(existsSync(join(repoRoot, path))).toBe(false);

  expect(existsSync(join(repoRoot, "cli/core/mind-content"))).toBe(true);
  expect(existsSync(join(repoRoot, "cli/core/mind-capability.ts"))).toBe(true);
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  expect(packageJson.dependencies).not.toHaveProperty("@agentclientprotocol/sdk");
  expect(packageJson.dependencies).not.toHaveProperty("ulid");

  const active = filesUnder(join(repoRoot, "cli")).map((file) => readFileSync(file, "utf8")).join("\n");
  for (const retired of ["@agentclientprotocol/sdk", "DRWN_ACP_", "BGDB_", "mind-store/bindings"]) {
    expect(active).not.toContain(retired);
  }
});

test("worker mind is one provider-neutral refusal and every retired nested verb is unknown", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const before = filesUnder(fixture.root).sort();
  const placeholder = await runAgentsCli(["worker", "mind"], envFor(fixture), fixture.root);
  expect(placeholder.exitCode).not.toBe(0);
  expect(`${placeholder.stdout}\n${placeholder.stderr}`).toContain("MIND_BACKEND_UNSELECTED");

  for (const args of [
    ["worker", "mind", "provision"],
    ["worker", "mind", "status"],
    ["worker", "mind", "doctor"],
    ["worker", "mind", "pool", "retire", "/x", "--yes"],
    ["worker", "mind", "sync"],
    ["worker", "mind", "diff"],
    ["worker", "mind", "checkpoint"],
    ["acp", "serve", "worker"],
  ]) {
    const result = await runAgentsCli(args, envFor(fixture), fixture.root);
    expect(result.exitCode).not.toBe(0);
  }
  expect(filesUnder(fixture.root).sort()).toEqual(before);
});
