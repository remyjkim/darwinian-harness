// ABOUTME: Creates and reads target-bound Deployed Worker runs with bounded typed polling.
// ABOUTME: No stream, event envelope, unscoped run lookup, or raw upstream response enters the public model.

import { randomUUID } from "node:crypto";
import { DrwnError } from "../errors";
import type { ManagementJsonObject } from "./contracts";
import type { ManagementReadConnection, ManagementReadDependencies } from "./organizations";
import { refusedManagementResult, type DrwnManagementResult } from "./results";
import { executeManagementRequest } from "./transport";

export interface CreateRunInput extends ManagementReadConnection {
  deployedWorkerId: string;
  input: string;
}

export interface ReadRunInput extends ManagementReadConnection {
  deployedWorkerId: string;
  runId: string;
}

export interface PollRunInput extends ReadRunInput {
  maxAttempts: number;
  intervalMs: number;
}

export interface RunDependencies extends ManagementReadDependencies {
  sleep?: (milliseconds: number) => Promise<void>;
}

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

export async function createRun(
  input: CreateRunInput,
  dependencies: RunDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return (dependencies.execute ?? executeManagementRequest)({
    routeKey: "runs.create",
    request: {
      requestId: (dependencies.requestId ?? randomUUID)(),
      deployedWorkerId: input.deployedWorkerId,
      input: input.input,
    },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
}

export async function readRun(
  input: ReadRunInput,
  dependencies: RunDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const result = await (dependencies.execute ?? executeManagementRequest)({
    routeKey: "runs.read",
    request: {
      requestId: (dependencies.requestId ?? randomUUID)(),
      deployedWorkerId: input.deployedWorkerId,
      runId: input.runId,
    },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  if (result.outcome !== "succeeded") return result;
  const run = result.data!.run as ManagementJsonObject;
  if (run.deployedWorkerId !== input.deployedWorkerId || run.runId !== input.runId) {
    return refusedManagementResult(
      "runs.read",
      result.requestId,
      { code: "RESOURCE_UNAVAILABLE", retryable: false },
      result.observedAt,
    );
  }
  return result;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function pollRunToTerminal(
  input: PollRunInput,
  dependencies: RunDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  if (
    !Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 100 ||
    !Number.isInteger(input.intervalMs) || input.intervalMs < 0 || input.intervalMs > 60_000
  ) {
    throw new DrwnError("VALIDATION_FAILED", "Run polling bounds are invalid.");
  }
  let result: Readonly<DrwnManagementResult> | null = null;
  for (let attempt = 0; attempt < input.maxAttempts; attempt += 1) {
    result = await readRun(input, dependencies);
    if (result.outcome !== "succeeded") return result;
    const status = String((result.data!.run as ManagementJsonObject).status);
    if (terminalStatuses.has(status)) return result;
    if (attempt + 1 < input.maxAttempts) await (dependencies.sleep ?? defaultSleep)(input.intervalMs);
  }
  return result!;
}
