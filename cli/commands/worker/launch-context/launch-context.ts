// ABOUTME: Parent command for per-agent Worker launch-context materialization.
// ABOUTME: Documents prepare, list, and prune without overlapping deployment materialization.

import { BaseCommand } from "../../base";

const DETAILS = [
  "Prepare immutable, target-native additions for one effective installed project Worker root.",
  "The active Worker remains the shared project base; launch contexts never change project intent or start an agent.",
  "",
  "Available commands:",
  "  drwn worker launch-context prepare <installed-root> --target claude|codex",
  "  drwn worker launch-context list",
  "  drwn worker launch-context prune --older-than <duration>",
].join("\n");

export class WorkerLaunchContextCommand extends BaseCommand {
  static override paths = [["worker", "launch-context"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Prepare and inspect per-agent Worker launch contexts.",
    details: DETAILS,
    examples: [
      ["Preview one Codex context", "drwn worker launch-context prepare @team/reviewer --target codex --dry-run --json"],
      ["List generated contexts", "drwn worker launch-context list --json"],
    ],
  });
  async execute(): Promise<number> {
    this.context.stdout.write(`${DETAILS}\n`);
    return 0;
  }
}
