// ABOUTME: Tests ACP session lifecycle projection over the Deploy API: start, raw-stream poll,
// ABOUTME: cursor settlement, retry/backoff, continuation, busy rejection, and snapshot reload.

import { describe, expect, test } from "bun:test";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AcpSessionManager, type AcpSessionRequest } from "../cli/core/acp/session";

function json(body: unknown, status = 200): { response: Response; body: unknown } {
  return {
    response: new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
    body,
  };
}

function runStatus(status: "running" | "yielded" | "done" | "failed") {
  return {
    status,
    runMetrics: {
      startedAt: 1_000,
      finishedAt: status === "running" ? null : 2_000,
      totalTokens: status === "running" ? null : 42,
    },
  };
}

describe("AcpSessionManager", () => {
  test("starts a run, unwraps raw stream entries, advances the cursor, and settles yielded", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const streamFrames = [
      {
        lastSeq: 1,
        events: [
          {
            seq: 1,
            sourceId: "orchestrator",
            event: { v: 1, seq: 1, ts: 100, type: "text.delta", text: "hello" },
          },
        ],
      },
      {
        lastSeq: 2,
        events: [
          {
            seq: 2,
            sourceId: "orchestrator",
            event: { v: 1, seq: 2, ts: 101, type: "agent.completed" },
          },
        ],
      },
    ];
    const statuses = [runStatus("running"), runStatus("yielded")];
    const request: AcpSessionRequest = async (url, init) => {
      calls.push({ url, init });
      if (init?.method === "POST") return json({ runId: "run/42" });
      if (url.endsWith("/status")) return json(statuses.shift());
      return json(streamFrames.shift());
    };
    const updates: SessionNotification[] = [];
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_local",
    });

    const session = await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    const result = await manager.prompt(
      { sessionId: session.sessionId, prompt: [{ type: "text", text: "hi" }] },
      async (notification) => updates.push(notification),
    );

    expect(result).toEqual({ stopReason: "end_turn" });
    expect(updates).toEqual([
      {
        sessionId: "sess_local",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "hello" },
        },
      },
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.example.test/api/minds/harari/chat",
      "https://api.example.test/api/minds/harari/chat/run%2F42/stream-poll?since=0",
      "https://api.example.test/api/chat/run%2F42/status",
      "https://api.example.test/api/minds/harari/chat/run%2F42/stream-poll?since=1",
      "https://api.example.test/api/chat/run%2F42/status",
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ message: "hi" });
  });

  test("backs off and retries an invocation_pending start exactly once", async () => {
    let starts = 0;
    const sleeps: number[] = [];
    const request: AcpSessionRequest = async (_url, init) => {
      if (init?.method === "POST") {
        starts += 1;
        if (starts === 1) return json({ error: "invocation_pending" }, 409);
        return json({ runId: "run_retry" });
      }
      if (_url.endsWith("/status")) return json(runStatus("yielded"));
      return json({ lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async (ms) => { sleeps.push(ms); },
      env: { DRWN_ACP_POLL_MS: "10" },
      idFactory: () => "sess_retry",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    const result = await manager.prompt(
      { sessionId: "sess_retry", prompt: [{ type: "text", text: "hi" }] },
      async () => {},
    );

    expect(result.stopReason).toBe("end_turn");
    expect(starts).toBe(2);
    expect(sleeps).toEqual([250]);
  });

  test("does not retry a different 409 start rejection", async () => {
    let starts = 0;
    const request: AcpSessionRequest = async (_url, init) => {
      if (init?.method === "POST") {
        starts += 1;
        return json({ error: "deployment_not_ready" }, 409);
      }
      return json({ status: "yielded", lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_conflict",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    await expect(manager.prompt(
      { sessionId: "sess_conflict", prompt: [{ type: "text", text: "hi" }] },
      async () => {},
    )).rejects.toThrow("deployment_not_ready");
    expect(starts).toBe(1);
  });

  test("backs transient poll failures off exponentially without abandoning the live run", async () => {
    let streamPolls = 0;
    let statusPolls = 0;
    const sleeps: number[] = [];
    const request: AcpSessionRequest = async (url, init) => {
      if (init?.method === "POST") return json({ runId: "run_backoff" });
      if (url.endsWith("/status")) {
        statusPolls += 1;
        return json(runStatus(statusPolls === 1 ? "running" : "yielded"));
      }
      streamPolls += 1;
      if (streamPolls === 1) throw new TypeError("socket reset");
      if (streamPolls === 2) return json({ error: "temporarily unavailable" }, 503);
      return json({ lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async (ms) => { sleeps.push(ms); },
      env: { DRWN_ACP_POLL_MS: "250", DRWN_ACP_POLL_IDLE_MS: "1000" },
      idFactory: () => "sess_backoff",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    const result = await manager.prompt(
      { sessionId: "sess_backoff", prompt: [{ type: "text", text: "hi" }] },
      async () => {},
    );

    expect(result.stopReason).toBe("end_turn");
    expect(streamPolls).toBe(4);
    expect(sleeps).toEqual([500, 1000, 250]);
  });

  test("aborts an active prompt polling wait when the ACP request signal closes", async () => {
    let sleepEntered!: () => void;
    const entered = new Promise<void>((resolve) => { sleepEntered = resolve; });
    const request: AcpSessionRequest = async (url, init) => {
      if (init?.method === "POST") return json({ runId: "run_eof" });
      if (url.endsWith("/status")) return json(runStatus("running"));
      return json({ lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {
        sleepEntered();
        await new Promise(() => {});
      },
      idFactory: () => "sess_eof",
    });
    const controller = new AbortController();

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    const prompt = manager.prompt(
      { sessionId: "sess_eof", prompt: [{ type: "text", text: "hi" }] },
      async () => {},
      controller.signal,
    );
    await entered;
    controller.abort(new Error("ACP connection closed"));
    const outcome = await Promise.race([
      prompt.then(() => "resolved", (error) => error instanceof Error ? error.message : String(error)),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 50)),
    ]);

    expect(outcome).toBe("ACP connection closed");
  });

  test("keeps polling through worker completion/failure and orchestrator retry events until run status settles", async () => {
    let streamPolls = 0;
    let statusPolls = 0;
    const request: AcpSessionRequest = async (url, init) => {
      if (init?.method === "POST") return json({ runId: "run_failed" });
      if (url.endsWith("/status")) {
        statusPolls += 1;
        return json(runStatus(statusPolls < 3 ? "running" : "yielded"));
      }
      streamPolls += 1;
      if (streamPolls === 1) return json({
        lastSeq: 2,
        events: [
          { seq: 1, sourceId: "panel-1", event: { v: 1, seq: 1, ts: 100, type: "agent.completed" } },
          { seq: 2, sourceId: "panel-2", event: { v: 1, seq: 2, ts: 101, type: "agent.failed", error: "panel failed" } },
        ],
      });
      if (streamPolls === 2) return json({
        lastSeq: 3,
        events: [{
          seq: 3,
          sourceId: "orchestrator",
          event: { v: 1, seq: 3, ts: 102, type: "agent.failed", error: "retryable turn" },
        }],
      });
      return json({ lastSeq: 4, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_failed",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    await expect(manager.prompt(
      { sessionId: "sess_failed", prompt: [{ type: "text", text: "hi" }] },
      async () => {},
    )).resolves.toEqual({ stopReason: "end_turn" });
    expect(streamPolls).toBe(3);
    expect(statusPolls).toBe(3);
  });

  test("settles a zero-event boot failure from the separate run-status poll", async () => {
    let streamPolls = 0;
    const request: AcpSessionRequest = async (url, init) => {
      if (init?.method === "POST") return json({ runId: "run_boot_failed" });
      if (url.includes("/stream-poll?")) {
        streamPolls += 1;
        if (streamPolls > 1) return json({ error: "stream polled after failure" }, 400);
        return json({ lastSeq: 0, events: [] });
      }
      if (url.endsWith("/api/chat/run_boot_failed/status")) {
        return json(runStatus("failed"));
      }
      return json({ error: `unexpected ${url}` }, 400);
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_boot_failed",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    await expect(manager.prompt(
      { sessionId: "sess_boot_failed", prompt: [{ type: "text", text: "hi" }] },
      async () => {},
    )).rejects.toThrow("Worker run failed: unknown failure");
    expect(streamPolls).toBe(1);
  });

  test("continues later prompts through the run message route and keeps the cursor", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let turn = 0;
    const request: AcpSessionRequest = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/minds/harari/chat")) return json({ runId: "run_multi" });
      if (url.endsWith("/api/chat/run_multi/message")) {
        turn += 1;
        return json({ accepted: true });
      }
      if (url.endsWith("/status")) return json(runStatus("yielded"));
      if (turn === 0) {
        return json({
          lastSeq: 1,
          events: [{ seq: 1, sourceId: "orchestrator", event: { v: 1, seq: 1, ts: 1, type: "agent.completed" } }],
        });
      }
      return json({
        lastSeq: 3,
        events: [
          { seq: 2, sourceId: "orchestrator", event: { v: 1, seq: 2, ts: 2, type: "text.delta", text: "again" } },
          { seq: 3, sourceId: "orchestrator", event: { v: 1, seq: 3, ts: 3, type: "agent.completed" } },
        ],
      });
    };
    const updates: SessionNotification[] = [];
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_multi",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    await manager.prompt(
      { sessionId: "sess_multi", prompt: [{ type: "text", text: "first" }] },
      async (notification) => updates.push(notification),
    );
    await manager.prompt(
      { sessionId: "sess_multi", prompt: [{ type: "text", text: "second" }] },
      async (notification) => updates.push(notification),
    );

    const continuation = calls.find((call) => call.url.endsWith("/api/chat/run_multi/message"));
    expect(JSON.parse(String(continuation?.init?.body))).toEqual({ message: "second" });
    expect(calls.map((call) => call.url)).toContain(
      "https://api.example.test/api/minds/harari/chat/run_multi/stream-poll?since=1",
    );
    expect(updates.at(-1)?.update).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "again" },
    });
  });

  test("loads snapshot history by local ACP id and primes the raw cursor before continuing", async () => {
    const calls: string[] = [];
    const request: AcpSessionRequest = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/minds/harari/chat")) return json({ runId: "run_loaded" });
      if (url.endsWith("/api/chat/run_loaded/snapshot")) {
        return json({
          status: "yielded",
          title: "Prior conversation",
          items: [
            { type: "user", text: "question" },
            { type: "assistant", text: "answer" },
            { type: "tool", toolCallId: "deep:1", toolName: "web.search", status: "done" },
            { type: "worker", sourceId: "panel-1", role: "critic", text: "detail", status: "done" },
          ],
        });
      }
      if (url.endsWith("/api/chat/run_loaded/message")) return json({ accepted: true });
      if (url.endsWith("/api/chat/run_loaded/status")) return json(runStatus("yielded"));
      if (url.endsWith("/stream-poll?since=0")) {
        return json({ lastSeq: 9, events: [] });
      }
      if (url.endsWith("/stream-poll?since=9")) {
        return json({ lastSeq: 10, events: [
          { seq: 10, sourceId: "orchestrator", event: { v: 1, seq: 10, ts: 10, type: "agent.completed" } },
        ] });
      }
      return json({ error: `unexpected ${url}` }, 400);
    };
    const updates: SessionNotification[] = [];
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_loaded",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    await manager.prompt(
      { sessionId: "sess_loaded", prompt: [{ type: "text", text: "first" }] },
      async () => {},
    );

    const loaded = await manager.loadSession(
      { sessionId: "sess_loaded", cwd: "/workspace", mcpServers: [] },
      async (notification) => updates.push(notification),
    );
    expect(loaded).toEqual({});
    expect(updates.map((notification) => notification.update.sessionUpdate)).toEqual([
      "user_message_chunk",
      "agent_message_chunk",
      "tool_call",
      "agent_message_chunk",
    ]);

    await manager.prompt(
      { sessionId: "sess_loaded", prompt: [{ type: "text", text: "continue" }] },
      async () => {},
    );
    expect(calls).toContain("GET https://api.example.test/api/minds/harari/chat/run_loaded/stream-poll?since=9");
  });

  test("rejects a cached active session load before snapshot or cursor requests", async () => {
    let releasePoll!: () => void;
    let pollEntered!: () => void;
    const entered = new Promise<void>((resolve) => { pollEntered = resolve; });
    const release = new Promise<void>((resolve) => { releasePoll = resolve; });
    const calls: string[] = [];
    let streamPolls = 0;
    const request: AcpSessionRequest = async (url, init) => {
      calls.push(url);
      if (init?.method === "POST") return json({ runId: "run_active_load" });
      if (url.endsWith("/status")) return json(runStatus("yielded"));
      if (url.endsWith("/snapshot")) return json({ status: "yielded", items: [] });
      streamPolls += 1;
      if (streamPolls === 1) {
        pollEntered();
        await release;
      }
      return json({ lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_active_load",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    const prompt = manager.prompt(
      { sessionId: "sess_active_load", prompt: [{ type: "text", text: "first" }] },
      async () => {},
    );
    await entered;
    const callsBeforeLoad = calls.length;
    await expect(manager.loadSession(
      { sessionId: "sess_active_load", cwd: "/workspace", mcpServers: [] },
      async () => {},
    )).rejects.toMatchObject({ code: -32001 });
    expect(calls).toHaveLength(callsBeforeLoad);
    releasePoll();
    await expect(prompt).resolves.toEqual({ stopReason: "end_turn" });
  });

  test("rejects a running snapshot before replay notifications or cursor priming", async () => {
    const calls: string[] = [];
    const request: AcpSessionRequest = async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") return json({ runId: "run_loading" });
      if (url.endsWith("/status")) return json(runStatus("yielded"));
      if (url.endsWith("/snapshot")) {
        return json({ status: "running", items: [{ type: "assistant", text: "partial" }] });
      }
      return json({ lastSeq: 4, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_loading",
    });
    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    await manager.prompt(
      { sessionId: "sess_loading", prompt: [{ type: "text", text: "first" }] },
      async () => {},
    );
    calls.length = 0;
    const updates: SessionNotification[] = [];

    await expect(manager.loadSession(
      { sessionId: "sess_loading", cwd: "/workspace", mcpServers: [] },
      async (notification) => updates.push(notification),
    )).rejects.toMatchObject({ code: -32001 });
    expect(updates).toEqual([]);
    expect(calls).toEqual([
      "GET https://api.example.test/api/chat/run_loading/snapshot",
    ]);
  });

  test("persists the local sessionId to runId mapping and reloads it after adapter restart", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-store-"));
    try {
      const firstRequest: AcpSessionRequest = async (url, init) => {
        if (init?.method === "POST") return json({ runId: "run_durable" });
        if (url.endsWith("/status")) return json(runStatus("yielded"));
        return json({ lastSeq: 9, events: [] });
      };
      const firstManager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        request: firstRequest,
        sleep: async () => {},
        idFactory: () => "sess_durable",
      });
      await firstManager.newSession({ cwd: "/workspace", mcpServers: [] });
      await firstManager.prompt(
        { sessionId: "sess_durable", prompt: [{ type: "text", text: "first" }] },
        async () => {},
      );

      expect(await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).exists()).toBe(true);
      const stored = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        version: number;
        sessions: Array<Record<string, unknown>>;
      };
      expect(stored.version).toBe(2);
      expect(stored.sessions[0]).toMatchObject({
        sessionId: "sess_durable",
        activeRunId: "run_durable",
        cursor: 9,
      });
      expect(stored.sessions[0]).not.toHaveProperty("runId");
      expect(stored.sessions[0]).not.toHaveProperty("taskId");
      const calls: string[] = [];
      const restartedRequest: AcpSessionRequest = async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/api/chat/run_durable/snapshot")) {
          return json({ status: "yielded", title: "History", items: [{ type: "assistant", text: "answer" }] });
        }
        if (url.endsWith("/stream-poll?since=0")) return json({ lastSeq: 9, events: [] });
        if (url.endsWith("/api/chat/run_durable/message")) return json({ accepted: true });
        if (url.endsWith("/stream-poll?since=9")) return json({ lastSeq: 10, events: [] });
        if (url.endsWith("/api/chat/run_durable/status")) return json(runStatus("yielded"));
        return json({ error: `unexpected ${url}` }, 400);
      };
      const restartedManager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        request: restartedRequest,
        sleep: async () => {},
      });

      await restartedManager.loadSession(
        { sessionId: "sess_durable", cwd: "/workspace", mcpServers: [] },
        async () => {},
      );
      await restartedManager.prompt(
        { sessionId: "sess_durable", prompt: [{ type: "text", text: "second" }] },
        async () => {},
      );
      expect(calls).toContain("POST https://api.example.test/api/chat/run_durable/message");
      expect(calls).toContain("GET https://api.example.test/api/minds/harari/chat/run_durable/stream-poll?since=9");
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("merges concurrent session writes from separate adapter managers", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-merge-"));
    try {
      const first = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_first",
      });
      const second = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_second",
      });

      await Promise.all([
        first.newSession({ cwd: "/first", mcpServers: [] }),
        second.newSession({ cwd: "/second", mcpServers: [] }),
      ]);

      const index = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(index.sessions.map((session) => session.sessionId).sort()).toEqual([
        "sess_first",
        "sess_second",
      ]);
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("refreshes the persisted index on a load cache miss before resolving the slug", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-refresh-"));
    try {
      const staleManager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_stale",
        request: async (url) => {
          if (url.endsWith("/api/chat/run_peer/snapshot")) {
            return json({ status: "yielded", items: [{ type: "assistant", text: "peer history" }] });
          }
          if (url.endsWith("/stream-poll?since=0")) return json({ lastSeq: 7, events: [] });
          return json({ error: `unexpected ${url}` }, 400);
        },
      });
      await staleManager.newSession({ cwd: "/stale", mcpServers: [] });

      const peerManager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_peer",
        sleep: async () => {},
        request: async (url, init) => {
          if (init?.method === "POST") return json({ runId: "run_peer" });
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          return json({ lastSeq: 6, events: [] });
        },
      });
      await peerManager.newSession({ cwd: "/peer", mcpServers: [] });
      await peerManager.prompt(
        { sessionId: "sess_peer", prompt: [{ type: "text", text: "first" }] },
        async () => {},
      );

      const updates: SessionNotification[] = [];
      await expect(staleManager.loadSession(
        { sessionId: "sess_peer", cwd: "/peer", mcpServers: [] },
        async (notification) => updates.push(notification),
      )).resolves.toEqual({});
      expect(updates.at(0)?.update).toMatchObject({
        sessionUpdate: "agent_message_chunk",
        content: { text: "peer history" },
      });
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("uses a newer durable terminal state instead of a stale cached session", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-authoritative-"));
    let ownerTurn = 0;
    try {
      const owner = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_authoritative",
        sleep: async () => {},
        request: async (url, init) => {
          if (url.endsWith("/api/minds/harari/chat")) return json({ runId: "run_authoritative" });
          if (url.endsWith("/message")) {
            ownerTurn += 1;
            return json({ accepted: true });
          }
          if (url.endsWith("/status")) {
            return json(runStatus(ownerTurn === 0 ? "yielded" : "done"));
          }
          return json({ lastSeq: ownerTurn === 0 ? 1 : 9, events: [] });
        },
      });
      await owner.newSession({ cwd: "/workspace", mcpServers: [] });
      await owner.prompt(
        { sessionId: "sess_authoritative", prompt: [{ type: "text", text: "first" }] },
        async () => {},
      );

      let staleContinuationPosts = 0;
      const stale = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        sleep: async () => {},
        request: async (url) => {
          if (url.endsWith("/snapshot")) return json({ status: "yielded", items: [] });
          if (url.endsWith("/message")) {
            staleContinuationPosts += 1;
            return json({ accepted: true });
          }
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          if (url.includes("stream-poll")) return json({ lastSeq: 2, events: [] });
          return json({ error: `unexpected ${url}` }, 400);
        },
      });
      await stale.loadSession(
        { sessionId: "sess_authoritative", cwd: "/workspace", mcpServers: [] },
        async () => {},
      );

      await owner.prompt(
        { sessionId: "sess_authoritative", prompt: [{ type: "text", text: "finish" }] },
        async () => {},
      );
      const beforeStalePrompt = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string; cursor: number; continuable: boolean }>;
      };
      expect(beforeStalePrompt.sessions).toContainEqual(expect.objectContaining({
        sessionId: "sess_authoritative",
        cursor: 9,
        continuable: false,
      }));

      await expect(stale.prompt(
        { sessionId: "sess_authoritative", prompt: [{ type: "text", text: "stale" }] },
        async () => {},
      )).rejects.toMatchObject({ code: -32001 });
      expect(staleContinuationPosts).toBe(0);
      const afterStalePrompt = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string; cursor: number; continuable: boolean }>;
      };
      expect(afterStalePrompt.sessions).toContainEqual(expect.objectContaining({
        sessionId: "sess_authoritative",
        cursor: 9,
        continuable: false,
      }));
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("does not resurrect a cached session after a peer safely prunes its durable mapping", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-pruned-cache-"));
    let staleRequests = 0;
    try {
      const stale = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        maxSessions: 1,
        idFactory: () => "sess_pruned_old",
        sleep: async () => {},
        request: async (url, init) => {
          staleRequests += 1;
          if (init?.method === "POST") return json({ runId: "run_pruned_old" });
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          return json({ lastSeq: 1, events: [] });
        },
      });
      await stale.newSession({ cwd: "/old", mcpServers: [] });

      const peer = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        maxSessions: 1,
        idFactory: () => "sess_pruned_new",
      });
      await peer.newSession({ cwd: "/new", mcpServers: [] });
      const afterPrune = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(afterPrune.sessions.map((session) => session.sessionId)).toEqual(["sess_pruned_new"]);

      await expect(stale.prompt(
        { sessionId: "sess_pruned_old", prompt: [{ type: "text", text: "resurrect" }] },
        async () => {},
      )).rejects.toMatchObject({ code: -32002 });
      expect(staleRequests).toBe(0);
      const afterAttempt = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(afterAttempt.sessions.map((session) => session.sessionId)).toEqual(["sess_pruned_new"]);
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("holds one cross-manager session lock for the full prompt and rejects prompt or load contenders", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-prompt-lock-"));
    let releasePoll!: () => void;
    let pollEntered!: () => void;
    const entered = new Promise<void>((resolve) => { pollEntered = resolve; });
    const release = new Promise<void>((resolve) => { releasePoll = resolve; });
    let turn = 0;
    try {
      const owner = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_shared_lock",
        sleep: async () => {},
        request: async (url, init) => {
          if (url.endsWith("/api/minds/harari/chat")) return json({ runId: "run_shared_lock" });
          if (url.endsWith("/message")) {
            turn += 1;
            return json({ accepted: true });
          }
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          if (turn > 0) {
            pollEntered();
            await release;
          }
          return json({ lastSeq: turn + 1, events: [] });
        },
      });
      await owner.newSession({ cwd: "/workspace", mcpServers: [] });
      await owner.prompt(
        { sessionId: "sess_shared_lock", prompt: [{ type: "text", text: "first" }] },
        async () => {},
      );

      let contenderRequests = 0;
      const contender = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        request: async (url) => {
          contenderRequests += 1;
          if (url.endsWith("/snapshot")) return json({ status: "yielded", items: [] });
          if (url.includes("stream-poll")) return json({ lastSeq: 1, events: [] });
          return json({ error: `unexpected ${url}` }, 400);
        },
      });
      await contender.loadSession(
        { sessionId: "sess_shared_lock", cwd: "/workspace", mcpServers: [] },
        async () => {},
      );
      const prompt = owner.prompt(
        { sessionId: "sess_shared_lock", prompt: [{ type: "text", text: "second" }] },
        async () => {},
      );
      await entered;
      const requestsBeforeContention = contenderRequests;

      const promptContention = await contender.prompt(
        { sessionId: "sess_shared_lock", prompt: [{ type: "text", text: "contend" }] },
        async () => {},
      ).then(() => ({ code: 0 }), (error: unknown) => error);
      const loadContention = await contender.loadSession(
        { sessionId: "sess_shared_lock", cwd: "/workspace", mcpServers: [] },
        async () => {},
      ).then(() => ({ code: 0 }), (error: unknown) => error);
      releasePoll();
      await expect(prompt).resolves.toEqual({ stopReason: "end_turn" });
      expect(promptContention).toMatchObject({ code: -32001 });
      expect(loadContention).toMatchObject({ code: -32001 });
      expect(contenderRequests).toBe(requestsBeforeContention);
    } finally {
      releasePoll?.();
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("holds the cross-manager session lock while load replays and rejects a prompt contender", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-load-lock-"));
    let releaseSnapshot!: () => void;
    let snapshotEntered!: () => void;
    const entered = new Promise<void>((resolve) => { snapshotEntered = resolve; });
    const release = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    try {
      const owner = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        idFactory: () => "sess_load_lock",
        sleep: async () => {},
        request: async (url, init) => {
          if (init?.method === "POST") return json({ runId: "run_load_lock" });
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          return json({ lastSeq: 2, events: [] });
        },
      });
      await owner.newSession({ cwd: "/workspace", mcpServers: [] });
      await owner.prompt(
        { sessionId: "sess_load_lock", prompt: [{ type: "text", text: "first" }] },
        async () => {},
      );

      const loader = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        request: async (url) => {
          if (url.endsWith("/snapshot")) {
            snapshotEntered();
            await release;
            return json({ status: "yielded", items: [] });
          }
          if (url.includes("stream-poll")) return json({ lastSeq: 2, events: [] });
          return json({ error: `unexpected ${url}` }, 400);
        },
      });
      const load = loader.loadSession(
        { sessionId: "sess_load_lock", cwd: "/workspace", mcpServers: [] },
        async () => {},
      );
      await entered;

      const contention = await owner.prompt(
        { sessionId: "sess_load_lock", prompt: [{ type: "text", text: "contend" }] },
        async () => {},
      ).then(() => ({ code: 0 }), (error: unknown) => error);
      releaseSnapshot();
      await expect(load).resolves.toEqual({});
      expect(contention).toMatchObject({ code: -32001 });
    } finally {
      releaseSnapshot?.();
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("keeps an active peer mapping during overflow, then safely returns durable storage to capacity", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-durable-capacity-"));
    let releasePoll!: () => void;
    let pollEntered!: () => void;
    const entered = new Promise<void>((resolve) => { pollEntered = resolve; });
    const release = new Promise<void>((resolve) => { releasePoll = resolve; });
    try {
      const activeManager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        maxSessions: 1,
        idFactory: () => "sess_active_peer",
        request: async (url, init) => {
          if (init?.method === "POST") return json({ runId: "run_active_peer" });
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          pollEntered();
          await release;
          return json({ lastSeq: 1, events: [] });
        },
      });
      const peerManager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        maxSessions: 1,
        idFactory: () => "sess_capacity_peer",
      });
      await activeManager.newSession({ cwd: "/active", mcpServers: [] });
      const prompt = activeManager.prompt(
        { sessionId: "sess_active_peer", prompt: [{ type: "text", text: "first" }] },
        async () => {},
      );
      await entered;
      await peerManager.newSession({ cwd: "/peer", mcpServers: [] });

      const duringPrompt = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string }>;
      };
      releasePoll();
      await expect(prompt).resolves.toEqual({ stopReason: "end_turn" });
      const afterPrompt = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(duringPrompt.sessions.map((session) => session.sessionId).sort()).toEqual([
        "sess_active_peer",
        "sess_capacity_peer",
      ]);
      expect(afterPrompt.sessions.map((session) => session.sessionId)).toEqual(["sess_active_peer"]);
    } finally {
      releasePoll?.();
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("prunes the least-recently-used inactive durable mapping while protecting the new session", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-durable-lru-"));
    const ids = ["sess_old", "sess_recent", "sess_new"];
    let tick = 0;
    try {
      const manager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        maxSessions: 2,
        idFactory: () => ids.shift()!,
        now: () => ++tick,
        sleep: async () => {},
        request: async (url, init) => {
          if (init?.method === "POST") return json({ runId: "run_old" });
          if (url.endsWith("/status")) return json(runStatus("yielded"));
          return json({ lastSeq: 1, events: [] });
        },
      });
      await manager.newSession({ cwd: "/old", mcpServers: [] });
      await manager.newSession({ cwd: "/recent", mcpServers: [] });
      await manager.prompt(
        { sessionId: "sess_old", prompt: [{ type: "text", text: "touch" }] },
        async () => {},
      );
      await manager.newSession({ cwd: "/new", mcpServers: [] });

      const index = await Bun.file(join(agentsDir, "drwn", "acp-sessions.json")).json() as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(index.sessions.map((session) => session.sessionId).sort()).toEqual([
        "sess_new",
        "sess_old",
      ]);
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("prunes durable overflow after a successful load while protecting the loaded session", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-load-prune-"));
    const indexPath = join(agentsDir, "drwn", "acp-sessions.json");
    try {
      await mkdir(join(agentsDir, "drwn"), { recursive: true });
      await Bun.write(indexPath, `${JSON.stringify({
        version: 2,
        sessions: [
          {
            sessionId: "sess_load_old",
            activeRunId: "run_load_old",
            cursor: 1,
            continuable: true,
            cwd: "/old",
            lastUsed: 1,
            slug: "harari",
          },
          {
            sessionId: "sess_load_target",
            activeRunId: "run_load_target",
            cursor: 2,
            continuable: true,
            cwd: "/target",
            lastUsed: 2,
            slug: "harari",
          },
        ],
      }, null, 2)}\n`);
      const manager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        maxSessions: 1,
        now: () => 3,
        request: async (url) => {
          if (url.endsWith("/snapshot")) return json({ status: "yielded", items: [] });
          if (url.includes("stream-poll")) return json({ lastSeq: 3, events: [] });
          return json({ error: `unexpected ${url}` }, 400);
        },
      });

      await manager.loadSession(
        { sessionId: "sess_load_target", cwd: "/target", mcpServers: [] },
        async () => {},
      );

      const index = await Bun.file(indexPath).json() as { sessions: Array<{ sessionId: string }> };
      expect(index.sessions.map((session) => session.sessionId)).toEqual(["sess_load_target"]);
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("reads a v1 runId binding and rewrites it as the v2 activeRunId schema", async () => {
    const agentsDir = await mkdtemp(join(tmpdir(), "acp-session-migrate-"));
    const indexPath = join(agentsDir, "drwn", "acp-sessions.json");
    try {
      await mkdir(join(agentsDir, "drwn"), { recursive: true });
      await Bun.write(indexPath, `${JSON.stringify({
        version: 1,
        sessions: [{
          sessionId: "sess_legacy",
          runId: "run_legacy",
          cursor: 4,
          continuable: true,
          cwd: "/workspace",
          lastUsed: 1_000,
          slug: "harari",
        }],
      })}\n`);
      const calls: string[] = [];
      const manager = new AcpSessionManager({
        context: { agentsDir },
        slug: "harari",
        apiBaseUrl: "https://api.example.test",
        request: async (url) => {
          calls.push(url);
          if (url.endsWith("/api/chat/run_legacy/snapshot")) {
            return json({ status: "yielded", title: "Legacy", items: [] });
          }
          if (url.endsWith("/stream-poll?since=0")) return json({ lastSeq: 5, events: [] });
          return json({ error: `unexpected ${url}` }, 400);
        },
      });

      await manager.loadSession(
        { sessionId: "sess_legacy", cwd: "/workspace", mcpServers: [] },
        async () => {},
      );

      expect(calls[0]).toEndWith("/api/chat/run_legacy/snapshot");
      const migrated = await Bun.file(indexPath).json() as {
        version: number;
        sessions: Array<Record<string, unknown>>;
      };
      expect(migrated.version).toBe(2);
      expect(migrated.sessions[0]).toMatchObject({ activeRunId: "run_legacy", cursor: 5 });
      expect(migrated.sessions[0]).not.toHaveProperty("runId");
    } finally {
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  test("rejects a concurrent prompt locally without issuing another HTTP request", async () => {
    let releasePoll!: () => void;
    let pollEntered!: () => void;
    const entered = new Promise<void>((resolve) => { pollEntered = resolve; });
    const release = new Promise<void>((resolve) => { releasePoll = resolve; });
    let requests = 0;
    const request: AcpSessionRequest = async (url, init) => {
      requests += 1;
      if (init?.method === "POST") return json({ runId: "run_busy" });
      if (url.endsWith("/status")) return json(runStatus("yielded"));
      pollEntered();
      await release;
      return json({ status: "yielded", lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => "sess_busy",
    });

    await manager.newSession({ cwd: "/workspace", mcpServers: [] });
    const first = manager.prompt(
      { sessionId: "sess_busy", prompt: [{ type: "text", text: "first" }] },
      async () => {},
    );
    await entered;
    await expect(manager.prompt(
      { sessionId: "sess_busy", prompt: [{ type: "text", text: "second" }] },
      async () => {},
    )).rejects.toMatchObject({ code: -32001 });
    expect(requests).toBe(2);
    releasePoll();
    await expect(first).resolves.toEqual({ stopReason: "end_turn" });
  });

  test("evicts the least-recently-used inactive session when the bounded cache fills", async () => {
    const ids = ["sess_old", "sess_recent", "sess_new"];
    let requests = 0;
    const request: AcpSessionRequest = async (url, init) => {
      requests += 1;
      if (init?.method === "POST") return json({ runId: `run_${requests}` });
      if (url.endsWith("/status")) return json(runStatus("yielded"));
      return json({ lastSeq: 0, events: [] });
    };
    const manager = new AcpSessionManager({
      context: { agentsDir: "/fixture" },
      slug: "harari",
      apiBaseUrl: "https://api.example.test",
      store: false,
      request,
      sleep: async () => {},
      idFactory: () => ids.shift()!,
      maxSessions: 2,
    });

    await manager.newSession({ cwd: "/old", mcpServers: [] });
    await manager.newSession({ cwd: "/recent", mcpServers: [] });
    await manager.prompt(
      { sessionId: "sess_old", prompt: [{ type: "text", text: "touch" }] },
      async () => {},
    );
    await manager.newSession({ cwd: "/new", mcpServers: [] });
    const requestsBeforeEvictedPrompt = requests;

    await expect(manager.prompt(
      { sessionId: "sess_recent", prompt: [{ type: "text", text: "gone" }] },
      async () => {},
    )).rejects.toMatchObject({ code: -32002 });
    expect(requests).toBe(requestsBeforeEvictedPrompt);
  });
});
