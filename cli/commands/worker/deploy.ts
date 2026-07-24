// ABOUTME: Implements drwn worker deploy against the Deploy API.
// ABOUTME: Uploads card refs and optional MCP tokens, then polls deployment status.

import { readFileSync } from "node:fs";
import { Option } from "clipanion";
import * as t from "typanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";
import { defaultSecretsFileCandidates, DRWN_SECRETS_FILE, parseSecretsFile } from "../../core/worker-secrets";
import { buildWorkerDeployPayload } from "../../core/worker-deploy";
import { DrwnError } from "../../core/errors";
import { writeMindBinding } from "../../core/mind-store/bindings";
import { resolveProjectRootFromConfigPath } from "../../core/project";

export const DEPLOY_TARGETS = ["preview", "production"] as const;

export class WorkerDeployCommand extends BaseCommand {
  static override paths = [["worker", "deploy"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Deploy a worker harness card.",
    details: `
      Accepts drwn card refs such as github:owner/repo#v1.0.0, git+https://...
      refs, and semver-style tags. Materialization happens server-side; the CLI
      sends the deploy request, uploads optional MCP token values from a local
      secrets file, and polls until the deployment is ready or failed.

      By default, secrets are read from .drwn.secrets, with .iminds.secrets kept
      as a one-release fallback when the new file is absent.
    `,
    examples: [
      ["Deploy a card from GitHub", "drwn worker deploy github:curation-labs/harari-worker#v1.4.0 --name harari"],
      ["Preview deploy", "drwn worker deploy github:owner/repo#v2.0.0 --name my-worker --env preview"],
    ],
  });

  cardRef = Option.String();

  name = Option.String("--name", {
    description: "Worker slug used by the deployment gateway.",
  });

  model = Option.String("--model", {
    description: "Model id override, for example anthropic/claude-sonnet-4-5.",
  });

  env = Option.String("--env", "production", {
    validator: t.isEnum(DEPLOY_TARGETS),
    description: "Deployment target: preview or production.",
  });

  secretsFile = Option.String("--secrets-file", {
    description:
      `Path to local MCP token file (default: ${DRWN_SECRETS_FILE}). Lines: <server>=<token>.`,
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    if (this.cardRef.startsWith("file:")) {
      this.context.stderr.write("file: refs (tarball upload) are not supported yet - use a git+/github:/gitlab: ref.\n");
      return 1;
    }
    if (!this.name) {
      this.context.stderr.write("--name is required.\n");
      return 1;
    }

    let secrets: Record<string, string> = {};
    if (this.secretsFile) {
      try {
        secrets = parseSecretsFile(readFileSync(this.secretsFile, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          this.context.stderr.write(`Warning: --secrets-file "${this.secretsFile}" not found; no tokens uploaded.\n`);
        } else {
          this.context.stderr.write(`Cannot read secrets file "${this.secretsFile}": ${(error as Error).message}\n`);
          return 1;
        }
      }
    } else {
      for (const secretsPath of defaultSecretsFileCandidates()) {
        try {
          secrets = parseSecretsFile(readFileSync(secretsPath, "utf8"));
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            this.context.stderr.write(`Cannot read secrets file "${secretsPath}": ${(error as Error).message}\n`);
            return 1;
          }
        }
      }
    }

    this.context.stdout.write(`Creating deployment for ${this.name} from ${this.cardRef}...\n`);
    const hasSecrets = Object.keys(secrets).length > 0;
    if (hasSecrets) {
      this.context.stdout.write("Uploading MCP tokens:\n");
      for (const server of Object.keys(secrets)) {
        this.context.stdout.write(`  ${server}: **** (set)\n`);
      }
    }

    const body: Record<string, unknown> = { cardRef: this.cardRef, name: this.name, model: this.model };
    if (hasSecrets) body.secrets = secrets;

    try {
      const blueprint = await buildWorkerDeployPayload({
        agentsDir: this.context.agentsDir,
        cardRef: this.cardRef,
        projectRoot: this.context.projectConfigPath ? resolveProjectRootFromConfigPath(this.context.projectConfigPath) : null,
        resolveOptions: {
          allowUntrustedSource: true,
        },
      });
      body.blueprint = blueprint;
      this.context.stdout.write(`Resolved ${this.cardRef} with ${blueprint.lockfile.cards.length} locked card(s).\n`);
    } catch (error) {
      const detail = error instanceof DrwnError ? `${error.code}: ${error.message}` : (error as Error).message;
      this.context.stderr.write(`Cannot build deploy payload for ${this.cardRef}: ${detail}\n`);
      return 1;
    }

    let created: { deploymentId?: string; mindId?: string; error?: string };
    try {
      const { response: res, body: createdBody } = await fetchJsonWithWorkerAuth<{ deploymentId?: string; mindId?: string; error?: string }>(this.context, `${apiBaseUrl}/api/deployments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      created = createdBody;
      if (!res.ok || !created.deploymentId) {
        this.context.stderr.write(`Deploy request failed (${res.status}): ${created.error ?? "unknown error"}\n`);
        return 1;
      }
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }

    const depId = created.deploymentId;
    const pollMs = Number(process.env.DRWN_POLL_MS ?? process.env.IMINDS_POLL_MS ?? 4000);
    const deadline = Date.now() + 5 * 60_000;
    let lastStatus = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      let deployment: { status?: string; error?: string };
      try {
        deployment = (await fetchJsonWithWorkerAuth<{ status?: string; error?: string }>(
          this.context,
          `${apiBaseUrl}/api/deployments/${depId}`,
        )).body;
      } catch {
        continue;
      }
      if (deployment.status && deployment.status !== lastStatus) {
        this.context.stdout.write(`${deployment.status}\n`);
        lastStatus = deployment.status;
      }
      if (deployment.status === "ready") {
        this.context.stdout.write(`Deployment ${depId} is ready.\n`);
        this.context.stdout.write(`Worker: ${this.name}\n`);
        if (created.mindId) {
          this.context.stdout.write(`Mind: ${created.mindId}\n`);
          await this.captureMindBinding(apiBaseUrl, created.mindId);
        }
        this.context.stdout.write(`Chat: ${apiBaseUrl}/api/minds/${this.name}/chat\n`);
        this.context.stdout.write(`Status: drwn worker status ${this.name}\n`);
        return 0;
      }
      if (deployment.status === "failed") {
        this.context.stderr.write(`Deployment ${depId} failed: ${deployment.error ?? "unknown error"}\n`);
        this.context.stderr.write(`Details: drwn worker deployments ${this.name}\n`);
        return 1;
      }
    }
    this.context.stderr.write(`Timed out waiting for deployment ${depId} to become ready.\n`);
    this.context.stderr.write(`Details: drwn worker deployments ${this.name}\n`);
    return 1;
  }

  // Caches non-secret binding coordinates for worker mind commands; tokens are never persisted.
  private async captureMindBinding(apiBaseUrl: string, mindId: string) {
    try {
      const { response, body } = await fetchJsonWithWorkerAuth<{
        binding?: { baseUrl?: string; tenantId?: number; filesystemId?: string; pathPrefix?: string };
      }>(this.context, `${apiBaseUrl}/api/minds/${this.name}/bgdb-token`, { method: "POST" });
      if (!response.ok || !body.binding) {
        await writeMindBinding(this.context.agentsDir, this.name!, { mindId });
        this.context.stdout.write("Note: mind binding not available from the deploy API yet; set BGDB_* env to use worker mind commands.\n");
        return;
      }
      await writeMindBinding(this.context.agentsDir, this.name!, {
        mindId,
        ...(body.binding.baseUrl ? { baseUrl: body.binding.baseUrl } : {}),
        ...(body.binding.tenantId !== undefined ? { tenantId: body.binding.tenantId } : {}),
        ...(body.binding.filesystemId ? { filesystemId: body.binding.filesystemId } : {}),
        ...(body.binding.pathPrefix ? { pathPrefix: body.binding.pathPrefix } : {}),
      });
      this.context.stdout.write(`Mind binding cached (prefix: ${body.binding.pathPrefix ?? "unknown"}). Provision with: drwn worker mind provision\n`);
    } catch {
      await writeMindBinding(this.context.agentsDir, this.name!, { mindId });
      this.context.stdout.write("Note: mind binding not available from the deploy API yet; set BGDB_* env to use worker mind commands.\n");
    }
  }
}
