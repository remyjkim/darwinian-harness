// ABOUTME: Proves chat creates and polls only bounded target-bound management runs.
// ABOUTME: Streaming/event payloads, slug routes, and unscoped run lookup are removed.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { rm } from "node:fs/promises";
import { WorkerChatCommand } from "../cli/commands/worker/chat";
import { createManagementCommandFixture, managementToken } from "./management-command-helpers";

const roots: string[] = [];
const createId = "123e4567-e89b-42d3-a456-426614174009";
const readIds = [
  "123e4567-e89b-42d3-a456-42661417400a",
  "123e4567-e89b-42d3-a456-42661417401a",
];

async function run(args: string[], fetcher: typeof fetch) {
  const f = await createManagementCommandFixture(); roots.push(f.fixture.root);
  const ids = [createId, ...readIds];
  WorkerChatCommand.testDeps = {
    env: { DRWN_TOKEN: managementToken() }, fetcher,
    requestId: () => ids.shift()!, now: () => "2026-08-25T12:16:00.000Z",
    sleep: async () => undefined, maxPollAttempts: 3, pollIntervalMs: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerChatCommand);
  const exitCode = await cli.run(args, f.context);
  return { ...f, exitCode, stdout: f.stdout.text(), stderr: f.stderr.text() };
}

afterEach(async () => {
  WorkerChatCommand.testDeps = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function lifecycle(statuses: string[], calls: string[]): typeof fetch {
  let read = 0;
  return (async (input, init) => {
    const path = new URL(String(input)).pathname;
    const requestId = new Headers(init?.headers).get("x-request-id")!;
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/runs") && init?.method === "POST") {
      return Response.json({
        requestId, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001",
        status: "queued", createdAt: "2026-08-25T12:15:00.000Z",
      });
    }
    const status = statuses[Math.min(read++, statuses.length - 1)]!;
    return Response.json({ requestId, run: {
      runId: "run_0001", deployedWorkerId: "deployed_worker_alpha", status,
      ...(status === "succeeded" ? { output: "final answer" } : {}),
      createdAt: "2026-08-25T12:15:00.000Z", updatedAt: "2026-08-25T12:16:00.000Z",
    } });
  }) as typeof fetch;
}

describe("worker chat management runs", () => {
  test("creates under the selected target and polls bounded typed status to success", async () => {
    const calls: string[] = [];
    const result = await run(["worker", "chat", "--message", "hello", "--json"], lifecycle(["running", "succeeded"], calls));
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      "POST /api/deployed-workers/deployed_worker_alpha/runs",
      "GET /api/deployed-workers/deployed_worker_alpha/runs/run_0001",
      "GET /api/deployed-workers/deployed_worker_alpha/runs/run_0001",
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "runs.read", data: { run: { status: "succeeded", output: "final answer" } } });
    expect(calls.every((call) => !call.includes("/api/minds") && !call.includes("stream"))).toBe(true);
  });

  test("--no-wait emits only the queued run receipt and performs no read", async () => {
    const calls: string[] = [];
    const result = await run(["worker", "chat", "--message", "hello", "--no-wait", "--json"], lifecycle(["running"], calls));
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["POST /api/deployed-workers/deployed_worker_alpha/runs"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "runs.create", data: { runId: "run_0001", status: "queued" } });
  });

  test("failed and cancelled terminal runs exit nonzero without raw event output", async () => {
    for (const status of ["failed", "cancelled"]) {
      const result = await run(["worker", "chat", "--message", "hello"], lifecycle([status], []));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(status.toUpperCase());
      expect(result.stdout).not.toContain("events");
    }
  });

  test("unknown event-shaped success is rejected by the strict server schema", async () => {
    const result = await run(["worker", "chat", "--message", "hello", "--json"], (async (input, init) => {
      const path = new URL(String(input)).pathname;
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      if (path.endsWith("/runs")) return lifecycle([], [])(input, init);
      return Response.json({ requestId, run: {
        runId: "run_0001", deployedWorkerId: "deployed_worker_alpha", status: "succeeded",
        createdAt: "2026-08-25T12:15:00.000Z", updatedAt: "2026-08-25T12:16:00.000Z", events: [{ secret: true }],
      } });
    }) as typeof fetch);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SERVER_RESPONSE_INVALID");
    expect(result.stdout).toBe("");
  });

  test("help performs no profile, custody, context, run, or network work", async () => {
    let calls = 0;
    const result = await run(["worker", "chat", "--help"], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("--deployed-worker");
  });
});
