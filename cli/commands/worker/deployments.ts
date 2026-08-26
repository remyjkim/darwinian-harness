// ABOUTME: Lists deployment attempts for one exact Deployed Worker target with bounded pagination.
// ABOUTME: No slug, name, latest-row, or list-cardinality inference participates in selection.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveProjectRootFromConfigPath } from "../../core/project";
import { listDeployments, renderDeploymentResultHuman, type DeploymentDependencies } from "../../core/management/deployments";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementResultJson } from "../../core/management/results";
import { resolveWorkerTarget } from "../../core/management/workers";

type WorkerDeploymentsDeps = DeploymentDependencies & { env?: Record<string, string | undefined> };

export class WorkerDeploymentsCommand extends BaseCommand {
  static override paths = [["worker", "deployments"]];
  static testDeps: WorkerDeploymentsDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "List deployment attempts for one Deployed Worker ID.",
    details: "Uses an explicit target or exact verified project binding and the protocol's bounded opaque cursor.",
    examples: [
      ["List project-bound attempts", "drwn worker deployments"],
      ["List an explicit target", "drwn worker deployments --deployed-worker deployed_worker_alpha --limit 50 --json"],
    ],
  });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  limit = Option.String("--limit", { description: "Page size from 1 through 100." });
  cursor = Option.String("--cursor", { description: "Opaque continuation cursor (maximum 512 characters)." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerDeploymentsCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const projectRoot = this.context.projectConfigPath ? resolveProjectRootFromConfigPath(this.context.projectConfigPath) : null;
      const connection = { credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend };
      const target = await resolveWorkerTarget({
        ...connection, homeDir: this.context.homeDir, projectRoot,
        profileDigest: profile.profileDigest, explicitId: this.deployedWorkerId,
      });
      const result = await listDeployments({
        ...connection,
        deployedWorkerId: target.selection.deployedWorkerId,
        ...(this.limit === undefined ? {} : { limit: Number(this.limit) }),
        ...(this.cursor === undefined ? {} : { cursor: this.cursor }),
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
