// ABOUTME: Provider-neutral placeholder for the deferred Worker Mind backend decision.
// ABOUTME: Performs no filesystem, network, BeginningDB, R2, S3, or provider discovery.

import { Option } from "clipanion";
import { BaseCommand } from "../../base";

export class WorkerMindCommand extends BaseCommand {
  static override paths = [["worker", "mind"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Report that no Worker Mind persistence backend is selected.",
    details: `
      Worker Mind persistence is intentionally provider-neutral in 1.4.2.
      BeginningDB is not selected, and no R2, S3, or other storage adapter is
      probed. Card persona, belief, and memory authoring remains local.
    `,
    examples: [
      ["Show the placeholder result", "drwn worker mind"],
      ["Emit the closed JSON refusal", "drwn worker mind --json"],
    ],
  });

  json = Option.Boolean("--json", false);

  async execute() {
    if (this.json) {
      this.context.stdout.write(`${JSON.stringify({
        schema: "drwn.worker-mind-placeholder",
        schemaVersion: 1,
        outcome: "refused",
        error: { code: "MIND_BACKEND_UNSELECTED" },
      })}\n`);
    } else {
      this.context.stderr.write(
        "MIND_BACKEND_UNSELECTED: no Worker Mind persistence backend is selected in Darwinian 1.4.2.\n",
      );
    }
    return 1;
  }
}
