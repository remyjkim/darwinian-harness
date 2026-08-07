// ABOUTME: Verifies the Buzz wrapper exposes exactly two delivery tools over real MCP.
// ABOUTME: Tool calls retain the argv/stdin boundary and surface redacted failures.

import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBuzzToolsServer } from "../cli/core/buzz-tools-server";

async function connect(executor: Parameters<typeof createBuzzToolsServer>[0]) {
  const server = createBuzzToolsServer(executor);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("Buzz tools MCP server", () => {
  test("exposes only the two governed delivery tools", async () => {
    const { client, server } = await connect(async () => ({ exitCode: 0, stdout: "sent", stderr: "" }));
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "buzz_messages_send",
      "buzz_messages_thread",
    ]);
    await client.close();
    await server.close();
  });

  test("dispatches send and thread with content on stdin", async () => {
    const calls: Array<{ argv: string[]; stdin: string }> = [];
    const { client, server } = await connect(async (argv, stdin) => {
      calls.push({ argv, stdin });
      return { exitCode: 0, stdout: "event_42", stderr: "" };
    });

    const sent = await client.callTool({
      name: "buzz_messages_send",
      arguments: { channel: "550e8400-e29b-41d4-a716-446655440000", content: "hello" },
    });
    const threaded = await client.callTool({
      name: "buzz_messages_thread",
      arguments: { channel: "550e8400-e29b-41d4-a716-446655440000", replyTo: "a".repeat(64), content: "reply" },
    });

    expect(sent.isError).not.toBe(true);
    expect(threaded.isError).not.toBe(true);
    expect(calls).toEqual([
      {
        argv: ["buzz", "messages", "send", "--channel", "550e8400-e29b-41d4-a716-446655440000", "--content", "-"],
        stdin: "hello",
      },
      {
        argv: [
          "buzz", "messages", "send", "--channel", "550e8400-e29b-41d4-a716-446655440000", "--content", "-",
          "--reply-to", "a".repeat(64),
        ],
        stdin: "reply",
      },
    ]);
    await client.close();
    await server.close();
  });

  test("returns a correlated MCP error without leaking Buzz stderr", async () => {
    const { client, server } = await connect(async () => ({
      exitCode: 9,
      stdout: "",
      stderr: "BUZZ_PRIVATE_KEY=secret",
    }));
    const result = await client.callTool({
      name: "buzz_messages_send",
      arguments: { channel: "550e8400-e29b-41d4-a716-446655440000", content: "sensitive message" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("exit code 9");
    expect(JSON.stringify(result)).not.toContain("BUZZ_PRIVATE_KEY");
    expect(JSON.stringify(result)).not.toContain("sensitive message");
    await client.close();
    await server.close();
  });
});
