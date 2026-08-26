// ABOUTME: Lists Deployed Workers for the selected organization through the strict management kernel.
// ABOUTME: Collection authority uses organization IDs and never the retired Mind or slug routes.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementCommandFailure, type ManagementReadDependencies } from "../../core/management/organizations";
import { renderManagementResultJson } from "../../core/management/results";
import { listSelectedOrganizationWorkers, renderWorkerResultHuman } from "../../core/management/workers";

type WorkerListDeps = ManagementReadDependencies & { env?: Record<string, string | undefined> };

export class WorkerListCommand extends BaseCommand {
  static override paths = [["worker", "list"]];
  static testDeps: WorkerListDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "List Deployed Workers in the selected organization.",
    details: "Uses the DAH-authorized deployed Worker collection with bounded pagination and optional environment filtering.",
    examples: [["List selected-organization Workers", "drwn worker list"], ["List production Workers as JSON", "drwn worker list --environment production --json"]],
  });
  environment = Option.String("--environment", { description: "Filter by development, staging, or production." });
  limit = Option.String("--limit", { description: "Page size from 1 through 100." });
  cursor = Option.String("--cursor", { description: "Opaque continuation cursor (maximum 512 characters)." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerListCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const result = await listSelectedOrganizationWorkers({
        credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend,
        homeDir: this.context.homeDir, profileDigest: profile.profileDigest,
        ...(this.environment === undefined ? {} : { environment: this.environment }),
        ...(this.limit === undefined ? {} : { limit: Number(this.limit) }),
        ...(this.cursor === undefined ? {} : { cursor: this.cursor }),
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
