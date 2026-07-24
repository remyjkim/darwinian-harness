// ABOUTME: Implements drwn worker rollback for moving a worker alias to an older deployment.
// ABOUTME: The Deploy API keeps immutable deployment records; this only changes routing.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";

export class WorkerRollbackCommand extends BaseCommand {
  static override paths = [["worker", "rollback"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Roll a worker back to a previous deployment.",
    details: `
      Requests that the Deploy API repoint the worker alias to a previous ready
      deployment. Without --to, the Deploy API chooses the most recent ready
      deployment before the currently active one.
    `,
    examples: [
      ["Roll back one deployment", "drwn worker rollback harari"],
      ["Roll back to a specific deployment", "drwn worker rollback harari --to dep_abc123"],
    ],
  });

  slug = Option.String();

  to = Option.String("--to", {
    description: "Target deployment id.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    try {
      const { response: res, body } = await fetchJsonWithWorkerAuth<{ activeDeploymentId?: string; error?: string }>(this.context, `${apiBaseUrl}/api/minds/${this.slug}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.to ? { to: this.to } : {}),
      });
      if (!res.ok) {
        this.context.stderr.write(`Rollback failed (${res.status}): ${body.error ?? "unknown error"}\n`);
        return 1;
      }
      this.context.stdout.write(`"${this.slug}" now serves ${body.activeDeploymentId}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }
  }
}
