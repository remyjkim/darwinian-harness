// ABOUTME: Tests the acp connection layer: version negotiation, capability declaration, and
// ABOUTME: delegation of session methods to injected hooks, driven through the SDK's in-process client.

import { describe, expect, test } from "bun:test";
import { client, ndJsonStream } from "@agentclientprotocol/sdk";
import { createAcpAgent, type AcpAgentHooks } from "../cli/core/acp/connection";

function hooksWithLog(): { hooks: AcpAgentHooks; calls: string[] } {
  const calls: string[] = [];
  const hooks: AcpAgentHooks = {
    authenticate: async (params) => {
      calls.push(`authenticate:${params.methodId}`);
      return {};
    },
    newSession: async (params) => {
      calls.push(`newSession:${params.cwd}`);
      return { sessionId: "sess_test_1" };
    },
    loadSession: async (params, notify) => {
      calls.push(`loadSession:${params.sessionId}`);
      await notify({
        sessionId: params.sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "history" } },
      });
      return {};
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
    expect(init.agentCapabilities?.loadSession).toBe(true);
    expect(init.authMethods).toEqual([{
      id: "dah-device",
      name: "Darwinian device login",
      description: "Sign in through Darwinian Auth Hub using a browser device code.",
    }]);
  });

  test("preserves a string JSON-RPC request id on the wire response", async () => {
    const { hooks } = hooksWithLog();
    const inbound = new TransformStream<Uint8Array, Uint8Array>();
    const outbound = new TransformStream<Uint8Array, Uint8Array>();
    const connection = createAcpAgent(hooks).connect(ndJsonStream(outbound.writable, inbound.readable));
    const writer = inbound.writable.getWriter();
    const reader = outbound.readable.getReader();
    await writer.write(new TextEncoder().encode(`${JSON.stringify({
      jsonrpc: "2.0",
      id: "init:string-id",
      method: "initialize",
      params: { protocolVersion: 1, clientCapabilities: {} },
    })}\n`));
    const decoder = new TextDecoder();
    let buffered = "";
    while (!buffered.includes("\n")) {
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      buffered += decoder.decode(value, { stream: true });
    }
    const frame = JSON.parse(buffered.slice(0, buffered.indexOf("\n")));
    expect(frame.id).toBe("init:string-id");
    expect(frame.result.protocolVersion).toBe(1);
    connection.close();
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

  test("delegates authenticate to the advertised agent-owned method", async () => {
    const { hooks, calls } = hooksWithLog();
    const result = await client().connectWith(createAcpAgent(hooks), (ctx) =>
      ctx.request("authenticate", { methodId: "dah-device" })
    );
    expect(result).toEqual({});
    expect(calls).toEqual(["authenticate:dah-device"]);
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

  test("delegates session/load and forwards replay updates through the client connection", async () => {
    const { hooks, calls } = hooksWithLog();
    const updates: unknown[] = [];
    const loaded = await client()
      .onNotification("session/update", (ctx) => { updates.push(ctx.params); })
      .connectWith(createAcpAgent(hooks), (ctx) =>
        ctx.request("session/load", {
          sessionId: "run_loaded",
          cwd: "/tmp",
          mcpServers: [],
        })
      );
    expect(loaded).toEqual({});
    expect(calls).toEqual(["loadSession:run_loaded"]);
    expect(updates).toEqual([{
      sessionId: "run_loaded",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "history" } },
    }]);
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

  test("input EOF aborts the signal of an active prompt request", async () => {
    const { hooks } = hooksWithLog();
    let promptEntered!: () => void;
    const entered = new Promise<void>((resolve) => { promptEntered = resolve; });
    let aborted = false;
    hooks.prompt = async (_params, _notify, signal) => {
      promptEntered();
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve();
        }, { once: true });
      });
      return { stopReason: "end_turn" };
    };
    const inbound = new TransformStream<Uint8Array, Uint8Array>();
    const outbound = new TransformStream<Uint8Array, Uint8Array>();
    const connection = createAcpAgent(hooks).connect(ndJsonStream(outbound.writable, inbound.readable));
    const writer = inbound.writable.getWriter();
    await writer.write(new TextEncoder().encode(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "session/prompt",
      params: { sessionId: "sess_test_1", prompt: [{ type: "text", text: "hi" }] },
    })}\n`));
    await entered;

    await writer.close();
    const outcome = await Promise.race([
      connection.closed.then(() => "closed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 100)),
    ]);

    expect(outcome).toBe("closed");
    expect(aborted).toBe(true);
  });
});
