// ABOUTME: Implements resumable Deployed Worker registration from explicit non-secret organization intent.
// ABOUTME: The server allocates Worker identity and project context follows verified detail readback only.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { resolveCredentialsPath } from "../../core/paths";
import { renderManagementCommandFailure } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import {
  registerDeployedWorker,
  renderRegistrationResultHuman,
  type RegistrationDependencies,
} from "../../core/management/registration";
import { renderManagementResultJson } from "../../core/management/results";

type WorkerRegisterDeps = RegistrationDependencies & { env?: Record<string, string | undefined> };

export class WorkerRegisterCommand extends BaseCommand {
  static override paths = [["worker", "register"]];
  static testDeps: WorkerRegisterDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Create or resolve one attached Deployed Worker.",
    details: "Persists a non-secret operation before send, replays the same request ID after interruption, and binds this project only after detail readback.",
    examples: [
      ["Register a staging Worker", "drwn worker register --organization org_acme --name worker-alpha --environment staging"],
      ["Emit the verified registration receipt", "drwn worker register --organization org_acme --name worker-alpha --environment staging --json"],
    ],
  });
  organizationId = Option.String("--organization", { required: true, description: "Exact visible organization ID." });
  name = Option.String("--name", { required: true, description: "Deployed Worker display name." });
  environment = Option.String("--environment", { required: true, description: "development, staging, or production." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = WorkerRegisterCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const result = await registerDeployedWorker({
        projectRoot: requireProjectRoot(this),
        profileDigest: profile.profileDigest,
        credentialsPath: resolveCredentialsPath(this.context.agentsDir),
        env,
        keychainBackend: deps.keychainBackend,
        organizationId: this.organizationId,
        name: this.name,
        environment: this.environment,
      }, deps);
      const output = this.json ? renderManagementResultJson(result) : renderRegistrationResultHuman(result);
      (result.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
      return result.outcome === "succeeded" ? 0 : 1;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
