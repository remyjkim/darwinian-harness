// ABOUTME: Stages one portable immutable artifact and creates a deployment under an existing target.
// ABOUTME: Identity creation, slug routes, deploy-time secrets, model overrides, and readiness polling are removed.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { resolveCredentialsPath } from "../../core/paths";
import { buildWorkerDeployPayload, type WorkerDeployPayload } from "../../core/worker-deploy";
import { stageDeploymentArtifact, type DeploymentArtifactDependencies } from "../../core/management/deployment-artifacts";
import { createDeployment, renderDeploymentResultHuman, type DeploymentDependencies } from "../../core/management/deployments";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementResultHuman, renderManagementResultJson } from "../../core/management/results";
import { resolveVerifiedWorkerTarget } from "../../core/management/workers";
import type { ManagementJsonObject } from "../../core/management/contracts";

type WorkerDeployDeps = DeploymentDependencies & DeploymentArtifactDependencies & {
  env?: Record<string, string | undefined>;
  buildPayload?: (input: Parameters<typeof buildWorkerDeployPayload>[0]) => Promise<WorkerDeployPayload>;
};

function writeResult(command: WorkerDeployCommand, result: Parameters<typeof renderManagementResultJson>[0]): number {
  const output = command.json ? renderManagementResultJson(result) : renderManagementResultHuman(result);
  (result.outcome === "succeeded" ? command.context.stdout : command.context.stderr).write(output);
  return result.outcome === "succeeded" ? 0 : 1;
}

export class WorkerDeployCommand extends BaseCommand {
  static override paths = [["worker", "deploy"]];
  static testDeps: WorkerDeployDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Create a deployment attempt from one portable Worker artifact.",
    details: "Builds canonical portable bytes, stages them immutably under the verified target, then journals only the artifact reference and expected Worker revision.",
    examples: [
      ["Deploy the project-bound Worker", "drwn worker deploy @team/worker@1.0.0"],
      ["Deploy to an explicit target", "drwn worker deploy @team/worker@1.0.0 --deployed-worker deployed_worker_alpha --json"],
    ],
  });
  cardRef = Option.String({ required: true });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerDeployCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const projectRoot = requireProjectRoot(this);
      const profile = resolveCloudProfile(env);
      const connection = {
        credentialsPath: resolveCredentialsPath(this.context.agentsDir),
        env,
        keychainBackend: deps.keychainBackend,
      };
      const verified = await resolveVerifiedWorkerTarget({
        ...connection,
        homeDir: this.context.homeDir,
        projectRoot,
        profileDigest: profile.profileDigest,
        explicitId: this.deployedWorkerId,
      }, deps);
      if (verified.result.outcome !== "succeeded") return writeResult(this, verified.result);
      const worker = verified.result.data!.worker as ManagementJsonObject;
      const payload = await (deps.buildPayload ?? buildWorkerDeployPayload)({
        agentsDir: this.context.agentsDir,
        cardRef: this.cardRef,
        projectRoot,
        resolveOptions: { allowUntrustedSource: true },
      });
      const staged = await stageDeploymentArtifact({
        ...connection,
        deployedWorkerId: verified.target.selection.deployedWorkerId,
        payload,
      }, deps);
      if (staged.result.outcome !== "succeeded") return writeResult(this, staged.result);
      const result = await createDeployment({
        ...connection,
        projectRoot,
        profileDigest: profile.profileDigest,
        deployedWorkerId: verified.target.selection.deployedWorkerId,
        artifactRef: staged.artifact.artifactRef,
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
