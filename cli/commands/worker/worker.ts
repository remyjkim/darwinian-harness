// ABOUTME: Parent drwn worker command for command-group help.
// ABOUTME: Shows the worker command surface without registering deprecated login.

import { BaseCommand } from "../base";

const DETAILS = [
  "Cards compose one selected project Worker with drwn use; Deployed Worker management uses explicit organization and Deployed Worker IDs.",
  "",
  "Available commands:",
  "  drwn worker register --organization <organizationId> --name <name> --environment <environment>",
  "  drwn worker use <deployedWorkerId>",
  "  drwn worker deploy <cardRef>",
  "  drwn worker launch-context prepare <installed-root> --target claude|codex",
  "  drwn worker list",
  "  drwn worker status [deployedWorkerId]",
  "  drwn worker deployments [--deployed-worker <deployedWorkerId>]",
  "  drwn worker chat [--deployed-worker <deployedWorkerId>] --message <text>",
  "  drwn worker secret set <name> [--deployed-worker <deployedWorkerId>]",
  "  drwn worker buzz-tools",
  "  drwn worker rollback [--deployed-worker <deployedWorkerId>] --to <deploymentId>",
  "  drwn worker retire [--deployed-worker <deployedWorkerId>] --yes",
].join("\n");

export class WorkerCommand extends BaseCommand {
  static override paths = [["worker"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Deploy and operate one selected project Worker.",
    details: DETAILS,
    examples: [
      ["Preview a per-agent context", "drwn worker launch-context prepare @team/reviewer --target codex --dry-run"],
      ["List deployed workers", "drwn worker list"],
      ["Check a deployed Worker", "drwn worker status deployed_worker_alpha"],
    ],
  });

  async execute(): Promise<number> {
    this.context.stdout.write(`${DETAILS}\n`);
    return 0;
  }
}
