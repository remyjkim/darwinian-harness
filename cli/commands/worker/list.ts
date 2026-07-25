// ABOUTME: Implements drwn worker list for deployed workers.
// ABOUTME: Supports both human table output and stable JSON for scripts.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";
import { renderJson, renderTable } from "../../core/output";
import type { WorkerSummary } from "./types";
import { displayModel, displayValue } from "./types";

export class WorkerListCommand extends BaseCommand {
  static override paths = [["worker", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "List your deployed workers.",
    details: `
      Calls the Deploy API and shows each worker slug, latest status,
      active deployment id, resolved model, and update timestamp. Use --json for
      a direct API-shaped response that is easier to consume from automation.
    `,
    examples: [
      ["List deployed workers", "drwn worker list"],
      ["List deployed workers as JSON", "drwn worker list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    let workers: WorkerSummary[];
    try {
      // external contract: /api/minds response key `minds`
      const { response: res, body } = await fetchJsonWithWorkerAuth<{ minds: WorkerSummary[] }>(
        this.context,
        `${apiBaseUrl}/api/minds`,
      );
      if (!res.ok) {
        this.context.stderr.write(`List failed (${res.status}).\n`);
        return 1;
      }
      workers = body.minds;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }

    if (this.json) {
      this.context.stdout.write(renderJson(workers));
      return 0;
    }
    if (workers.length === 0) {
      this.context.stdout.write("No workers deployed.\n");
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["slug", "status", "active_deployment", "model", "updated"],
        workers.map((worker) => [
          worker.slug,
          worker.status,
          displayValue(worker.active_deployment_id),
          displayModel(worker.model),
          displayValue(worker.updated_at),
        ]),
      ),
    );
    return 0;
  }
}
