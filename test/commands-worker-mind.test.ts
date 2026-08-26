// ABOUTME: Pins `drwn worker mind` as one provider-neutral, no-I/O placeholder.
// ABOUTME: No BeginningDB, R2, S3, nested verb, or provider discovery survives.

import { afterEach, expect, test } from "bun:test";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("worker mind refuses with MIND_BACKEND_UNSELECTED without creating state", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const result = await runAgentsCli(["worker", "mind"], envFor(fixture), fixture.root);
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("MIND_BACKEND_UNSELECTED");
});

test("worker mind json emits one closed provider-neutral refusal", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const result = await runAgentsCli(["worker", "mind", "--json"], envFor(fixture), fixture.root);
  expect(result.exitCode).not.toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    schema: "drwn.worker-mind-placeholder",
    schemaVersion: 1,
    outcome: "refused",
    error: { code: "MIND_BACKEND_UNSELECTED" },
  });
});
