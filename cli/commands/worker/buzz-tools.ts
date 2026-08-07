// ABOUTME: Runs the narrow Buzz message-delivery MCP server over stdio.
// ABOUTME: The deployed Card invokes this command; stdout remains MCP-only.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BaseCommand } from "../base";
import { executeBuzzCommand } from "../../core/buzz-tools";
import { createBuzzToolsServer } from "../../core/buzz-tools-server";

export class WorkerBuzzToolsCommand extends BaseCommand {
  static override paths = [["worker", "buzz-tools"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Serve the governed Buzz delivery tools over MCP stdio.",
    details: `
      Exposes exactly buzz_messages_send and buzz_messages_thread. The wrapper
      invokes Buzz directly without a shell and sends message content on stdin.
      This command is intended for Card-declared runtime use.
    `,
  });

  async execute(): Promise<number> {
    const server = createBuzzToolsServer(executeBuzzCommand);
    await server.connect(new StdioServerTransport());
    return 0;
  }
}
