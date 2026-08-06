// ABOUTME: Implements drwn worker status for a worker.
// ABOUTME: Shows latest and active deployment state, including first-deploy progress.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { loadCardLock } from "../../core/card-lock";
import { loadProjectConfig } from "../../core/project";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";
import { renderJson } from "../../core/output";
import type { DeploymentsResponse, WorkerSummary } from "./types";
import { displayModel, displayValue } from "./types";

export class WorkerStatusCommand extends BaseCommand {
  static override paths = [["worker", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Show the active deployment and health of a worker.",
    details: `
      Reads the worker list and deployment history endpoints, then prints the
      latest deployment and the active deployment separately. This makes pending
      first deployments visible before a worker has an active serving alias.
    `,
    examples: [
      ["Check a worker", "drwn worker status harari"],
      ["Check a worker as JSON", "drwn worker status harari --json"],
    ],
  });

  slug = Option.String();

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON.",
  });

  /**
   * Declared-vs-enforced governance (I220): report the local active root's declared
   * tools rules with the literal truth that the deployed runtime enforces none of them.
   * Display-only — local project problems must never break deployment status.
   */
  private async renderGovernance(): Promise<void> {
    try {
      const cwd = process.cwd();
      const configPath = join(cwd, ".agents", "drwn", "config.json");
      if (!existsSync(configPath)) return;
      const config = await loadProjectConfig(configPath);
      if (!config.activeWorker) return;
      const lock = await loadCardLock(cwd);
      const tools = lock?.cards.find((card) => card.name === config.activeWorker)?.manifest.tools;
      const allow = tools?.allow?.length ?? 0;
      const deny = tools?.deny?.length ?? 0;
      if (allow === 0 && deny === 0) return;
      this.context.stdout.write("Governance (deployed):\n");
      if (allow > 0) {
        this.context.stdout.write(`  tools.allow: ${allow}   declared — not enforced by the deployed runtime\n`);
      }
      if (deny > 0) {
        this.context.stdout.write(`  tools.deny: ${deny}   declared — not enforced by the deployed runtime\n`);
      }
    } catch {
      return;
    }
  }

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    let worker: WorkerSummary | undefined;
    try {
      // external contract: /api/minds response key `minds`
      const { response: res, body } = await fetchJsonWithWorkerAuth<{ minds: WorkerSummary[] }>(
        this.context,
        `${apiBaseUrl}/api/minds`,
      );
      if (!res.ok) {
        this.context.stderr.write(`Status failed (${res.status}).\n`);
        return 1;
      }
      const { minds } = body;
      worker = minds.find((candidate) => candidate.slug === this.slug);
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }
    if (!worker) {
      this.context.stderr.write(`No worker named "${this.slug}".\n`);
      return 1;
    }

    let history: DeploymentsResponse;
    try {
      const { response: res, body } = await fetchJsonWithWorkerAuth<DeploymentsResponse>(
        this.context,
        `${apiBaseUrl}/api/minds/${this.slug}/deployments`,
      );
      if (!res.ok) {
        this.context.stderr.write(`Status failed (${res.status}).\n`);
        return 1;
      }
      history = body;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }

    const latestDeployment = history.deployments[0] ?? null;
    const activeDeployment =
      history.deployments.find((deployment) => deployment.id === history.active_deployment_id) ?? null;
    const result = { worker, active_deployment_id: history.active_deployment_id, latestDeployment, activeDeployment };
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }

    this.context.stdout.write(`Worker: ${worker.slug}\n`);
    this.context.stdout.write(`Latest deployment: ${latestDeployment?.id ?? "-"}\n`);
    if (latestDeployment) {
      this.context.stdout.write(`Latest status: ${latestDeployment.status}\n`);
      this.context.stdout.write(`Latest card: ${latestDeployment.card_ref}\n`);
      this.context.stdout.write(`Latest model: ${displayModel(latestDeployment.model)}\n`);
      this.context.stdout.write(`Latest content hash: ${displayValue(latestDeployment.content_hash)}\n`);
      this.context.stdout.write(`Latest updated: ${latestDeployment.updated_at}\n`);
      if (latestDeployment.error) this.context.stdout.write(`Latest error: ${latestDeployment.error}\n`);
    }
    this.context.stdout.write(`Active deployment: ${activeDeployment?.id ?? "-"}\n`);
    await this.renderGovernance();
    if (activeDeployment) {
      this.context.stdout.write(`Active status: ${activeDeployment.status}\n`);
      this.context.stdout.write(`Active card: ${activeDeployment.card_ref}\n`);
      this.context.stdout.write(`Active model: ${displayModel(activeDeployment.model)}\n`);
      if (activeDeployment.status === "ready") {
        this.context.stdout.write(`Chat: ${apiBaseUrl}/api/minds/${worker.slug}/chat\n`);
      }
    }
    return 0;
  }
}
