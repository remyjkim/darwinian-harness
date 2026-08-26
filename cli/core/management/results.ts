// ABOUTME: Constructs the Worker-owned versioned command-result envelope for management operations.
// ABOUTME: Human and JSON output are projections of the same deeply frozen safe model.

import { DrwnError } from "../errors";
import { compileManagementSchemaFragment, managementContract, type ManagementJsonObject } from "./contracts";
import {
  isManagementErrorCode,
  isRetryableManagementErrorCode,
  type ManagementPublicError,
} from "./errors";
import { MANAGEMENT_ROUTE_KEYS, type ManagementRouteKey } from "./routes";

export interface DrwnManagementResult<Data extends ManagementJsonObject = ManagementJsonObject> {
  schema: "drwn.command-result";
  schemaVersion: 1;
  command: ManagementRouteKey;
  outcome: "succeeded" | "refused" | "indeterminate";
  requestId: string;
  observedAt: string;
  data: Data | null;
  error: ManagementPublicError | null;
  warnings: readonly ManagementJsonObject[];
}

const commandSet = new Set<string>(MANAGEMENT_ROUTE_KEYS);
const requestIdSchema = compileManagementSchemaFragment(managementContract.idKinds.RequestId);

function invalidResult(): DrwnError {
  return new DrwnError("VALIDATION_FAILED", "Management command result input is invalid.");
}

function canonicalTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function assertBase(command: ManagementRouteKey, requestId: string, observedAt: string): void {
  if (!commandSet.has(command) || !requestIdSchema.safeParse(requestId).success || !canonicalTimestamp(observedAt)) {
    throw invalidResult();
  }
}

function envelope<Data extends ManagementJsonObject>(
  command: ManagementRouteKey,
  requestId: string,
  observedAt: string,
  outcome: DrwnManagementResult["outcome"],
  data: Data | null,
  error: ManagementPublicError | null,
): Readonly<DrwnManagementResult<Data>> {
  assertBase(command, requestId, observedAt);
  return deepFreeze({
    schema: "drwn.command-result" as const,
    schemaVersion: 1 as const,
    command,
    outcome,
    requestId,
    observedAt,
    data,
    error,
    warnings: [] as ManagementJsonObject[],
  });
}

export function succeededManagementResult<Data extends ManagementJsonObject>(
  command: ManagementRouteKey,
  requestId: string,
  data: Data,
  observedAt: string,
): Readonly<DrwnManagementResult<Data>> {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalidResult();
  return envelope(command, requestId, observedAt, "succeeded", data, null);
}

export function refusedManagementResult(
  command: ManagementRouteKey,
  requestId: string,
  error: ManagementPublicError,
  observedAt: string,
): Readonly<DrwnManagementResult> {
  if (
    !isManagementErrorCode(error.code) ||
    typeof error.retryable !== "boolean" ||
    error.retryable !== isRetryableManagementErrorCode(error.code) ||
    (error.retryAfterSeconds !== undefined && (
      !error.retryable ||
      !Number.isInteger(error.retryAfterSeconds) ||
      error.retryAfterSeconds < 1 ||
      error.retryAfterSeconds > 3_600
    ))
  ) throw invalidResult();
  return envelope(command, requestId, observedAt, "refused", null, Object.freeze({ ...error }));
}

export function indeterminateManagementResult(
  command: ManagementRouteKey,
  requestId: string,
  observedAt: string,
): Readonly<DrwnManagementResult> {
  return envelope(command, requestId, observedAt, "indeterminate", null, Object.freeze({
    code: "TEMPORARILY_UNAVAILABLE",
    retryable: true,
  }));
}

export function renderManagementResultJson(result: DrwnManagementResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function renderManagementResultHuman(result: DrwnManagementResult): string {
  if (result.outcome === "succeeded") return `${result.command} succeeded.\nRequest: ${result.requestId}\n`;
  return `${result.error!.code}: ${result.outcome}.\nRequest: ${result.requestId}\n`;
}
