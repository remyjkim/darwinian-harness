// ABOUTME: Tests the acp connection layer: version negotiation, capability declaration, and
// ABOUTME: delegation of session methods to injected hooks, driven through the SDK's in-process client.

import { describe, expect, test } from "bun:test";
import { client } from "@agentclientprotocol/sdk";
import { createAcpAgent, type AcpAgentHooks } from "../cli/core/acp/connection";

function hooksWithLog(): { hooks: AcpAgentHooks; calls: string[] } {
  const calls: string[] = [];
  const hooks: AcpAgentHooks = {
    newSession: async (params) => {
      calls.push(`newSession:${params.cwd}`);
      return { sessionId: "sess_test_1" };
    },
    prompt: async (params) => {
      calls.push(`prompt:${params.sessionId}`);
      return { stopReason: "end_turn" };
    },
    cancel: async (params) => {
      calls.push(`cancel:${params.sessionId}`);
    },
  };
  return { hooks, calls };
}

describe("acp connection layer", () => {
  test("answers initialize with protocol version 1 even when the client requests 2", async () => {
    const { hooks } = hooksWithLog();
    const init = await client().connectWith(createAcpAgent(hooks), (ctx) =>
      ctx.request("initialize", {
        protocolVersion: 2,
        clientCapabilities: { _meta: { goose: { customNotifications: true } } },
        clientInfo: { name: "buzz-acp", version: "0.1.0" },
      }),
    );
    expect(init.protocolVersion).toBe(1);
    expect(init.agentCapabilities?.loadSession).toBe(false);
    expect(init.authMethods).toEqual([]);
  });

  test("identifies itself as drwn-acp in agentInfo", async () => {
    const { hooks } = hooksWithLog();
    const init = await client().connectWith(createAcpAgent(hooks), (ctx) =>
      ctx.request("initialize", { protocolVersion: 1, clientCapabilities: {} }),
    );
    expect(init.agentInfo?.name).toBe("drwn-acp");
    expect(typeof init.agentInfo?.version).toBe("string");
  });

  test("delegates session/new to the hook and returns its sessionId", async () => {
    const { hooks, calls } = hooksWithLog();
    const session = await client().connectWith(createAcpAgent(hooks), (ctx) =>
      ctx.request("session/new", { cwd: "/workspace/project", mcpServers: [] }),
    );
    expect(session.sessionId).toBe("sess_test_1");
    expect(calls).toEqual(["newSession:/workspace/project"]);
  });

  test("delegates session/prompt to the hook and resolves its stop reason", async () => {
    const { hooks, calls } = hooksWithLog();
    const prompt = await client().connectWith(createAcpAgent(hooks), async (ctx) => {
      const session = await ctx.request("session/new", { cwd: "/tmp", mcpServers: [] });
      return ctx.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "hello" }],
      });
    });
    expect(prompt.stopReason).toBe("end_turn");
    expect(calls).toEqual(["newSession:/tmp", "prompt:sess_test_1"]);
  });

  test("routes the session/cancel notification to the hook", async () => {
    const { hooks, calls } = hooksWithLog();
    await client().connectWith(createAcpAgent(hooks), async (ctx) => {
      await ctx.request("session/new", { cwd: "/tmp", mcpServers: [] });
      await ctx.notify("session/cancel", { sessionId: "sess_test_1" });
      // Notifications race the connection teardown; issue a request to flush delivery.
      await ctx.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    });
    expect(calls).toContain("cancel:sess_test_1");
  });
});
