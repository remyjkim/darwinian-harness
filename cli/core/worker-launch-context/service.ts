// ABOUTME: Exposes project-scoped Worker launch planning without target execution or writes.
// ABOUTME: Composes stable source capture with the deterministic target-neutral planner.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { collectStableWorkerLaunchInput } from "./snapshot";
import { planWorkerLaunchContext, type PlannedWorkerLaunchContext } from "./plan";
import { probeWorkerLaunchTarget, runBoundedWorkerLaunchTargetProbe } from "./target-probe";
import { claudeWorkerLaunchDescriptor, renderClaudeWorkerLaunchContext } from "./claude-materializer";
import { codexWorkerLaunchDescriptor, renderCodexWorkerLaunchContext } from "./codex-materializer";
import { publishWorkerLaunchContext } from "./store";
import { DrwnError } from "../errors";
import { planRepositoryProjection } from "../sync";

export async function planProjectWorkerLaunchContext(input: {
  projectRoot: string;
  assignedRoot: string;
  target: "claude" | "codex";
  enabledOptionalMcp?: string[];
  strict?: boolean;
  repoRoot?: string;
  agentsDir?: string;
  homeDir?: string;
}): Promise<PlannedWorkerLaunchContext> {
  const stableInput = await collectStableWorkerLaunchInput({
    projectRoot: input.projectRoot,
    syncOptions: {
      repoRoot: input.repoRoot,
      agentsDir: input.agentsDir,
      homeDir: input.homeDir,
      cwd: input.projectRoot,
    },
  });
  return await planWorkerLaunchContext({
    stableInput,
    assignedRoot: input.assignedRoot,
    target: input.target,
    enabledOptionalMcp: input.enabledOptionalMcp,
    strict: input.strict,
  });
}

type PlanProjectInput = Parameters<typeof planProjectWorkerLaunchContext>[0];

export async function prepareProjectWorkerLaunchContext(
  input: PlanProjectInput,
  dependencies: { probe?: typeof probeWorkerLaunchTarget } = {},
) {
  const planned = await planProjectWorkerLaunchContext(input);
  const compatibility = await (dependencies.probe ?? probeWorkerLaunchTarget)(input.target);
  const expectedLaunch = input.target === "claude"
    ? claudeWorkerLaunchDescriptor(planned.plan.plannedArtifactDir, planned.materialization)
    : codexWorkerLaunchDescriptor(planned.plan.projectRoot, planned.plan.plannedArtifactDir, planned.materialization);
  return await publishWorkerLaunchContext({
    planned,
    compatibility,
    expectedLaunch,
    assertBaseProjectionCurrent: planned.plan.baseRoot === null ? undefined : async () => {
      const projection = await planRepositoryProjection({
        repoRoot: input.repoRoot,
        agentsDir: input.agentsDir,
        homeDir: input.homeDir,
        cwd: planned.plan.projectRoot,
        scope: "project",
        forceMachineScope: false,
      });
      if (!projection.current) {
        throw new DrwnError(
          "LAUNCH_BASE_PROJECTION_STALE",
          "The active Worker project projection changed after launch-context planning",
          ["Run drwn write and prepare the launch context again."],
        );
      }
    },
    render: async (stageDir) => {
      if (input.target === "claude") {
        const rendered = await renderClaudeWorkerLaunchContext({
          stageDir,
          artifactDir: planned.plan.plannedArtifactDir,
          assignedClosureDigest: planned.sourceState.assignedClosureDigest,
          materialization: planned.materialization,
        });
        if (rendered.targetDir && existsSync(join(rendered.targetDir, ".claude-plugin", "plugin.json"))) {
          const validation = await runBoundedWorkerLaunchTargetProbe([
            "claude",
            "plugin",
            "validate",
            "--strict",
            rendered.targetDir,
          ]);
          if (validation.exitCode !== 0 || validation.timedOut || validation.overflowed) {
            throw new DrwnError("LAUNCH_MATERIALIZATION_FAILED", "Claude rejected the generated Worker launch plugin");
          }
        }
        return rendered;
      }
      return await renderCodexWorkerLaunchContext({
        projectRoot: planned.plan.projectRoot,
        stageDir,
        artifactDir: planned.plan.plannedArtifactDir,
        materialization: planned.materialization,
      });
    },
  });
}
