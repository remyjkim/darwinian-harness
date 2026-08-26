// ABOUTME: Reads one Deployed Worker by explicit ID or an exact verified project binding.
// ABOUTME: Remote detail is authoritative; local Card governance and slug search never affect status.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveProjectRootFromConfigPath } from "../../core/project";
import { loadMachineCloudContext, loadProjectCloudContext } from "../../core/management/context-store";
import { resolveCloudProfile } from "../../core/management/profile";
import {
  renderManagementCommandFailure,
  requireSelectedOrganizationId,
  type ManagementReadDependencies,
} from "../../core/management/organizations";
import { renderManagementResultJson } from "../../core/management/results";
import { resolveDeployedWorkerSelector } from "../../core/management/selector";
import { readDeployedWorker, renderWorkerResultHuman } from "../../core/management/workers";

type WorkerStatusDeps = ManagementReadDependencies & { env?: Record<string, string | undefined> };

export class WorkerStatusCommand extends BaseCommand {
  static override paths = [["worker", "status"]];
  static testDeps: WorkerStatusDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Read authoritative Deployed Worker status by ID.",
    details: "An explicit deployedWorkerId wins; otherwise the exact active-profile project binding is used.",
    examples: [["Read an explicit Deployed Worker", "drwn worker status deployed_worker_alpha"], ["Read the verified project binding", "drwn worker status --json"]],
  });
  deployedWorkerId = Option.String({ required: false });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerStatusCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const machineContext = await loadMachineCloudContext(this.context.homeDir);
      const organizationId = requireSelectedOrganizationId(machineContext, profile.profileDigest);
      const projectRoot = this.context.projectConfigPath ? resolveProjectRootFromConfigPath(this.context.projectConfigPath) : null;
      const projectContext = projectRoot ? await loadProjectCloudContext(projectRoot) : null;
      const selection = resolveDeployedWorkerSelector({
        explicitId: this.deployedWorkerId,
        projectContext,
        profileDigest: profile.profileDigest,
        organizationId,
      });
      const result = await readDeployedWorker({
        credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend,
        organizationId, deployedWorkerId: selection.deployedWorkerId,
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
