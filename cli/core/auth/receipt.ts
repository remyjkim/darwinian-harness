// ABOUTME: Constructs and validates the exact sanitized Worker auth-operation receipt allowlist.
// ABOUTME: Derives qualification from trusted build identity and admits only the 32 reviewed producer states.

import { DEVELOPMENT_SOURCE_COMMIT, type RuntimeBuildIdentity } from "../build-identity";

const ROOT_KEYS = [
  "action",
  "actionAt",
  "credential",
  "local",
  "mode",
  "outcome",
  "qualificationEligible",
  "qualificationNamespaceDigest",
  "reason",
  "remote",
  "schema",
  "schemaVersion",
  "worker",
] as const;
const WORKER_KEYS = ["sourceCommit", "version"] as const;
const CREDENTIAL_KEYS = ["clientId", "credentialId", "expiresAt", "generation", "issuedAt", "issuer", "resource"] as const;
const REMOTE_KEYS = ["action", "httpClass", "result"] as const;
const LOCAL_KEYS = ["action", "afterConfirmedRemoteRevoke", "result"] as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FULL_LOWERCASE_GIT_SHA = /^[a-f0-9]{40}$/;

export type AuthAction = "login" | "refresh" | "logout";
export type AuthMode = "ordinary" | "require_remote_revoke";
export type AuthOutcome = "succeeded" | "failed";
export type AuthRemoteAction = "not_applicable" | "token_exchange" | "refresh" | "revoke";
export type AuthRemoteResult = "not_applicable" | "confirmed" | "rejected" | "indeterminate";
export type AuthHttpClass = "not_applicable" | "2xx" | "3xx" | "4xx" | "5xx" | "network_error";
export type AuthLocalAction = "write" | "delete";
export type AuthLocalResult = "confirmed" | "not_performed" | "failed";
export type AuthReasonCode =
  | "BUILD_IDENTITY_UNQUALIFIED"
  | "CREDENTIAL_PROFILE_MISMATCH"
  | "AUTH_REMOTE_REJECTED"
  | "AUTH_REMOTE_INDETERMINATE"
  | "AUTH_RESPONSE_INVALID"
  | "CREDENTIAL_WRITE_FAILED"
  | "CREDENTIAL_DELETE_FAILED";

export interface AuthReceiptCredentialV1 {
  credentialId: string;
  generation: number;
  issuer: string;
  clientId: "drwn-cli";
  resource: string;
  issuedAt: string;
  expiresAt: string;
}

export interface AuthOperationState {
  action: AuthAction;
  mode: AuthMode;
  outcome: AuthOutcome;
  remote: { action: AuthRemoteAction; result: AuthRemoteResult; httpClass: AuthHttpClass };
  local: { action: AuthLocalAction; result: AuthLocalResult; afterConfirmedRemoteRevoke: boolean };
  reason: AuthReasonCode | null;
}

export interface AuthOperationReceiptV1 extends AuthOperationState {
  schema: "darwinian.worker.auth-operation";
  schemaVersion: 1;
  worker: { version: string; sourceCommit: string };
  qualificationNamespaceDigest: string;
  credential: AuthReceiptCredentialV1;
  actionAt: string;
  qualificationEligible: boolean;
}

export interface CreateAuthOperationReceiptInput {
  buildIdentity: RuntimeBuildIdentity;
  qualificationNamespaceDigest: string;
  credential: AuthReceiptCredentialV1;
  actionAt: string;
  operation: AuthOperationState;
}

export class AuthReceiptError extends Error {
  readonly code = "AUTH_RECEIPT_INVALID";

  constructor() {
    super("AUTH_RECEIPT_INVALID");
    this.name = "AuthReceiptError";
  }
}

function fail(): never {
  throw new AuthReceiptError();
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) fail();
  return record;
}

function oneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail();
  return value as T;
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") fail();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) fail();
  return value;
}

function publicIssuer(value: unknown): string {
  if (typeof value !== "string") fail();
  try {
    const parsed = new URL(value);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.href !== value
    ) fail();
  } catch {
    fail();
  }
  return value;
}

function publicResource(value: unknown): string {
  if (typeof value !== "string") fail();
  try {
    const parsed = new URL(value);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin !== value
    ) fail();
  } catch {
    fail();
  }
  return value;
}

function stateRowKey(state: AuthOperationState & { qualificationEligible: boolean }): string {
  return JSON.stringify([
    state.action,
    state.mode,
    state.remote.action,
    state.remote.result,
    state.remote.httpClass,
    state.local.action,
    state.local.result,
    state.local.afterConfirmedRemoteRevoke,
    state.outcome,
    state.reason,
    state.qualificationEligible,
  ]);
}

function producerRow(
  action: AuthAction,
  mode: AuthMode,
  remoteResult: AuthRemoteResult,
  httpClass: AuthHttpClass,
  localResult: AuthLocalResult,
  afterConfirmedRemoteRevoke: boolean,
  outcome: AuthOutcome,
  reason: AuthReasonCode | null,
  qualificationEligible: boolean,
): string {
  return stateRowKey({
    action,
    mode,
    remote: {
      action: { login: "token_exchange", refresh: "refresh", logout: "revoke" }[action] as AuthRemoteAction,
      result: remoteResult,
      httpClass,
    },
    local: {
      action: action === "logout" ? "delete" : "write",
      result: localResult,
      afterConfirmedRemoteRevoke,
    },
    outcome,
    reason,
    qualificationEligible,
  });
}

const INDETERMINATE_HTTP_CLASSES = ["3xx", "5xx", "network_error"] as const;
const LOGOUT_REMOTE_ROWS = [
  ["not_applicable", "not_applicable", "CREDENTIAL_PROFILE_MISMATCH"],
  ["rejected", "4xx", "AUTH_REMOTE_REJECTED"],
  ...INDETERMINATE_HTTP_CLASSES.map((httpClass) => ["indeterminate", httpClass, "AUTH_REMOTE_INDETERMINATE"] as const),
  ["confirmed", "2xx", null],
] as const;

const AUTH_OPERATION_PRODUCER_ROWS = new Set([
  producerRow("login", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", null, true),
  producerRow("login", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", "BUILD_IDENTITY_UNQUALIFIED", false),
  producerRow("login", "ordinary", "confirmed", "2xx", "failed", false, "failed", "CREDENTIAL_WRITE_FAILED", false),
  producerRow("refresh", "ordinary", "not_applicable", "not_applicable", "not_performed", false, "failed", "CREDENTIAL_PROFILE_MISMATCH", false),
  producerRow("refresh", "ordinary", "rejected", "4xx", "not_performed", false, "failed", "AUTH_REMOTE_REJECTED", false),
  ...INDETERMINATE_HTTP_CLASSES.map((httpClass) => producerRow("refresh", "ordinary", "indeterminate", httpClass, "not_performed", false, "failed", "AUTH_REMOTE_INDETERMINATE", false)),
  producerRow("refresh", "ordinary", "rejected", "2xx", "not_performed", false, "failed", "AUTH_RESPONSE_INVALID", false),
  producerRow("refresh", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", null, true),
  producerRow("refresh", "ordinary", "confirmed", "2xx", "confirmed", false, "succeeded", "BUILD_IDENTITY_UNQUALIFIED", false),
  producerRow("refresh", "ordinary", "confirmed", "2xx", "failed", false, "failed", "CREDENTIAL_WRITE_FAILED", false),
  ...LOGOUT_REMOTE_ROWS.flatMap(([remoteResult, httpClass, reason]) => [
    producerRow("logout", "ordinary", remoteResult, httpClass, "confirmed", remoteResult === "confirmed", "succeeded", reason, false),
    producerRow("logout", "ordinary", remoteResult, httpClass, "failed", remoteResult === "confirmed", "failed", "CREDENTIAL_DELETE_FAILED", false),
  ]),
  ...LOGOUT_REMOTE_ROWS.filter(([remoteResult]) => remoteResult !== "confirmed").map(([remoteResult, httpClass, reason]) =>
    producerRow("logout", "require_remote_revoke", remoteResult, httpClass, "not_performed", false, "failed", reason, false)
  ),
  producerRow("logout", "require_remote_revoke", "confirmed", "2xx", "failed", true, "failed", "CREDENTIAL_DELETE_FAILED", false),
  producerRow("logout", "require_remote_revoke", "confirmed", "2xx", "confirmed", true, "succeeded", null, true),
  producerRow("logout", "require_remote_revoke", "confirmed", "2xx", "confirmed", true, "succeeded", "BUILD_IDENTITY_UNQUALIFIED", false),
]);

const ACTIONS = ["login", "refresh", "logout"] as const;
const MODES = ["ordinary", "require_remote_revoke"] as const;
const OUTCOMES = ["succeeded", "failed"] as const;
const REMOTE_ACTIONS = ["not_applicable", "token_exchange", "refresh", "revoke"] as const;
const REMOTE_RESULTS = ["not_applicable", "confirmed", "rejected", "indeterminate"] as const;
const HTTP_CLASSES = ["not_applicable", "2xx", "3xx", "4xx", "5xx", "network_error"] as const;
const LOCAL_ACTIONS = ["write", "delete"] as const;
const LOCAL_RESULTS = ["confirmed", "not_performed", "failed"] as const;
const REASONS = [
  "BUILD_IDENTITY_UNQUALIFIED",
  "CREDENTIAL_PROFILE_MISMATCH",
  "AUTH_REMOTE_REJECTED",
  "AUTH_REMOTE_INDETERMINATE",
  "AUTH_RESPONSE_INVALID",
  "CREDENTIAL_WRITE_FAILED",
  "CREDENTIAL_DELETE_FAILED",
] as const;

export function parseAuthOperationReceipt(value: unknown): AuthOperationReceiptV1 {
  const input = exactObject(value, ROOT_KEYS);
  const worker = exactObject(input.worker, WORKER_KEYS);
  const credential = exactObject(input.credential, CREDENTIAL_KEYS);
  const remote = exactObject(input.remote, REMOTE_KEYS);
  const local = exactObject(input.local, LOCAL_KEYS);

  if (input.schema !== "darwinian.worker.auth-operation" || input.schemaVersion !== 1) fail();
  if (worker.version !== "1.3.0") fail();
  if (typeof worker.sourceCommit !== "string" || !FULL_LOWERCASE_GIT_SHA.test(worker.sourceCommit)) fail();
  if (typeof input.qualificationNamespaceDigest !== "string" || !SHA256.test(input.qualificationNamespaceDigest)) fail();
  if (typeof credential.credentialId !== "string" || !UUID_V4.test(credential.credentialId)) fail();
  if (typeof credential.generation !== "number" || !Number.isSafeInteger(credential.generation) || credential.generation < 1) fail();
  if (credential.clientId !== "drwn-cli") fail();
  const issuedAt = canonicalTimestamp(credential.issuedAt);
  const expiresAt = canonicalTimestamp(credential.expiresAt);
  const actionAt = canonicalTimestamp(input.actionAt);
  if (Date.parse(expiresAt) <= Date.parse(issuedAt) || Date.parse(actionAt) < Date.parse(issuedAt)) fail();

  const action = oneOf(input.action, ACTIONS);
  const reason = input.reason === null ? null : oneOf(input.reason, REASONS);
  if (action === "login" && credential.generation !== 1) fail();
  if (typeof input.qualificationEligible !== "boolean") fail();
  if (typeof local.afterConfirmedRemoteRevoke !== "boolean") fail();

  const receipt: AuthOperationReceiptV1 = {
    schema: "darwinian.worker.auth-operation",
    schemaVersion: 1,
    worker: { version: worker.version, sourceCommit: worker.sourceCommit },
    qualificationNamespaceDigest: input.qualificationNamespaceDigest,
    credential: {
      credentialId: credential.credentialId,
      generation: credential.generation,
      issuer: publicIssuer(credential.issuer),
      clientId: "drwn-cli",
      resource: publicResource(credential.resource),
      issuedAt,
      expiresAt,
    },
    action,
    mode: oneOf(input.mode, MODES),
    actionAt,
    outcome: oneOf(input.outcome, OUTCOMES),
    qualificationEligible: input.qualificationEligible,
    remote: {
      action: oneOf(remote.action, REMOTE_ACTIONS),
      result: oneOf(remote.result, REMOTE_RESULTS),
      httpClass: oneOf(remote.httpClass, HTTP_CLASSES),
    },
    local: {
      action: oneOf(local.action, LOCAL_ACTIONS),
      result: oneOf(local.result, LOCAL_RESULTS),
      afterConfirmedRemoteRevoke: local.afterConfirmedRemoteRevoke,
    },
    reason,
  };
  if (!AUTH_OPERATION_PRODUCER_ROWS.has(stateRowKey(receipt))) fail();
  if (receipt.qualificationEligible && receipt.worker.sourceCommit === DEVELOPMENT_SOURCE_COMMIT) fail();
  if (receipt.reason === "BUILD_IDENTITY_UNQUALIFIED" &&
    receipt.worker.sourceCommit !== DEVELOPMENT_SOURCE_COMMIT) fail();
  return receipt;
}

function assertRuntimeIdentity(identity: RuntimeBuildIdentity): void {
  if (
    identity.version !== "1.3.0" ||
    !FULL_LOWERCASE_GIT_SHA.test(identity.sourceCommit) ||
    (identity.kind === "development" &&
      (identity.sourceCommit !== DEVELOPMENT_SOURCE_COMMIT || identity.qualificationEligible)) ||
    (identity.kind === "packaged" &&
      (identity.sourceCommit === DEVELOPMENT_SOURCE_COMMIT || !identity.qualificationEligible))
  ) fail();
}

function isQualifyingSuccess(operation: AuthOperationState): boolean {
  if (
    operation.outcome !== "succeeded" ||
    operation.remote.result !== "confirmed" ||
    operation.remote.httpClass !== "2xx" ||
    operation.local.result !== "confirmed" ||
    operation.reason !== null
  ) return false;
  if (operation.action === "login" || operation.action === "refresh") return true;
  return operation.action === "logout" && operation.mode === "require_remote_revoke" &&
    operation.local.afterConfirmedRemoteRevoke;
}

export function createAuthOperationReceipt(
  input: CreateAuthOperationReceiptInput,
): AuthOperationReceiptV1 {
  assertRuntimeIdentity(input.buildIdentity);
  const qualifyingSuccess = isQualifyingSuccess(input.operation);
  const qualificationEligible = qualifyingSuccess && input.buildIdentity.qualificationEligible;
  const reason = qualifyingSuccess && !input.buildIdentity.qualificationEligible
    ? "BUILD_IDENTITY_UNQUALIFIED"
    : input.operation.reason;

  return parseAuthOperationReceipt({
    schema: "darwinian.worker.auth-operation",
    schemaVersion: 1,
    worker: {
      version: input.buildIdentity.version,
      sourceCommit: input.buildIdentity.sourceCommit,
    },
    qualificationNamespaceDigest: input.qualificationNamespaceDigest,
    credential: {
      credentialId: input.credential.credentialId,
      generation: input.credential.generation,
      issuer: input.credential.issuer,
      clientId: input.credential.clientId,
      resource: input.credential.resource,
      issuedAt: input.credential.issuedAt,
      expiresAt: input.credential.expiresAt,
    },
    action: input.operation.action,
    mode: input.operation.mode,
    actionAt: input.actionAt,
    outcome: input.operation.outcome,
    qualificationEligible,
    remote: {
      action: input.operation.remote.action,
      result: input.operation.remote.result,
      httpClass: input.operation.remote.httpClass,
    },
    local: {
      action: input.operation.local.action,
      result: input.operation.local.result,
      afterConfirmedRemoteRevoke: input.operation.local.afterConfirmedRemoteRevoke,
    },
    reason,
  });
}

export function serializeAuthOperationReceipt(receipt: AuthOperationReceiptV1): string {
  return `${JSON.stringify(parseAuthOperationReceipt(receipt))}\n`;
}
