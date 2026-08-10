// ABOUTME: Parent drwn worker command for command-group help.
// ABOUTME: Shows the worker command surface without registering deprecated login.

import { BaseCommand } from "../base";

const DETAILS = [
  "Cards compose capabilities into one Blueprint. A project selects one Worker root with drwn use;",
  "worker deploy sends that root and its pinned Card closure to the remote runtime.",
  "",
  "Available commands:",
  "  drwn worker deploy <cardRef> --name <slug>",
  "  drwn worker list",
  "  drwn worker status <slug>",
  "  drwn worker deployments <slug>",
  "  drwn worker chat <slug> --message <text>",
  "  drwn worker secret set <slug> <name> [--kind mcp|env] [--env-var NAME]",
  "  drwn worker buzz-tools",
  "  drwn worker rollback <slug>",
  "  drwn worker routine create <slug>",
  "  drwn worker delete <slug> --force",
].join("\n");

export class WorkerCommand extends BaseCommand {
  static override paths = [["worker"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Deploy and operate one selected project Worker.",
    details: DETAILS,
    examples: [
      ["List deployed workers", "drwn worker list"],
      ["Check a worker deployment", "drwn worker status harari"],
    ],
  });

  async execute(): Promise<number> {
    this.context.stdout.write(`${DETAILS}\n`);
    return 0;
  }
}
