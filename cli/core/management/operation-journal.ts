// ABOUTME: Persists resumable non-secret management mutation bytes and monotonic client phases.
// ABOUTME: Secret requests are never journaled and one fingerprint may resume at most one operation.

import { createHash } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";
import { withOwnerLock } from "../owner-lock";
import { preparePrivateFilePath, readPrivateFile, removePrivateFile, writePrivateFile } from "../private-file";
import { MANAGEMENT_ROUTE_KEYS, type ManagementRouteKey } from "./routes";
import { resolveClientOperationPath, resolveCloudOperationsDir, resolveProjectCloudLockPath } from "./paths";

const MAX_REQUEST_BYTES = 32_768;
const MAX_OPERATION_FILES = 100;
const journalableRoutes = new Set<ManagementRouteKey>([
  "deployed_workers.register",
  "deployments.create",
  "deployments.rollback",
  "deployed_workers.retire",
]);
const forbiddenRequestKeys = new Set([
  "credential",
  "credentials",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "managementtoken",
  "managementauthorization",
  "managementbearer",
  "keyref",
  "privatekey",
  "apikey",
  "providertoken",
  "secret",
  "secretvalue",
]);
const forbiddenRequestValues = [
  /\bBearer\s+\S+/i,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/,
  /\b(?:sk|rk|ghp|github_pat)[_-][A-Za-z0-9_-]{12,}\b/i,
];
const phases = ["prepared", "sent", "indeterminate", "receipt_verified", "context_committed"] as const;
type ClientOperationPhase = typeof phases[number];
const allowedTransitions: Readonly<Record<ClientOperationPhase, readonly ClientOperationPhase[]>> = {
  prepared: ["sent"],
  sent: ["indeterminate", "receipt_verified"],
  indeterminate: ["receipt_verified"],
  receipt_verified: ["context_committed"],
  context_committed: [],
};

const timestampSchema = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
});
const operationIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const routeKeySchema = z.enum(MANAGEMENT_ROUTE_KEYS);
const requestBase64Schema = z.string().min(1).max(Math.ceil(MAX_REQUEST_BYTES / 3) * 4 + 4).refine((value) => {
  const bytes = Buffer.from(value, "base64");
  return bytes.byteLength > 0 && bytes.byteLength <= MAX_REQUEST_BYTES && bytes.toString("base64") === value;
});

const journalSchema = z.object({
  schema: z.literal("drwn.client-operation"),
  schemaVersion: z.literal(1),
  operationId: operationIdSchema,
  profileDigest: z.string().regex(/^[a-f0-9]{64}$/),
  routeKey: routeKeySchema,
  requestBase64: requestBase64Schema,
  requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  phase: z.enum(phases),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((value, context) => {
  const bytes = Buffer.from(value.requestBase64, "base64");
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== value.requestFingerprint) {
    context.addIssue({ code: "custom", path: ["requestFingerprint"], message: "fingerprint mismatch" });
  }
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt precedes createdAt" });
  }
});

export type ClientOperationV1 = z.infer<typeof journalSchema>;

function invalidOperation(code = "CLIENT_OPERATION_INVALID"): DrwnError {
  return new DrwnError(code, "Client operation journal is malformed or conflicts with retained intent.");
}

function parseJournal(bytes: string): ClientOperationV1 {
  try {
    return journalSchema.parse(JSON.parse(bytes));
  } catch {
    throw invalidOperation();
  }
}

function requestFingerprint(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function containsCredentialShape(value: unknown): boolean {
  if (typeof value === "string") return forbiddenRequestValues.some((pattern) => pattern.test(value));
  if (Array.isArray(value)) return value.some(containsCredentialShape);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, child]) => {
      const normalized = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
      return forbiddenRequestKeys.has(normalized) || containsCredentialShape(child);
    });
  }
  return false;
}

function assertJournalable(routeKey: ManagementRouteKey, bytes: Uint8Array): void {
  if (routeKey === "secrets.set") {
    throw new DrwnError("SECRET_REPLAY_FORBIDDEN", "Secret mutations cannot be persisted for cold-process replay.");
  }
  if (routeKey === "runs.create") {
    throw new DrwnError("SENSITIVE_REPLAY_FORBIDDEN", "Human-authored run input cannot be persisted for cold-process replay.");
  }
  if (!journalableRoutes.has(routeKey)) throw invalidOperation();
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_REQUEST_BYTES) throw invalidOperation();
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidOperation();
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || containsCredentialShape(value)) {
    throw invalidOperation();
  }
}

async function withJournalLock<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
  const path = resolveProjectCloudLockPath(projectRoot);
  await preparePrivateFilePath({ root: projectRoot, path });
  return withOwnerLock({
    path,
    label: "cloud operation mutation",
    busyCode: "CLOUD_STATE_BUSY",
    unrecoverableCode: "CLOUD_STATE_LOCK_UNRECOVERABLE",
  }, async () => operation());
}

export async function loadClientOperation(projectRoot: string, operationId: string): Promise<ClientOperationV1 | null> {
  const path = resolveClientOperationPath(projectRoot, operationId);
  const bytes = await readPrivateFile({ root: projectRoot, path, maxBytes: 65_536 });
  return bytes === null ? null : parseJournal(bytes);
}

export async function createClientOperation(projectRoot: string, input: {
  operationId: string;
  profileDigest: string;
  routeKey: ManagementRouteKey;
  requestBytes: Uint8Array;
  now: string;
}): Promise<ClientOperationV1> {
  assertJournalable(input.routeKey, input.requestBytes);
  const candidate = journalSchema.parse({
    schema: "drwn.client-operation",
    schemaVersion: 1,
    operationId: input.operationId,
    profileDigest: input.profileDigest,
    routeKey: input.routeKey,
    requestBase64: Buffer.from(input.requestBytes).toString("base64"),
    requestFingerprint: requestFingerprint(input.requestBytes),
    phase: "prepared",
    createdAt: input.now,
    updatedAt: input.now,
  });
  return withJournalLock(projectRoot, async () => {
    const current = await loadClientOperation(projectRoot, input.operationId);
    if (current) {
      if (
        current.profileDigest === candidate.profileDigest &&
        current.routeKey === candidate.routeKey &&
        current.requestFingerprint === candidate.requestFingerprint &&
        current.requestBase64 === candidate.requestBase64
      ) return current;
      throw invalidOperation("OPERATION_ID_CONFLICT");
    }
    await writePrivateFile({
      root: projectRoot,
      path: resolveClientOperationPath(projectRoot, input.operationId),
      bytes: `${JSON.stringify(candidate, null, 2)}\n`,
    });
    return candidate;
  });
}

export async function advanceClientOperation(
  projectRoot: string,
  operationId: string,
  phase: ClientOperationPhase,
  updatedAt: string,
): Promise<ClientOperationV1> {
  return withJournalLock(projectRoot, async () => {
    const current = await loadClientOperation(projectRoot, operationId);
    if (!current) throw invalidOperation();
    if (
      !allowedTransitions[current.phase].includes(phase) ||
      Date.parse(updatedAt) <= Date.parse(current.updatedAt)
    ) throw invalidOperation();
    const next = journalSchema.parse({ ...current, phase, updatedAt });
    await writePrivateFile({
      root: projectRoot,
      path: resolveClientOperationPath(projectRoot, operationId),
      bytes: `${JSON.stringify(next, null, 2)}\n`,
    });
    return next;
  });
}

export async function removeCompletedClientOperation(projectRoot: string, operationId: string): Promise<void> {
  await withJournalLock(projectRoot, async () => {
    const current = await loadClientOperation(projectRoot, operationId);
    if (!current || current.phase !== "context_committed") throw invalidOperation();
    await removePrivateFile({ root: projectRoot, path: resolveClientOperationPath(projectRoot, operationId) });
  });
}

export async function findMatchingClientOperation(projectRoot: string, input: {
  profileDigest: string;
  routeKey: ManagementRouteKey;
  requestBytes: Uint8Array;
}): Promise<ClientOperationV1 | null> {
  assertJournalable(input.routeKey, input.requestBytes);
  const directory = resolveCloudOperationsDir(projectRoot);
  let stats;
  try {
    stats = await lstat(directory);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw invalidOperation();
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(directory) !== resolve(directory)) throw invalidOperation();
  const entries = (await readdir(directory)).sort();
  if (entries.length > MAX_OPERATION_FILES || entries.some((entry) => !/^[0-9a-f-]{36}\.json$/.test(entry))) {
    throw invalidOperation();
  }
  const fingerprint = requestFingerprint(input.requestBytes);
  const matches: ClientOperationV1[] = [];
  for (const entry of entries) {
    const journal = await loadClientOperation(projectRoot, entry.slice(0, -5));
    if (
      journal && journal.profileDigest === input.profileDigest && journal.routeKey === input.routeKey &&
      journal.requestFingerprint === fingerprint && journal.requestBase64 === Buffer.from(input.requestBytes).toString("base64")
    ) matches.push(journal);
  }
  if (matches.length > 1) throw new DrwnError("OPERATION_RESUME_AMBIGUOUS", "Multiple retained operations match the same request intent.");
  return matches[0] ?? null;
}
