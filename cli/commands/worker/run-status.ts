// ABOUTME: Reads one run only under its exact selected Deployed Worker target.
// ABOUTME: Human and JSON output derive from the strict run summary with no raw events.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveProjectRootFromConfigPath } from "../../core/project";
import type { ManagementJsonObject } from "../../core/management/contracts";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementResultHuman, renderManagementResultJson } from "../../core/management/results";
import { readRun, type RunDependencies } from "../../core/management/runs";
import { resolveWorkerTarget } from "../../core/management/workers";

type WorkerRunStatusDeps = RunDependencies & { env?: Record<string, string | undefined> };

export class WorkerRunStatusCommand extends BaseCommand {
  static override paths = [["worker", "run", "status"]];
  static testDeps: WorkerRunStatusDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Read one target-bound Deployed Worker run.",
    details: "Requires an exact run ID plus explicit or project-bound Deployed Worker target. Wrong-target and unavailable runs are non-enumerating.",
    examples: [
      ["Read a project-bound run", "drwn worker run status run_0001"],
      ["Read an explicit target", "drwn worker run status run_0001 --deployed-worker deployed_worker_alpha --json"],
    ],
  });
  runId = Option.String({ required: true });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerRunStatusCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const projectRoot = this.context.projectConfigPath ? resolveProjectRootFromConfigPath(this.context.projectConfigPath) : null;
      const connection = { credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend };
      const target = await resolveWorkerTarget({
        ...connection, homeDir: this.context.homeDir, projectRoot,
        profileDigest: profile.profileDigest, explicitId: this.deployedWorkerId,
      });
      const result = await readRun({
        ...connection, deployedWorkerId: target.selection.deployedWorkerId, runId: this.runId,
      }, deps);
      const run = result.outcome === "succeeded" ? result.data!.run as ManagementJsonObject : null;
      const terminalFailure = run?.status === "failed" || run?.status === "cancelled";
      const output = this.json
        ? renderManagementResultJson(result)
        : result.outcome !== "succeeded"
          ? renderManagementResultHuman(result)
          : terminalFailure
            ? `${String(run!.status).toUpperCase()}: run ended without success.\n`
            : `Run: ${run!.runId}\nStatus: ${run!.status}\n${run!.output ? `${run!.output}\n` : ""}`;
      const exitCode = result.outcome === "succeeded" && !terminalFailure ? 0 : 1;
      (exitCode === 0 ? this.context.stdout : this.context.stderr).write(output);
      return exitCode;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
