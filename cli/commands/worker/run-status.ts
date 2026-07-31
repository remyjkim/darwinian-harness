// ABOUTME: Implements drwn worker run status for reading a chat run by id (I65 Fix 4).
// ABOUTME: Reports queued/running/yielded/done/failed and prints the transcript's visible replies.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { describeRunFailure, pollRunOnce, renderError, runWebUrl, transcriptEventText } from "../../core/worker-run";
import { renderJson } from "../../core/output";

export class WorkerRunStatusCommand extends BaseCommand {
  static override paths = [["worker", "run", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Show the status and reply of a chat run.",
    details: `
      Fetches a chat run by its run id (as returned by \`drwn worker chat\`)
      and prints its status plus any visible replies. Use --json for the raw
      poll payload.
    `,
    examples: [
      ["Check a run", "drwn worker run status run_42"],
      ["Raw payload", "drwn worker run status run_42 --json"],
    ],
  });

  runId = Option.String();

  json = Option.Boolean("--json", false, {
    description: "Print the raw poll payload as JSON.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl, webBaseUrl } = resolveWorkerConfig();
    try {
      const { response, body } = await pollRunOnce(this.context, apiBaseUrl, this.runId, 0);
      if (!response.ok) {
        this.context.stderr.write(`Run status failed (${response.status}): ${renderError(body)}\n`);
        return 1;
      }
      if (this.json) {
        this.context.stdout.write(renderJson(body));
      }
      if (body.status === "not_found") {
        this.context.stderr.write(`Run ${this.runId} not found.\n`);
        return 1;
      }
      if (!this.json) {
        this.context.stdout.write(`Status: ${body.status}\n`);
        this.context.stdout.write(`Open in browser: ${runWebUrl(webBaseUrl, this.runId)}\n`);
        for (const event of body.events ?? []) {
          const text = transcriptEventText(event);
          if (text) this.context.stdout.write(`${text}\n`);
        }
      }
      if (body.status === "failed") {
        this.context.stderr.write(`Run failed: ${describeRunFailure(body.result)}\n`);
        return 1;
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }
  }
}
