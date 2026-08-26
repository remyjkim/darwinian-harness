// ABOUTME: Activates one explicitly named deployment attempt under a verified Deployed Worker target.
// ABOUTME: Current revision comes from authoritative detail; previous/latest inference is removed.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { resolveCredentialsPath } from "../../core/paths";
import { renderDeploymentResultHuman, rollbackDeployment, type DeploymentDependencies } from "../../core/management/deployments";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementResultHuman, renderManagementResultJson } from "../../core/management/results";
import { resolveVerifiedWorkerTarget } from "../../core/management/workers";
import type { ManagementJsonObject } from "../../core/management/contracts";

type WorkerRollbackDeps = DeploymentDependencies & { env?: Record<string, string | undefined> };

export class WorkerRollbackCommand extends BaseCommand {
  static override paths = [["worker", "rollback"]];
  static testDeps: WorkerRollbackDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Activate one explicit owned deployment attempt.",
    details: "Requires --to with a typed deployment ID and uses the current authoritative Worker revision. It never infers previous or latest.",
    examples: [
      ["Activate an attempt", "drwn worker rollback --to deployment_attempt_0001"],
      ["Use an explicit target", "drwn worker rollback --deployed-worker deployed_worker_alpha --to deployment_attempt_0001 --json"],
    ],
  });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  to = Option.String("--to", { required: true, description: "Exact owned deployment ID to activate." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerRollbackCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const projectRoot = requireProjectRoot(this);
      const profile = resolveCloudProfile(env);
      const connection = { credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend };
      const verified = await resolveVerifiedWorkerTarget({
        ...connection, homeDir: this.context.homeDir, projectRoot,
        profileDigest: profile.profileDigest, explicitId: this.deployedWorkerId,
      }, deps);
      if (verified.result.outcome !== "succeeded") {
        const output = this.json ? renderManagementResultJson(verified.result) : renderManagementResultHuman(verified.result);
        this.context.stderr.write(output);
        return 1;
      }
      const worker = verified.result.data!.worker as ManagementJsonObject;
      const result = await rollbackDeployment({
        ...connection, projectRoot, profileDigest: profile.profileDigest,
        deployedWorkerId: verified.target.selection.deployedWorkerId,
        deploymentId: this.to,
        expectedWorkerRevision: Number(worker.workerRevision),
      }, deps);
      const output = this.json ? renderManagementResultJson(result) : renderDeploymentResultHuman(result);
      (result.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
      return result.outcome === "succeeded" ? 0 : 1;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
