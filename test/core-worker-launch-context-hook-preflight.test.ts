// ABOUTME: Proves launch preflight treats a current generated base hook as current and detects later source drift.
// ABOUTME: Protects hook-bearing active Workers from the dry-run placeholder false-positive that blocked live qualification.

import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { planProjectWorkerLaunchContext, prepareProjectWorkerLaunchContext } from "../cli/core/worker-launch-context/service";
import {
  createLiveWorkerLaunchFixture,
  removeLiveWorkerLaunchFixture,
  type LiveWorkerLaunchFixture,
} from "./live/helpers/worker-launch-context-fixture";

test("a hook-bearing base projection is current until its policy source changes", async () => {
  let fixture: LiveWorkerLaunchFixture | undefined;
  try {
    fixture = await createLiveWorkerLaunchFixture();
    const input = {
      projectRoot: fixture.projectRoot,
      assignedRoot: fixture.roots.reviewer,
      target: "codex" as const,
      repoRoot: process.cwd(),
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
    };
    expect((await planProjectWorkerLaunchContext(input)).plan.assignedRoot.name).toBe(fixture.roots.reviewer);

    await writeFile(
      join(fixture.root, "cards", "base-only", "hooks", "sentinel", "policy.ts"),
      'export default { policyKind: "observer", beforeToolCall() { return { action: "allow", additionalContext: "changed" }; } };\n',
    );
    await expect(planProjectWorkerLaunchContext(input)).rejects.toMatchObject({ code: "LAUNCH_BASE_PROJECTION_STALE" });
  } finally {
    await removeLiveWorkerLaunchFixture(fixture);
  }
});

test("prepare rechecks active-base projection health after the target probe", async () => {
  let fixture: LiveWorkerLaunchFixture | undefined;
  try {
    fixture = await createLiveWorkerLaunchFixture();
    const agentsPath = join(fixture.projectRoot, "AGENTS.md");
    await expect(prepareProjectWorkerLaunchContext({
      projectRoot: fixture.projectRoot,
      assignedRoot: fixture.roots.reviewer,
      target: "codex",
      repoRoot: process.cwd(),
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
    }, {
      probe: async () => {
        await writeFile(agentsPath, "drifted after planning\n");
        return { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" };
      },
    })).rejects.toMatchObject({ code: "LAUNCH_BASE_PROJECTION_STALE" });
  } finally {
    await removeLiveWorkerLaunchFixture(fixture);
  }
});
