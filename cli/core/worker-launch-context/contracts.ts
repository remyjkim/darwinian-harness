// ABOUTME: Defines strict bounded public contracts for Worker launch plans, contexts, and receipts.
// ABOUTME: Keeps the Rust consumer and generated context store on one versioned schema boundary.

import { z } from "zod";
import { DrwnError } from "../errors";
import { isStrictSemver } from "../semver-utils";

export const WORKER_LAUNCH_CONTRACT_MAX_BYTES = 65_536;
export const WORKER_LAUNCH_MAX_CONTEXTS = 1_024;

const digest = z.string().regex(/^sha256-[a-f0-9]{64}$/);
const safeIdentifier = z.string().min(1).max(200).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value) && !value.includes("\\") && !value.split("/").includes(".."),
  "identifier is not path-safe",
);
const absolutePath = z.string().min(1).max(4_096).refine(
  (value) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value) && !/[\u0000-\u001f\u007f]/.test(value),
  "path must be absolute and contain no control characters",
);
const safeRelativePath = z.string().min(1).max(1_024).refine((value) => {
  if (value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}, "path must be a contained normalized relative path");
const semanticVersion = z.string().max(80).refine(isStrictSemver, "expected strict semantic version");
const isoTimestamp = z.string().refine((value) => {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}, "expected canonical ISO timestamp");

function addSortedUniqueIssues(values: string[], context: z.RefinementCtx, label: string) {
  const sorted = [...values].sort();
  if (new Set(values).size !== values.length || values.some((value, index) => value !== sorted[index])) {
    context.addIssue({ code: "custom", message: `${label} must be uniquely UTF-16 sorted` });
  }
}

const sortedUniqueIdentifiers = z.array(safeIdentifier).max(1_024).superRefine((values, context) => {
  addSortedUniqueIssues(values, context, "identifiers");
});

const diagnosticSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  severity: z.enum(["info", "warning"]),
  message: z.string().min(1).max(1_024),
  hints: z.array(z.string().min(1).max(1_024)).max(16).optional(),
}).strict();

const rootIdentitySchema = z.object({
  name: safeIdentifier,
  requested: safeIdentifier,
  kind: z.enum(["card", "blueprint"]),
  closureDigest: digest,
  localOnly: z.boolean(),
}).strict();

const cardIdentitySchema = z.object({
  name: safeIdentifier,
  version: semanticVersion,
  integrity: digest,
  treeSha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  local: z.boolean(),
}).strict();

const skillCapabilitySchema = z.object({
  id: safeIdentifier,
  contentHash: digest,
}).strict();

const mcpCapabilitySchema = z.object({
  id: safeIdentifier,
  definitionHash: digest,
  optional: z.boolean(),
}).strict();

const hookCapabilitySchema = z.object({
  id: safeIdentifier,
  contentHash: digest,
  consentHash: digest,
}).strict();

const instructionCapabilitySchema = z.discriminatedUnion("present", [
  z.object({ present: z.literal(false) }).strict(),
  z.object({ present: z.literal(true), contentHash: digest, consentHash: digest }).strict(),
]);

const capabilitiesSchema = z.object({
  skills: z.array(skillCapabilitySchema).max(1_024),
  mcpServers: z.array(mcpCapabilitySchema).max(1_024),
  hooks: z.array(hookCapabilitySchema).max(1_024),
  instructions: instructionCapabilitySchema,
}).strict().superRefine((value, context) => {
  addSortedUniqueIssues(value.skills.map((entry) => entry.id), context, "skill IDs");
  addSortedUniqueIssues(value.mcpServers.map((entry) => entry.id), context, "MCP IDs");
  addSortedUniqueIssues(value.hooks.map((entry) => entry.id), context, "hook IDs");
});

const optionalMcpRejectionSchema = z.object({
  id: safeIdentifier,
  reason: z.enum(["not_declared", "not_optional", "not_in_assigned_closure", "conflict"]),
}).strict();

const optionalMcpSchema = z.object({
  requested: sortedUniqueIdentifiers,
  enabled: sortedUniqueIdentifiers,
  rejected: z.array(optionalMcpRejectionSchema).max(1_024),
}).strict().superRefine((value, context) => {
  addSortedUniqueIssues(value.rejected.map((entry) => entry.id), context, "rejected optional MCP IDs");
  if (value.enabled.some((id) => !value.requested.includes(id))) {
    context.addIssue({ code: "custom", message: "enabled optional MCP IDs must be requested" });
  }
});

const consentExclusionSchema = z.object({
  id: safeIdentifier,
  reason: z.enum(["consent_required", "consent_stale"]),
}).strict();

const consentSchema = z.object({
  strict: z.boolean(),
  included: sortedUniqueIdentifiers,
  excluded: z.array(consentExclusionSchema).max(1_024),
}).strict().superRefine((value, context) => {
  addSortedUniqueIssues(value.excluded.map((entry) => entry.id), context, "excluded consent IDs");
  if (value.strict && value.excluded.length > 0) {
    context.addIssue({ code: "custom", message: "strict consent summary cannot contain exclusions" });
  }
});

const targetPlanCompatibilitySchema = z.object({
  minimumVersion: semanticVersion,
  probed: z.literal(false),
}).strict();

const targetContextCompatibilitySchema = z.object({
  minimumVersion: semanticVersion,
  probed: z.literal(true),
  observedVersion: semanticVersion,
}).strict();

export const workerLaunchPlanSchema = z.object({
  schema: z.literal("drwn.worker-launch-plan"),
  schemaVersion: z.literal(1),
  target: z.enum(["claude", "codex"]),
  projectRoot: absolutePath,
  baseRoot: rootIdentitySchema.nullable(),
  assignedRoot: rootIdentitySchema,
  baseClosure: z.array(cardIdentitySchema).max(256),
  assignedClosure: z.array(cardIdentitySchema).min(1).max(256),
  deltaClosure: z.array(cardIdentitySchema).max(256),
  capabilities: capabilitiesSchema,
  optionalMcp: optionalMcpSchema,
  consent: consentSchema,
  targetCompatibility: targetPlanCompatibilitySchema,
  warnings: z.array(diagnosticSchema).max(256),
  plannedContextId: digest,
  plannedArtifactDir: absolutePath,
}).strict().superRefine((value, context) => {
  for (const [label, cards] of [["base closure", value.baseClosure], ["assigned closure", value.assignedClosure], ["delta closure", value.deltaClosure]] as const) {
    if (new Set(cards.map((card) => card.name)).size !== cards.length) {
      context.addIssue({ code: "custom", message: `${label} contains duplicate Card identities` });
    }
  }
  if (!value.plannedArtifactDir.endsWith(`/${value.plannedContextId}`) && !value.plannedArtifactDir.endsWith(`\\${value.plannedContextId}`)) {
    context.addIssue({ code: "custom", message: "planned artifact path must end with the context ID" });
  }
});

const contextCapabilitiesSchema = z.object({
  skills: sortedUniqueIdentifiers,
  mcpServers: sortedUniqueIdentifiers,
  hooks: sortedUniqueIdentifiers,
  instructions: z.boolean(),
}).strict();

const launchSchema = z.object({
  args: z.array(z.string().max(32_768).refine((value) => !/[\u0000\r\n]/.test(value))).max(128),
  env: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(32_768)).superRefine((value, context) => {
    if (Object.keys(value).length > 128) context.addIssue({ code: "custom", message: "launch env exceeds its entry limit" });
  }),
}).strict();

export const workerLaunchContextSchema = z.object({
  schema: z.literal("drwn.worker-launch-context"),
  schemaVersion: z.literal(1),
  contextId: digest,
  target: z.enum(["claude", "codex"]),
  kind: z.enum(["claude", "codex"]),
  baseRoot: rootIdentitySchema.nullable(),
  assignedRoot: rootIdentitySchema,
  artifactDir: absolutePath,
  request: z.object({
    enabledOptionalMcp: sortedUniqueIdentifiers,
    strict: z.boolean(),
  }).strict(),
  launch: launchSchema,
  capabilities: contextCapabilitiesSchema,
  sourceState: z.object({
    projectRootHash: digest,
    baseClosureDigest: digest.nullable(),
    assignedClosureDigest: digest,
    projectOverlayDigest: digest,
    localOverlayDigest: digest.optional(),
  }).strict(),
  targetCompatibility: targetContextCompatibilitySchema,
  provenance: z.object({
    drwnVersion: semanticVersion,
    sourceProjectLockDigest: digest,
    sourceLocalLockDigest: digest.optional(),
    localOnly: z.boolean(),
  }).strict(),
  warnings: z.array(diagnosticSchema).max(256),
}).strict().superRefine((value, context) => {
  if (value.target !== value.kind) context.addIssue({ code: "custom", message: "target and kind must match" });
  if (!value.artifactDir.endsWith(`/${value.contextId}`) && !value.artifactDir.endsWith(`\\${value.contextId}`)) {
    context.addIssue({ code: "custom", message: "artifact path must end with the context ID" });
  }
});

const receiptFileSchema = z.object({
  path: safeRelativePath,
  kind: z.enum(["file", "directory"]),
  contentHash: digest,
}).strict();

export const workerLaunchReceiptSchema = z.object({
  schema: z.literal("drwn.worker-launch-receipt"),
  schemaVersion: z.literal(1),
  contextId: digest,
  createdAt: isoTimestamp,
  rendererVersion: z.string().min(1).max(80),
  files: z.array(receiptFileSchema).min(1).max(1_024),
}).strict().superRefine((value, context) => {
  addSortedUniqueIssues(value.files.map((entry) => entry.path), context, "receipt paths");
});

export const workerLaunchPrepareResultSchema = z.object({
  schema: z.literal("drwn.worker-launch-prepare-result"),
  schemaVersion: z.literal(1),
  reused: z.boolean(),
  context: workerLaunchContextSchema,
}).strict();

export type WorkerLaunchPlanV1 = z.infer<typeof workerLaunchPlanSchema>;
export type WorkerLaunchContextV1 = z.infer<typeof workerLaunchContextSchema>;
export type WorkerLaunchReceiptV1 = z.infer<typeof workerLaunchReceiptSchema>;
export type WorkerLaunchPrepareResultV1 = z.infer<typeof workerLaunchPrepareResultSchema>;
export type WorkerLaunchDiagnosticV1 = z.infer<typeof diagnosticSchema>;
export type WorkerLaunchRootIdentityV1 = z.infer<typeof rootIdentitySchema>;
export type WorkerLaunchCardIdentityV1 = z.infer<typeof cardIdentitySchema>;

function parseBounded<T>(schema: z.ZodType<T>, candidate: unknown): T {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(typeof candidate === "string" ? candidate : JSON.stringify(candidate));
  } catch (error) {
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", "Worker launch contract cannot be serialized", undefined, error);
  }
  if (bytes > WORKER_LAUNCH_CONTRACT_MAX_BYTES) {
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", `Worker launch contract exceeds ${WORKER_LAUNCH_CONTRACT_MAX_BYTES} bytes`);
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", "Worker launch contract is malformed or unsupported", undefined, parsed.error);
  }
  return parsed.data;
}

function parseBytes<T>(schema: z.ZodType<T>, bytes: string | Uint8Array): T {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  if (buffer.byteLength > WORKER_LAUNCH_CONTRACT_MAX_BYTES) {
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", `Worker launch contract exceeds ${WORKER_LAUNCH_CONTRACT_MAX_BYTES} bytes`);
  }
  try {
    return parseBounded(schema, JSON.parse(buffer.toString("utf8")));
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", "Worker launch contract contains invalid JSON", undefined, error);
  }
}

export const parseWorkerLaunchPlan = (candidate: unknown) => parseBounded(workerLaunchPlanSchema, candidate);
export const parseWorkerLaunchContext = (candidate: unknown) => parseBounded(workerLaunchContextSchema, candidate);
export const parseWorkerLaunchReceipt = (candidate: unknown) => parseBounded(workerLaunchReceiptSchema, candidate);
export const parseWorkerLaunchPrepareResult = (candidate: unknown) => parseBounded(workerLaunchPrepareResultSchema, candidate);
export const parseWorkerLaunchPlanBytes = (bytes: string | Uint8Array) => parseBytes(workerLaunchPlanSchema, bytes);
export const parseWorkerLaunchContextBytes = (bytes: string | Uint8Array) => parseBytes(workerLaunchContextSchema, bytes);
export const parseWorkerLaunchReceiptBytes = (bytes: string | Uint8Array) => parseBytes(workerLaunchReceiptSchema, bytes);
