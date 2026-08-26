// ABOUTME: Starts a target-bound management run and optionally performs bounded typed polling.
// ABOUTME: Streaming events, raw poll bodies, slug routes, and unscoped run IDs are removed.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveProjectRootFromConfigPath } from "../../core/project";
import type { ManagementJsonObject } from "../../core/management/contracts";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementResultHuman, renderManagementResultJson } from "../../core/management/results";
import { createRun, pollRunToTerminal, type RunDependencies } from "../../core/management/runs";
import { resolveWorkerTarget } from "../../core/management/workers";

type WorkerChatDeps = RunDependencies & {
  env?: Record<string, string | undefined>;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
};

function terminalExit(result: Parameters<typeof renderManagementResultJson>[0]): number {
  if (result.outcome !== "succeeded") return 1;
  const run = result.data?.run as ManagementJsonObject | undefined;
  return run && (run.status === "failed" || run.status === "cancelled") ? 1 : 0;
}

export class WorkerChatCommand extends BaseCommand {
  static override paths = [["worker", "chat"]];
  static testDeps: WorkerChatDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Start a Deployed Worker run and optionally wait for terminal status.",
    details: "Creates one target-bound run. Waiting uses bounded typed runs.read polling only; no ACP, streaming, or raw event surface is used.",
    examples: [
      ["Run the project-bound Worker", "drwn worker chat --message \"hello\""],
      ["Start without polling", "drwn worker chat --deployed-worker deployed_worker_alpha --message \"hello\" --no-wait --json"],
    ],
  });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  message = Option.String("--message", { required: true, description: "Bounded run input." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });
  noWait = Option.Boolean("--no-wait", false, { description: "Return the queued run receipt without polling." });

  async execute(): Promise<number> {
    const deps = WorkerChatCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const projectRoot = this.context.projectConfigPath ? resolveProjectRootFromConfigPath(this.context.projectConfigPath) : null;
      const connection = { credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend };
      const target = await resolveWorkerTarget({
        ...connection, homeDir: this.context.homeDir, projectRoot,
        profileDigest: profile.profileDigest, explicitId: this.deployedWorkerId,
      });
      const created = await createRun({
        ...connection, deployedWorkerId: target.selection.deployedWorkerId, input: this.message,
      }, deps);
      if (created.outcome !== "succeeded" || this.noWait) {
        const output = this.json ? renderManagementResultJson(created) : renderManagementResultHuman(created);
        (created.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
        return created.outcome === "succeeded" ? 0 : 1;
      }
      const result = await pollRunToTerminal({
        ...connection,
        deployedWorkerId: target.selection.deployedWorkerId,
        runId: String(created.data!.runId),
        maxAttempts: deps.maxPollAttempts ?? 80,
        intervalMs: deps.pollIntervalMs ?? 1_500,
      }, deps);
      const exitCode = terminalExit(result);
      if (this.json) {
        (exitCode === 0 ? this.context.stdout : this.context.stderr).write(renderManagementResultJson(result));
      } else if (result.outcome === "succeeded") {
        const run = result.data!.run as ManagementJsonObject;
        if (exitCode === 0) {
          this.context.stdout.write(`Run: ${run.runId}\nStatus: ${run.status}\n${run.output ? `${run.output}\n` : ""}`);
        } else {
          this.context.stderr.write(`${String(run.status).toUpperCase()}: run ended without success.\n`);
        }
      } else {
        this.context.stderr.write(renderManagementResultHuman(result));
      }
      return exitCode;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
