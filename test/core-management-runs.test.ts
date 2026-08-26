// ABOUTME: Proves run creation/readback are always target-bound and polling is closed and bounded.
// ABOUTME: Wrong-target readback becomes non-enumerating and raw event shapes cannot enter results.

import { describe, expect, test } from "bun:test";
import {
  createRun,
  pollRunToTerminal,
  readRun,
  type RunDependencies,
} from "../cli/core/management/runs";
import { succeededManagementResult } from "../cli/core/management/results";

const createId = "123e4567-e89b-42d3-a456-426614174009";
const readId = "123e4567-e89b-42d3-a456-42661417400a";

function runSummary(status: string, output?: string, target = "deployed_worker_alpha") {
  return {
    runId: "run_0001", deployedWorkerId: target, status,
    ...(output === undefined ? {} : { output }),
    createdAt: "2026-08-25T12:15:00.000Z", updatedAt: "2026-08-25T12:16:00.000Z",
  };
}

describe("Deployed Worker runs", () => {
  test("create and read always carry the exact target and distinct run ID", async () => {
    const seen: unknown[] = [];
    const dependencies: RunDependencies = {
      requestId: (() => { const ids = [createId, readId]; return () => ids.shift()!; })(),
      execute: async (input) => {
        seen.push({ routeKey: input.routeKey, request: structuredClone(input.request) });
        return input.routeKey === "runs.create"
          ? succeededManagementResult(input.routeKey, createId, {
              requestId: createId, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001",
              status: "queued", createdAt: "2026-08-25T12:15:00.000Z",
            }, "2026-08-25T12:15:00.000Z")
          : succeededManagementResult(input.routeKey, readId, {
              requestId: readId, run: runSummary("succeeded", "done"),
            }, "2026-08-25T12:16:00.000Z");
      },
    };
    expect((await createRun({ credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha", input: "hello" }, dependencies)).outcome).toBe("succeeded");
    expect((await readRun({ credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001" }, dependencies)).outcome).toBe("succeeded");
    expect(seen).toEqual([
      { routeKey: "runs.create", request: { requestId: createId, deployedWorkerId: "deployed_worker_alpha", input: "hello" } },
      { routeKey: "runs.read", request: { requestId: readId, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001" } },
    ]);
  });

  test("wrong-target readback is one non-enumerating RESOURCE_UNAVAILABLE refusal", async () => {
    const result = await readRun({
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001",
    }, {
      requestId: () => readId,
      execute: async (input) => succeededManagementResult(input.routeKey, readId, {
        requestId: readId, run: runSummary("succeeded", "private", "deployed_worker_other"),
      }, "2026-08-25T12:16:00.000Z"),
    });
    expect(result).toMatchObject({ outcome: "refused", error: { code: "RESOURCE_UNAVAILABLE", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("deployed_worker_other");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  test("polling stops at terminal status and is bounded at the configured attempt cap", async () => {
    let calls = 0; const sleeps: number[] = [];
    const dependencies: RunDependencies = {
      requestId: () => readId,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      execute: async (input) => {
        calls += 1;
        const status = calls === 1 ? "queued" : calls === 2 ? "running" : "succeeded";
        return succeededManagementResult(input.routeKey, readId, { requestId: readId, run: runSummary(status, status === "succeeded" ? "answer" : undefined) }, "2026-08-25T12:16:00.000Z");
      },
    };
    const terminal = await pollRunToTerminal({
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001",
      maxAttempts: 3, intervalMs: 5,
    }, dependencies);
    expect(terminal).toMatchObject({ outcome: "succeeded", data: { run: { status: "succeeded", output: "answer" } } });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([5, 5]);

    calls = 0; sleeps.length = 0;
    const bounded = await pollRunToTerminal({
      credentialsPath: "/unused", env: {}, deployedWorkerId: "deployed_worker_alpha", runId: "run_0001",
      maxAttempts: 2, intervalMs: 5,
    }, { ...dependencies, execute: async (input) => {
      calls += 1;
      return succeededManagementResult(input.routeKey, readId, { requestId: readId, run: runSummary("running") }, "2026-08-25T12:16:00.000Z");
    } });
    expect(bounded).toMatchObject({ outcome: "succeeded", data: { run: { status: "running" } } });
    expect(calls).toBe(2);
  });
});
