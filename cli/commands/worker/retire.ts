// ABOUTME: Retires one verified Deployed Worker using exact observed revisions and explicit confirmation.
// ABOUTME: Project binding clears only after authoritative retired detail readback.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { resolveCredentialsPath } from "../../core/paths";
import type { ManagementJsonObject } from "../../core/management/contracts";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { retireDeployedWorker, type RetirementDependencies } from "../../core/management/retirement";
import { renderManagementResultHuman, renderManagementResultJson } from "../../core/management/results";
import { resolveVerifiedWorkerTarget } from "../../core/management/workers";

type WorkerRetireDeps = RetirementDependencies & { env?: Record<string, string | undefined> };

export class WorkerRetireCommand extends BaseCommand {
  static override paths = [["worker", "retire"]];
  static testDeps: WorkerRetireDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Retire one Deployed Worker with exact revision preconditions.",
    details: "Requires --yes, authorized detail, revisioned retirement, and retired detail readback before local project binding is cleared.",
    examples: [
      ["Retire the project-bound Worker", "drwn worker retire --yes"],
      ["Retire an explicit target", "drwn worker retire --deployed-worker deployed_worker_alpha --yes --json"],
    ],
  });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  yes = Option.Boolean("--yes", false, { description: "Confirm revisioned retirement." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    if (!this.yes) {
      this.context.stderr.write("Refusing retirement without --yes.\n");
      return 1;
    }
    const deps = WorkerRetireCommand.testDeps ?? {};
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
        this.context.stderr.write(output); return 1;
      }
      const worker = verified.result.data!.worker as ManagementJsonObject;
      const result = await retireDeployedWorker({
        ...connection,
        projectRoot,
        profileDigest: profile.profileDigest,
        organizationId: String(worker.organizationId),
        workerId: String(worker.workerId),
        deployedWorkerId: String(worker.deployedWorkerId),
        expectedWorkerRevision: Number(worker.workerRevision),
        expectedBindingRevision: Number(worker.bindingRevision),
      }, deps);
      const output = this.json
        ? renderManagementResultJson(result)
        : result.outcome === "succeeded"
          ? `Retired Deployed Worker ${result.data!.deployedWorkerId}; Worker revision ${result.data!.workerRevision}; binding revision ${result.data!.bindingRevision}.\n`
          : renderManagementResultHuman(result);
      (result.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
      return result.outcome === "succeeded" ? 0 : 1;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
