// ABOUTME: Implements drwn worker deployments for per-worker deployment history.
// ABOUTME: Marks the active deployment and supports stable JSON output.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";
import { renderJson, renderTable } from "../../core/output";
import type { DeploymentsResponse } from "./types";
import { displayModel, displayValue } from "./types";

export class WorkerDeploymentsCommand extends BaseCommand {
  static override paths = [["worker", "deployments"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Show deployment history for a worker.",
    details: `
      Calls the deployment history endpoint for one worker and renders each
      deployment with status, card ref, model, content hash, timestamps, and any
      error text. The active deployment is marked with an asterisk.
    `,
    examples: [
      ["Show deployment history", "drwn worker deployments harari"],
      ["Show deployment history as JSON", "drwn worker deployments harari --json"],
    ],
  });

  slug = Option.String();

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    let body: DeploymentsResponse;
    try {
      const result = await fetchJsonWithWorkerAuth<DeploymentsResponse>(
        this.context,
        `${apiBaseUrl}/api/minds/${this.slug}/deployments`,
      );
      const res = result.response;
      if (!res.ok) {
        this.context.stderr.write(`Deployments failed (${res.status}).\n`);
        return 1;
      }
      body = result.body;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }

    if (this.json) {
      this.context.stdout.write(renderJson(body));
      return 0;
    }
    if (body.deployments.length === 0) {
      this.context.stdout.write(`No deployments for ${this.slug}.\n`);
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["active", "deployment", "status", "card", "model", "content_hash", "created", "updated", "error"],
        body.deployments.map((deployment) => [
          deployment.id === body.active_deployment_id ? "*" : "",
          deployment.id,
          deployment.status,
          deployment.card_ref,
          displayModel(deployment.model),
          displayValue(deployment.content_hash),
          deployment.created_at,
          deployment.updated_at,
          displayValue(deployment.error),
        ]),
      ),
    );
    return 0;
  }
}
