// ABOUTME: Verifies card release accepts the same explicit-path and catalog-resolved grammar as publish.
// ABOUTME: Protects missing-input, matching-name, mismatch, and configured-checkout behavior.

import { afterEach, expect, test } from "bun:test";
import { cleanupTempRoots, createCatalogCardSource, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("card release enforces the shared positional-name and --from grammar", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceDir = await createCatalogCardSource(fixture, "@me/release");

  const missing = await runAgentsCli(["card", "release"], envFor(fixture));
  expect(missing.exitCode).not.toBe(0);

  const explicit = await runAgentsCli(["card", "release", "@me/release", "--from", sourceDir], envFor(fixture));
  expect(explicit.exitCode).toBe(0);
  expect(explicit.stdout).toContain("Proposed version: 1.0.1");

  const mismatch = await runAgentsCli(["card", "release", "@me/other", "--from", sourceDir], envFor(fixture));
  expect(mismatch.exitCode).not.toBe(0);
  expect(mismatch.stderr).toMatch(/does not match/i);

  const nameOnlyDir = await createCatalogCardSource(fixture, "@me/name-only-release");
  expect(nameOnlyDir).toContain("name-only-release");
  expect((await runAgentsCli(["card", "release", "@me/name-only-release"], envFor(fixture))).exitCode).toBe(0);
});
