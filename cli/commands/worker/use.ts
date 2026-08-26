// ABOUTME: Verifies an explicit Deployed Worker ID before binding it to the current project.
// ABOUTME: Organization mismatch and failed detail readback leave project context unchanged.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementCommandFailure, type ManagementReadDependencies } from "../../core/management/organizations";
import { renderManagementResultJson } from "../../core/management/results";
import { renderWorkerResultHuman, useDeployedWorker } from "../../core/management/workers";

type WorkerUseDeps = ManagementReadDependencies & { env?: Record<string, string | undefined> };

export class WorkerUseCommand extends BaseCommand {
  static override paths = [["worker", "use"]];
  static testDeps: WorkerUseDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Verify and bind one Deployed Worker ID to this project.",
    details: "Requires a selected organization and successful detail readback before project context is written.",
    examples: [["Bind a Deployed Worker", "drwn worker use deployed_worker_alpha"], ["Bind and emit the verified receipt", "drwn worker use deployed_worker_alpha --json"]],
  });
  deployedWorkerId = Option.String({ required: true });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerUseCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const result = await useDeployedWorker({
        credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend,
        homeDir: this.context.homeDir, projectRoot: requireProjectRoot(this),
        profileDigest: profile.profileDigest, deployedWorkerId: this.deployedWorkerId,
      }, deps);
      const output = this.json ? renderManagementResultJson(result) : renderWorkerResultHuman(result);
      (result.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
      return result.outcome === "succeeded" ? 0 : 1;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
