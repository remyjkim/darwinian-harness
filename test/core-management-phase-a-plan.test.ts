// ABOUTME: Binds the private D52 plan to the current RUNNER_TEMP and exact filename.
// ABOUTME: Rejects an otherwise valid mode-0600 plan outside the caller-owned ceremony root.

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
const plan = {
  schema: "cl.dah.cli-management-phase-a-plan.v1",
  environmentId: "staging-1",
  sourceCommitSha: "a".repeat(40),
  qualificationRunId: "11111111-1111-4111-8111-111111111111",
  contractSha256: "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601",
  providerPolicyVersion: `sha256:${"b".repeat(64)}`,
  relayUrl: "wss://kc.communities.buzz.xyz",
  httpsBase: "https://kc.communities.buzz.xyz",
  workflow: {
    repository: "curation-labs/darwinian-services",
    runId: 33181185126,
    runAttempt: 1,
  },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("I321 Phase-A private plan", () => {
  test("accepts only the exact plan name under an owner mode-0700 RUNNER_TEMP parent", async () => {
    const runnerTemp = await realpath(await mkdtemp(join(tmpdir(), "drwn-phase-a-plan-runner-")));
    const outside = await realpath(await mkdtemp(join(tmpdir(), "drwn-phase-a-plan-outside-")));
    roots.push(runnerTemp, outside);
    await chmod(runnerTemp, 0o700);
    const privateRoot = join(runnerTemp, "i336-phase-a", "private");
    await mkdir(privateRoot, { recursive: true, mode: 0o700 });
    await chmod(join(runnerTemp, "i336-phase-a"), 0o700);
    await chmod(privateRoot, 0o700);
    const exact = join(privateRoot, "i321-cli-management-phase-a-plan.json");
    const wrongName = join(privateRoot, "plan.json");
    const escaped = join(outside, "i321-cli-management-phase-a-plan.json");
    for (const path of [exact, wrongName, escaped]) {
      await writeFile(path, `${JSON.stringify(plan)}\n`, { mode: 0o600 });
    }
    const module = await import("../cli/core/management/phase-a-ceremony");
    const readPlan = module.readI321PhaseAPlan as unknown as (
      path: string,
      options: { runnerTemp: string },
    ) => Promise<unknown>;

    await expect(readPlan(exact, { runnerTemp })).resolves.toEqual(plan);
    for (const path of [wrongName, escaped]) {
      await expect(readPlan(path, { runnerTemp })).rejects.toMatchObject({
        code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
      });
    }
  });
});
