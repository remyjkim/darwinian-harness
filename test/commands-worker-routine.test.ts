// ABOUTME: Command-level contract tests for public drwn Worker Routine management.
// ABOUTME: Covers authenticated API routing, write payloads, output, validation, and delete safety.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import {
  WorkerRoutineCommand,
  WorkerRoutineCreateCommand,
  WorkerRoutineDisableCommand,
  WorkerRoutineEnableCommand,
  WorkerRoutineListCommand,
  WorkerRoutineRemoveCommand,
  WorkerRoutineRunsCommand,
  WorkerRoutineUpdateCommand,
} from "../cli/commands/worker/routine";
import type { AgentsContext } from "../cli/context";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const tempRoots: string[] = [];

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwinian.dev/api/auth",
    aud: "https://api.darwinian.dev",
    sub: "user_123",
    exp: Math.floor(Date.now() / 1000) + 900,
  })}.sig`;
}

class CaptureStream extends Writable {
  chunks: Buffer[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routine(overrides: Record<string, unknown> = {}) {
  return {
    id: "routine_1",
    mindId: "mind_1",
    deploymentSlug: "alpha worker",
    endUserId: "",
    name: "Daily digest",
    triggerKind: "cron",
    triggerSource: null,
    cronExpr: "0 9 * * 1-5",
    timezone: "America/Los_Angeles",
    payload: { message: "Summarize mentions" },
    jitterEnabled: false,
    enabled: true,
    disabledReason: null,
    nextRunAt: "2026-08-03T16:00:00.000Z",
    lastRunAt: null,
    createdAt: "2026-07-31T20:00:00.000Z",
    updatedAt: "2026-07-31T20:00:00.000Z",
    ...overrides,
  };
}

async function runRoutineCommand(args: string[]) {
  process.env.DRWN_TOKEN = fakeJwt();
  process.env.DRWN_STUDIO_API_URL = "https://api.test";
  const root = await mkdtemp(join(tmpdir(), "drwn-routine-test-"));
  tempRoots.push(root);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: root,
    agentsDir: join(root, ".agents"),
    homeDir: root,
    cwd: root,
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(WorkerRoutineCommand);
  cli.register(WorkerRoutineCreateCommand);
  cli.register(WorkerRoutineListCommand);
  cli.register(WorkerRoutineUpdateCommand);
  cli.register(WorkerRoutineEnableCommand);
  cli.register(WorkerRoutineDisableCommand);
  cli.register(WorkerRoutineRunsCommand);
  cli.register(WorkerRoutineRemoveCommand);
  const exitCode = await cli.run(args, context);
  return { exitCode, stdout: stdout.text(), stderr: stderr.text(), root };
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("drwn worker routine", () => {
  test("group help exposes the full lifecycle", async () => {
    const result = await runRoutineCommand(["worker", "routine", "--help"]);
    expect(result.exitCode).toBe(0);
    for (const command of ["create", "list", "update", "enable", "disable", "runs", "rm"]) {
      expect(result.stdout).toContain(`drwn worker routine ${command}`);
    }
  });

  test("create sends the required name, prompt, accounts, schedule, and jitter", async () => {
    let call: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      call = { url: String(url), init };
      return response({ routine: routine() }, 201);
    }) as typeof fetch;

    const result = await runRoutineCommand([
      "worker", "routine", "create", "alpha worker",
      "--name", "Daily digest",
      "--cron", "0 9 * * 1-5",
      "--timezone", "America/Los_Angeles",
      "--prompt", "Summarize mentions",
      "--account", "slack=acct_1",
      "--account", "github=acct_2",
      "--jitter", "false",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(call?.url).toBe("https://api.test/api/minds/alpha%20worker/routines");
    expect(call?.init?.method).toBe("POST");
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      name: "Daily digest",
      triggerKind: "cron",
      cronExpr: "0 9 * * 1-5",
      timezone: "America/Los_Angeles",
      jitterEnabled: false,
      payload: { message: "Summarize mentions" },
      accountSelections: { slack: "acct_1", github: "acct_2" },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ id: "routine_1", name: "Daily digest" });
  });

  test("create accepts an object payload file and rejects payload/prompt ambiguity", async () => {
    const payloadRoot = await mkdtemp(join(tmpdir(), "drwn-routine-payload-"));
    tempRoots.push(payloadRoot);
    await writeFile(join(payloadRoot, "payload.json"), JSON.stringify({ task: "inspect" }));
    let sent: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return response({ routine: routine({ payload: { task: "inspect" } }) }, 201);
    }) as typeof fetch;
    const valid = await runRoutineCommand([
      "worker", "routine", "create", "alpha", "--name", "Inspect", "--cron", "*/5 * * * *",
      "--payload", join(payloadRoot, "payload.json"),
    ]);
    expect(valid.exitCode).toBe(0);
    expect(sent?.payload).toEqual({ task: "inspect" });

    const ambiguous = await runRoutineCommand([
      "worker", "routine", "create", "alpha", "--name", "Inspect", "--cron", "*/5 * * * *",
      "--payload", join(payloadRoot, "payload.json"), "--prompt", "also inspect",
    ]);
    expect(ambiguous.exitCode).toBe(1);
    expect(ambiguous.stderr).toContain("Use either --prompt or --payload, not both");
  });

  test("list renders human and stable JSON output", async () => {
    globalThis.fetch = (async () => response({ routines: [routine()] })) as unknown as typeof fetch;
    const human = await runRoutineCommand(["worker", "routine", "list", "alpha"]);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Daily digest");
    expect(human.stdout).toContain("routine_1");
    expect(human.stdout).toContain("enabled");

    const machine = await runRoutineCommand(["worker", "routine", "list", "alpha", "--json"]);
    expect(machine.exitCode).toBe(0);
    expect(JSON.parse(machine.stdout)).toEqual([routine()]);
  });

  test("update rejects an empty patch and sends supported fields", async () => {
    let calls = 0;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "Revised digest",
        payload: { message: "New prompt" },
        jitterEnabled: true,
      });
      return response({ routine: routine({ name: "Revised digest", jitterEnabled: true }) });
    }) as typeof fetch;

    const empty = await runRoutineCommand(["worker", "routine", "update", "alpha", "routine_1"]);
    expect(empty.exitCode).toBe(1);
    expect(empty.stderr).toContain("Provide at least one field to update");
    expect(calls).toBe(0);

    const updated = await runRoutineCommand([
      "worker", "routine", "update", "alpha", "routine_1",
      "--name", "Revised digest", "--prompt", "New prompt", "--jitter", "true",
    ]);
    expect(updated.exitCode).toBe(0);
    expect(calls).toBe(1);
  });

  test("enable and disable PATCH the exact definition", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ path: new URL(String(url)).pathname, body });
      return response({ routine: routine({ enabled: body.enabled }) });
    }) as typeof fetch;

    expect((await runRoutineCommand(["worker", "routine", "enable", "alpha", "routine_1"])).exitCode).toBe(0);
    expect((await runRoutineCommand(["worker", "routine", "disable", "alpha", "routine_1"])).exitCode).toBe(0);
    expect(calls).toEqual([
      { path: "/api/minds/alpha/routines/routine_1", body: { enabled: true } },
      { path: "/api/minds/alpha/routines/routine_1", body: { enabled: false } },
    ]);
  });

  test("runs forwards pagination and renders run history", async () => {
    let requested = "";
    const page = {
      items: [{
        id: "routine_run_1",
        routineId: "routine_1",
        mindId: "mind_1",
        deploymentSlug: "alpha",
        dedupKey: "cron:routine_1:slot",
        scheduledFor: "2026-08-01T00:00:00.000Z",
        status: "succeeded",
        failureKind: null,
        attempts: 1,
        engineRunId: "run_1",
        sessionId: null,
        replyStatus: "none",
        createdAt: "2026-08-01T00:00:00.000Z",
        startedAt: "2026-08-01T00:00:01.000Z",
        completedAt: "2026-08-01T00:00:10.000Z",
      }],
      nextCursor: "next_1",
    };
    globalThis.fetch = (async (url: string | URL | Request) => {
      requested = String(url);
      return response(page);
    }) as typeof fetch;

    const result = await runRoutineCommand([
      "worker", "routine", "runs", "alpha", "routine_1", "--limit", "5", "--cursor", "cursor_1",
    ]);
    expect(result.exitCode).toBe(0);
    expect(requested).toBe("https://api.test/api/minds/alpha/routines/routine_1/runs?limit=5&cursor=cursor_1");
    expect(result.stdout).toContain("routine_run_1");
    expect(result.stdout).toContain("Next cursor: next_1");
  });

  test("rm requires --force and preserves the server history contract", async () => {
    let calls = 0;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const refused = await runRoutineCommand(["worker", "routine", "rm", "alpha", "routine_1"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("without --force");
    expect(calls).toBe(0);

    const removed = await runRoutineCommand(["worker", "routine", "rm", "alpha", "routine_1", "--force"]);
    expect(removed.exitCode).toBe(0);
    expect(removed.stdout).toContain("run history remains until retention");
    expect(calls).toBe(1);
  });

  test("surfaces typed API errors and invalid response contracts", async () => {
    globalThis.fetch = (async () => response({
      error: "invalid_schedule",
      message: "schedule interval must be at least five minutes",
    }, 400)) as unknown as typeof fetch;
    const apiError = await runRoutineCommand([
      "worker", "routine", "create", "alpha", "--name", "Fast", "--cron", "* * * * *",
    ]);
    expect(apiError.exitCode).toBe(1);
    expect(apiError.stderr).toContain("invalid_schedule: schedule interval must be at least five minutes");

    globalThis.fetch = (async () => response({ routines: [{ id: 42 }] })) as unknown as typeof fetch;
    const invalid = await runRoutineCommand(["worker", "routine", "list", "alpha"]);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("Unexpected Routine API response");
  });
});
