// ABOUTME: Configures one target-bound secret from stdin and exposes metadata only.
// ABOUTME: Secret bytes never enter argv, journals, output, reflected errors, or retained exceptions.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";
import { resolveCredentialsPath } from "../../core/paths";
import type { ManagementJsonObject } from "../../core/management/contracts";
import { renderManagementCommandFailure, type ManagementReadDependencies } from "../../core/management/organizations";
import { resolveCloudProfile } from "../../core/management/profile";
import { renderManagementResultHuman, renderManagementResultJson } from "../../core/management/results";
import { setDeployedWorkerSecret } from "../../core/management/secrets";
import { resolveVerifiedWorkerTarget } from "../../core/management/workers";

type SecretKind = "mcp" | "env";
type WorkerSecretDeps = ManagementReadDependencies & { env?: Record<string, string | undefined> };

async function readStdin(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

export class WorkerSecretSetCommand extends BaseCommand {
  static override paths = [["worker", "secret", "set"]];
  static testDeps: WorkerSecretDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Set one Deployed Worker secret from stdin.",
    details: "Reads non-interactive stdin only. MCP names are canonical uppercase names; env kind requires --env-var and sends that canonical name. Results contain metadata and revisions only.",
    examples: [
      ["Set an MCP secret", "printf '%s' \"$TOKEN\" | drwn worker secret set MCP_TOKEN"],
      ["Set an env secret", "printf '%s' \"$KEY\" | drwn worker secret set provider-key --kind env --env-var PROVIDER_API_KEY"],
    ],
  });
  name = Option.String({ required: true });
  deployedWorkerId = Option.String("--deployed-worker", { description: "Explicit Deployed Worker ID; otherwise use the verified project binding." });
  kind = Option.String("--kind", "mcp", { description: "Secret mapping kind: mcp or env." });
  envVar = Option.String("--env-var", { required: false, description: "Canonical env name required only for --kind env." });
  json = Option.Boolean("--json", false, { description: "Emit the strict metadata-only command result." });

  async execute(): Promise<number> {
    const stdin = this.context.stdin as NodeJS.ReadableStream & { isTTY?: boolean };
    if (stdin.isTTY === true) {
      this.context.stderr.write("Secret input must be piped on stdin; interactive input is disabled.\n");
      return 1;
    }
    if (this.kind !== "mcp" && this.kind !== "env") {
      this.context.stderr.write("--kind must be mcp or env.\n");
      return 1;
    }
    const kind = this.kind as SecretKind;
    if (kind === "env" && !this.envVar) {
      this.context.stderr.write("--env-var is required for --kind env.\n");
      return 1;
    }
    if (kind === "mcp" && this.envVar) {
      this.context.stderr.write("--env-var is only valid for --kind env.\n");
      return 1;
    }
    const remoteName = kind === "env" ? this.envVar! : this.name;
    if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(remoteName)) {
      this.context.stderr.write("Secret name must be canonical uppercase letters, digits, and underscores.\n");
      return 1;
    }
    const value = await readStdin(stdin);
    if (value.trim().length === 0) {
      this.context.stderr.write("Secret input must be non-empty.\n");
      return 1;
    }

    const deps = WorkerSecretSetCommand.testDeps ?? {};
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
      const result = await setDeployedWorkerSecret({
        ...connection,
        deployedWorkerId: verified.target.selection.deployedWorkerId,
        name: remoteName,
        value,
        expectedWorkerRevision: Number(worker.workerRevision),
      }, deps);
      const output = this.json
        ? renderManagementResultJson(result)
        : result.outcome === "succeeded"
          ? `Configured secret ${result.data!.name}; secret revision ${result.data!.secretRevision}; Worker revision ${result.data!.workerRevision}.\n`
          : renderManagementResultHuman(result);
      (result.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
      return result.outcome === "succeeded" ? 0 : 1;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
