// ABOUTME: Parent drwn acp command for command-group help.
// ABOUTME: Shows the ACP agent surface for editors and Buzz over stdio.

import { BaseCommand } from "../base";

const DETAILS = [
  "drwn acp exposes a deployed Worker as an Agent Client Protocol agent over stdio.",
  "An ACP client (Zed, JetBrains, buzz-acp) launches the process and drives sessions;",
  "execution stays server-side in the deployed runtime.",
  "",
  "Available commands:",
  "  drwn acp serve [slug]",
].join("\n");

export class AcpCommand extends BaseCommand {
  static override paths = [["acp"]];

  static override usage = BaseCommand.Usage({
    category: "ACP",
    description: "Serve a deployed Worker over the Agent Client Protocol.",
    details: DETAILS,
    examples: [["Serve the deployed Worker over stdio", "drwn acp serve harari"]],
  });

  async execute(): Promise<number> {
    this.context.stdout.write(`${DETAILS}\n`);
    return 0;
  }
}
