// ABOUTME: Locks the @agentclientprotocol/sdk behaviors the acp adapter depends on: NDJSON framing,
// ABOUTME: version-1 answers to version-2 requests, -32601 for unknown methods, and the in-process client harness.

import { describe, expect, test } from "bun:test";
import { agent, client, ndJsonStream } from "@agentclientprotocol/sdk";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function buildAgent() {
  return agent()
    .onRequest("initialize", () => ({
      protocolVersion: 1,
      agentCapabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false } },
      authMethods: [],
    }))
    .onRequest("session/new", () => ({ sessionId: "sess_spike_1" }))
    .onRequest("session/prompt", () => ({ stopReason: "end_turn" as const }));
}

function wire(app: ReturnType<typeof buildAgent>) {
  const inbound = new TransformStream<Uint8Array, Uint8Array>();
  const outbound = new TransformStream<Uint8Array, Uint8Array>();
  const connection = app.connect(ndJsonStream(outbound.writable, inbound.readable));
  const writer = inbound.writable.getWriter();
  const reader = outbound.readable.getReader();
  let buffered = "";
  async function readFrame(): Promise<string> {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        return line;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("agent output closed before a full frame arrived");
      buffered += decoder.decode(value, { stream: true });
    }
  }
  async function send(message: unknown): Promise<void> {
    await writer.write(encoder.encode(`${JSON.stringify(message)}\n`));
  }
  async function sendRaw(text: string): Promise<void> {
    await writer.write(encoder.encode(text));
  }
  return { connection, send, sendRaw, readFrame };
}

describe("acp sdk spike: wire framing", () => {
  test("answers a Buzz-shaped version-2 initialize with version 1, one frame per line", async () => {
    const { connection, send, readFrame } = wire(buildAgent());
    await send({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: 2,
        clientCapabilities: { _meta: { goose: { customNotifications: true }, "terminal-auth": true } },
        clientInfo: { name: "buzz-acp", version: "0.1.0" },
      },
    });
    const frame = await readFrame();
    expect(frame).not.toContain("\n");
    const parsed = JSON.parse(frame);
    expect(parsed.id).toBe(0);
    expect(parsed.result.protocolVersion).toBe(1);
    expect(parsed.result.authMethods).toEqual([]);
    connection.close();
  });

  test("answers an unknown method with -32601 instead of silence", async () => {
    const { connection, send, readFrame } = wire(buildAgent());
    await send({ jsonrpc: "2.0", id: 5, method: "made/up", params: {} });
    const parsed = JSON.parse(await readFrame());
    expect(parsed.id).toBe(5);
    expect(parsed.error.code).toBe(-32601);
    connection.close();
  });

  test("a malformed line does not kill the connection (SDK stays silent, keeps serving)", async () => {
    const { connection, send, sendRaw, readFrame } = wire(buildAgent());
    await sendRaw("{this is not json}\n");
    // Spike finding: the SDK emits NO -32700 for a malformed line — it stays silent. The
    // load-bearing property for Buzz (which only hangs on unanswered *requests* it sent)
    // is that the connection survives and later valid requests are still answered.
    await send({ jsonrpc: "2.0", id: 8, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } });
    const parsed = JSON.parse(await readFrame());
    expect(parsed.id).toBe(8);
    expect(parsed.result.sessionId).toBe("sess_spike_1");
    connection.close();
  });
});

describe("acp sdk spike: in-process client harness", () => {
  test("full handshake through client(): initialize, session/new, canned prompt end_turn", async () => {
    const app = buildAgent();
    const result = await client().connectWith(app, async (ctx) => {
      const init = await ctx.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const session = await ctx.request("session/new", { cwd: "/tmp", mcpServers: [] });
      const prompt = await ctx.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "hello" }],
      });
      return { init, session, prompt };
    });
    expect(result.init.protocolVersion).toBe(1);
    expect(result.session.sessionId).toBe("sess_spike_1");
    expect(result.prompt.stopReason).toBe("end_turn");
  });
});
