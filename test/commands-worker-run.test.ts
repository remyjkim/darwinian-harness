// ABOUTME: Proves run status requires both target and run IDs and exposes only the strict summary.
// ABOUTME: Wrong-target or unavailable runs remain non-enumerating public refusals.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { rm } from "node:fs/promises";
import { WorkerRunStatusCommand } from "../cli/commands/worker/run-status";
import { createManagementCommandFixture, managementToken } from "./management-command-helpers";

const roots: string[] = [];
const requestId = "123e4567-e89b-42d3-a456-42661417400a";

async function run(args: string[], fetcher: typeof fetch) {
  const f = await createManagementCommandFixture(); roots.push(f.fixture.root);
  WorkerRunStatusCommand.testDeps = {
    env: { DRWN_TOKEN: managementToken() }, fetcher,
    requestId: () => requestId, now: () => "2026-08-25T12:16:00.000Z",
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerRunStatusCommand);
  const exitCode = await cli.run(args, f.context);
  return { ...f, exitCode, stdout: f.stdout.text(), stderr: f.stderr.text() };
}

afterEach(async () => {
  WorkerRunStatusCommand.testDeps = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function response(status: string, target = "deployed_worker_alpha"): typeof fetch {
  return (async (input, init) => {
    expect(new URL(String(input)).pathname).toBe("/api/deployed-workers/deployed_worker_alpha/runs/run_0001");
    const observedRequestId = new Headers(init?.headers).get("x-request-id")!;
    return Response.json({ requestId: observedRequestId, run: {
      runId: "run_0001", deployedWorkerId: target, status,
      ...(status === "succeeded" ? { output: "answer" } : {}),
      createdAt: "2026-08-25T12:15:00.000Z", updatedAt: "2026-08-25T12:16:00.000Z",
    } });
  }) as typeof fetch;
}

describe("worker run status", () => {
  test("reads one target-bound run in human and strict JSON form", async () => {
    const human = await run(["worker", "run", "status", "run_0001"], response("succeeded"));
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Status: succeeded");
    expect(human.stdout).toContain("answer");
    const machine = await run(["worker", "run", "status", "run_0001", "--json"], response("succeeded"));
    expect(machine.exitCode).toBe(0);
    expect(JSON.parse(machine.stdout)).toMatchObject({ command: "runs.read", data: { run: { runId: "run_0001", status: "succeeded" } } });
  });

  test("wrong-target server success is invalid without existence detail", async () => {
    const result = await run(["worker", "run", "status", "run_0001"], response("succeeded", "deployed_worker_other"));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SERVER_RESPONSE_INVALID");
    expect(result.stderr).not.toContain("deployed_worker_other");
  });

  test("failed and cancelled runs exit nonzero with closed status only", async () => {
    for (const status of ["failed", "cancelled"]) {
      const result = await run(["worker", "run", "status", "run_0001"], response(status));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(status.toUpperCase());
    }
  });

  test("help performs no profile, custody, context, or network work", async () => {
    let calls = 0;
    const result = await run(["worker", "run", "status", "--help"], (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("--deployed-worker");
  });
});
