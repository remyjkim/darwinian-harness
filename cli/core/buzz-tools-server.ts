// ABOUTME: Exposes the two narrow Buzz message operations as a stdio-compatible MCP server.
// ABOUTME: Delegates all execution to the argv/stdin-only Buzz delivery core.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeBuzzDelivery,
  type BuzzCommandExecutor,
  type BuzzDeliveryInput,
} from "./buzz-tools";

const baseInput = {
  channel: z.string().uuid(),
  content: z.string().min(1).max(65_536),
};

function toolResult(result: Awaited<ReturnType<typeof executeBuzzDelivery>>) {
  if (!result.ok) {
    return {
      content: [{ type: "text" as const, text: result.error }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: result.receipt || "Buzz delivery accepted" }],
  };
}

export function createBuzzToolsServer(executor: BuzzCommandExecutor): McpServer {
  const server = new McpServer({ name: "buzz-tools", version: "1.0.0" });

  server.registerTool(
    "buzz_messages_send",
    {
      description: "Send one message to a Buzz channel.",
      inputSchema: baseInput,
    },
    async (input: BuzzDeliveryInput) => toolResult(await executeBuzzDelivery(input, executor)),
  );

  server.registerTool(
    "buzz_messages_thread",
    {
      description: "Reply to one Buzz message in its channel thread.",
      inputSchema: { ...baseInput, replyTo: z.string().regex(/^[0-9a-f]{64}$/i) },
    },
    async (input: BuzzDeliveryInput & { replyTo: string }) =>
      toolResult(await executeBuzzDelivery(input, executor)),
  );

  return server;
}
