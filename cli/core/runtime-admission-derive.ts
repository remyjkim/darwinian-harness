// ABOUTME: Admits one offline derivation input and publishes the Worker v2 output artifact.
// ABOUTME: Confines both operands, proves descriptor-bound no-replace publication, and classifies every outcome.

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { posix as posixPath } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadBuildIdentity as loadPackagedBuildIdentity,
  type RuntimeBuildIdentity,
} from "./build-identity";
import {
  loadDescriptorOps,
  type DescriptorOps,
  type DescriptorStat,
} from "./runtime-admission-descriptors";
import {
  canonicalizeRuntimeAdmissionJson,
  deriveRuntimeAdmissionForClosure,
  type RuntimeAdmissionClosureCard,
} from "./runtime-admission-manifest";

export const RUNTIME_ADMISSION_DERIVE_COMMAND_ID = "runtime-admission:derive:v2";
export const RUNTIME_ADMISSION_ADAPTER_VERSION = "cl.i265.worker-runtime-admission-adapter.v1";
export const RUNTIME_ADMISSION_INPUT_SCHEMA = "cl.i268.finch-derivation-input.v1";
export const RUNTIME_ADMISSION_OUTPUT_SCHEMA = "cl.i268.finch-derivation-output.v2";
export const RUNTIME_ADMISSION_ADAPTER_ENTRY = "cli/tools/runtime-admission-derive.ts";

/**
 * Every file that implements the process-adapter contract, in the strictly ascending
 * order the attestation requires. Reachability from the entry found these; what puts
 * a file here is that replacing it changes what the adapter admits or publishes.
 * `cli/core/errors.ts` is reachable and deliberately absent: it is a repo-wide error
 * module the adapter never dispatches on, so it carries none of the contract.
 */
export const RUNTIME_ADMISSION_ADAPTER_IMPLEMENTATION = [
  "cli/core/build-identity.ts",
  "cli/core/runtime-admission-derive.ts",
  "cli/core/runtime-admission-descriptors.ts",
  "cli/core/runtime-admission-manifest.ts",
  RUNTIME_ADMISSION_ADAPTER_ENTRY,
] as const;
export const PERSISTENCE_OUTCOME_SCHEMA = "cl.i265.worker-runtime-admission-persistence-outcome.v1";
export const ARTIFACT_IDENTITY_SCHEMA = "cl.i268.serialized-artifact-identity.v1";
export const FINCH_NESTED_INERT_RULE_SCHEMA = "cl.i268.finch-nested-inert-rule-config.v1";
export const FINCH_NESTED_INERT_RULE_SHA256 =
  "32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a";

export const MAX_DERIVATION_BYTES = 1_048_576;
export const MAX_OPERAND_BYTES = 4_096;
export const MAX_DIAGNOSTIC_BYTES = 512;

export const RUNTIME_ADMISSION_COMMIT_STATES = {
  WORKER_RUNTIME_ADMISSION_INPUT_INVALID: "not_committed",
  WORKER_RUNTIME_ADMISSION_DERIVATION_FAILED: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_SERIALIZATION_FAILED: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE: "not_committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE: "indeterminate",
  WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE: "indeterminate",
  WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED: "committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE: "committed",
  WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED: "committed",
} as const;

export type PersistenceOutcomeCode = keyof typeof RUNTIME_ADMISSION_COMMIT_STATES;
export type CommitState = (typeof RUNTIME_ADMISSION_COMMIT_STATES)[PersistenceOutcomeCode];
export type DerivationPhase = "tools" | "root";

export interface SerializedArtifactIdentity {
  schema: typeof ARTIFACT_IDENTITY_SCHEMA;
  phase: DerivationPhase;
  byteLength: number;
  sha256: string;
}

export interface PersistenceOutcome {
  schema: typeof PERSISTENCE_OUTCOME_SCHEMA;
  code: PersistenceOutcomeCode;
  commitState: CommitState;
  retry: "forbidden";
  artifactIdentity: SerializedArtifactIdentity | null;
}

export type RuntimeAdmissionDeriveSeam = (context: Record<string, unknown>) => void;

export interface RuntimeAdmissionDeriveOptions {
  argv: readonly string[];
  workingDirectory: string;
  loadBuildIdentity?: () => Promise<RuntimeBuildIdentity>;
  seams?: Record<string, RuntimeAdmissionDeriveSeam>;
  /** Wraps the real descriptor operations so a caller can observe or fault one seam. */
  observeDescriptorOps?: (ops: DescriptorOps) => DescriptorOps;
}

/**
 * Byte-exact accepted diagnostic form: insertion-ordered `JSON.stringify` with no
 * optional whitespace and one trailing LF. The sorted canonical form used for
 * derivation bytes is deliberately not reachable from here.
 */
export function formatPersistenceOutcome(outcome: PersistenceOutcome): string {
  const identity = outcome.artifactIdentity === null ? null : {
    schema: outcome.artifactIdentity.schema,
    phase: outcome.artifactIdentity.phase,
    byteLength: outcome.artifactIdentity.byteLength,
    sha256: outcome.artifactIdentity.sha256,
  };
  return `${JSON.stringify({
    schema: outcome.schema,
    code: outcome.code,
    commitState: outcome.commitState,
    retry: outcome.retry,
    artifactIdentity: identity,
  })}\n`;
}

function outcome(
  code: PersistenceOutcomeCode,
  artifactIdentity: SerializedArtifactIdentity | null = null,
): PersistenceOutcome {
  const commitState = RUNTIME_ADMISSION_COMMIT_STATES[code];
  return {
    schema: PERSISTENCE_OUTCOME_SCHEMA,
    code,
    commitState,
    retry: "forbidden",
    artifactIdentity: commitState === "not_committed" ? null : artifactIdentity,
  };
}

class AdmissionRejected extends Error {
  constructor() {
    super("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    this.name = "AdmissionRejected";
  }
}

function reject(): never {
  throw new AdmissionRejected();
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface AdapterImplementationFile {
  path: string;
  byteLength: number;
  sha256: string;
}

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Attests the adapter over its own real bytes. A frozen table cannot express this:
 * whichever file carried it would have to contain its own digest, and moving the
 * table to an excluded module would restore exactly the hole this attestation closes
 * — a file that decides the attested value while not being part of it.
 */
export function readAdapterImplementation(): {
  implementation: AdapterImplementationFile[];
  implementationSha256: string;
} {
  const implementation = RUNTIME_ADMISSION_ADAPTER_IMPLEMENTATION.map((path) => {
    const bytes = readFileSync(join(PACKAGE_ROOT, path));
    return { path: path as string, byteLength: bytes.byteLength, sha256: sha256(bytes) };
  });
  return {
    implementation,
    implementationSha256: sha256(Buffer.from(JSON.stringify(implementation), "utf8")),
  };
}

const NESTED_INERT_RULE_CONFIG_BASE64 =
  "eyJzY2hlbWEiOiJjbC5pMjY4LmZpbmNoLW5lc3RlZC1pbmVydC1ydWxlLWNvbmZpZy52MSIsInNjaGVtYVZlcnNpb24iOjEsImNh" +
  "cmRzIjp7IkBjdXJhdGlvbi1sYWJzL2J1enotZGVsaXZlcnktdG9vbHMiOnsic2VydmVySWRzIjpbImJ1enotdG9vbHMiXSwic2Vy" +
  "dmVyIjp7ImlkIjoiYnV6ei10b29scyIsInRyYW5zcG9ydCI6InN0ZGlvIiwiY29tbWFuZCI6ImRyd24iLCJhcmdzIjpbIndvcmtl" +
  "ciIsImJ1enotdG9vbHMiXSwib3B0aW9uYWwiOmZhbHNlLCJwcm92aWRlciI6ImFic2VudCIsImVudiI6ImFic2VudCIsImhlYWRl" +
  "cnMiOiJhYnNlbnQiLCJ1cmwiOiJhYnNlbnQifX0sIkBjdXJhdGlvbi1sYWJzL2J1enotZGVsaXZlcnktd29ya2VyIjp7InNlcnZl" +
  "cklkcyI6W119fSwibG9jayI6eyJhbGxvd2VkT3JpZ2lucyI6WyJmaWxlIiwic3RvcmUiLCJnaXQiXSwicGF0aCI6eyJlZmZlY3Qi" +
  "OiJpbmVydC1vbmx5IiwibWF4VXRmOEJ5dGVzIjo0MDk2LCJub3JtYWxpemF0aW9uIjoiTkZDIiwiZm9yYmlkZGVuQ29kZVBvaW50" +
  "cyI6WyJVKzAwMDAtVSswMDFGIiwiVSswMDdGIl19LCJnaXQiOnsiYWxsb3dlZFVybHMiOlsiaHR0cHM6Ly9naXRodWIuY29tL2N1" +
  "cmF0aW9uLWxhYnMvYnV6ei1kZWxpdmVyeS10b29scy5naXQiLCJodHRwczovL2dpdGh1Yi5jb20vY3VyYXRpb24tbGFicy9idXp6" +
  "LWRlbGl2ZXJ5LXdvcmtlci5naXQiXSwic2NoZW1lIjoiaHR0cHMiLCJob3N0IjoiZ2l0aHViLmNvbSIsInVzZXJpbmZvIjoiYWJz" +
  "ZW50IiwicXVlcnkiOiJhYnNlbnQiLCJmcmFnbWVudCI6ImFic2VudCIsInJlZiI6ImNhbmRpZGF0ZS1ib3VuZC1pbmVydC1vbmx5" +
  "IiwiY29tbWl0IjoiNDAtbG93ZXItaGV4In0sImNhcmRBdXhpbGlhcnkiOnsic2tpbGxzIjpbXSwiaG9va3MiOltdLCJwZXJzb25h" +
  "IjoiYWJzZW50IiwiYmVsaWVmcyI6ImFic2VudCIsIm1lbW9yeSI6ImFic2VudCIsImhvb2tDb25zZW50IjoiYWJzZW50IiwiaW5z" +
  "dHJ1Y3Rpb25Db25zZW50IjoiYWJzZW50IiwicmVnaXN0cnkiOm51bGx9fSwiZm9yYmlkZGVuTmVzdGVkQXV0aG9yaXR5IjpbInVu" +
  "ZXhwZWN0ZWQtc2VydmVyLWNvbW1hbmQtb3ItYXJnIiwic2VydmVyLXByb3ZpZGVyIiwic2VydmVyLXVybCIsInNlcnZlci1lbnYi" +
  "LCJzZXJ2ZXItaGVhZGVycyIsImNyZWRlbnRpYWwtYmVhcmluZy1naXQtdXJsIiwidW5leHBlY3RlZC1sb2NrLWF1eGlsaWFyeS1j" +
  "b250ZW50Il0sImVmZmVjdCI6Im5vbmUifQ==";

/** The frozen rule config bytes this producer embeds, rehashes, and reruns for itself. */
export function readNestedInertRuleConfigBytes(): Buffer {
  return Buffer.from(NESTED_INERT_RULE_CONFIG_BASE64, "base64");
}

interface NestedInertRuleConfig {
  cards: Record<string, {
    serverIds: string[];
    server?: {
      id: string;
      transport: string;
      command: string;
      args: string[];
      optional: boolean;
      provider: string;
      env: string;
      headers: string;
      url: string;
    };
  }>;
  lock: {
    allowedOrigins: string[];
    path: { maxUtf8Bytes: number; normalization: string };
    git: { allowedUrls: string[]; scheme: string; host: string };
    cardAuxiliary: { skills: unknown[]; hooks: unknown[]; registry: null };
  };
}

function admitNestedInertRuleConfig(): NestedInertRuleConfig {
  const bytes = readNestedInertRuleConfigBytes();
  if (
    bytes.byteLength !== 1_225 ||
    bytes.at(-1) === 0x0a ||
    sha256(bytes) !== FINCH_NESTED_INERT_RULE_SHA256
  ) reject();
  const source = bytes.toString("utf8");
  const value = JSON.parse(source) as NestedInertRuleConfig & { schema: string; schemaVersion: number };
  if (
    JSON.stringify(value) !== source ||
    value.schema !== FINCH_NESTED_INERT_RULE_SCHEMA ||
    value.schemaVersion !== 1
  ) reject();
  return value;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const LONE_SURROGATE_PATTERN = /\p{Surrogate}/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const REGISTRY_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]{86}==$/;
const TOOLS_CARD_NAME = "@curation-labs/buzz-delivery-tools";
const WORKER_CARD_NAME = "@curation-labs/buzz-delivery-worker";
const TOOL_SELECTORS = ["mcp:buzz-tools/buzz_messages_send", "mcp:buzz-tools/buzz_messages_thread"];
const REQUIREMENT_IDS = ["buzz-cli-artifact", "buzz-runtime-glibc"];

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) reject();
  return value as Record<string, unknown>;
}

function closed(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const record = plainRecord(value);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    reject();
  }
  return record;
}

function exactStrings(value: unknown, expected: readonly string[]): string[] {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) reject();
  return value as string[];
}

function boundedText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) reject();
  return value;
}

function hex(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) reject();
  return value;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) reject();
  return value as number;
}

/** A registry subresource integrity string: `sha512-` and 64 canonically encoded bytes. */
function registryIntegrity(value: unknown): string {
  if (typeof value !== "string" || !REGISTRY_INTEGRITY_PATTERN.test(value)) reject();
  const encoded = (value as string).slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 64 || decoded.toString("base64") !== encoded) reject();
  return value as string;
}

function decodeCanonicalBase64(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) reject();
  const bytes = Buffer.from(value as string, "base64");
  if (bytes.toString("base64") !== value) reject();
  return bytes;
}

function artifactIdentity(value: unknown, phase: DerivationPhase): SerializedArtifactIdentity {
  const record = closed(value, ["schema", "phase", "byteLength", "sha256"]);
  if (record.schema !== ARTIFACT_IDENTITY_SCHEMA || record.phase !== phase) reject();
  return {
    schema: ARTIFACT_IDENTITY_SCHEMA,
    phase,
    byteLength: positiveInteger(record.byteLength),
    sha256: hex(record.sha256, SHA256_PATTERN),
  };
}

function byteIdentity(value: unknown): { byteLength: number; sha256: string } {
  const record = closed(value, ["byteLength", "sha256"]);
  return {
    byteLength: positiveInteger(record.byteLength),
    sha256: hex(record.sha256, SHA256_PATTERN),
  };
}

function encodedBytes(value: unknown): Buffer {
  const record = closed(value, ["encoding", "bytesBase64", "byteLength", "sha256"]);
  if (record.encoding !== "base64") reject();
  const bytes = decodeCanonicalBase64(record.bytesBase64);
  if (record.byteLength !== bytes.byteLength || record.sha256 !== sha256(bytes)) reject();
  return bytes;
}

function parseJsonBytes(bytes: Uint8Array): unknown {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject();
  }
  try {
    return JSON.parse(source);
  } catch {
    return reject();
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonicalStableJson(left) === canonicalStableJson(right);
}

function canonicalStableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalStableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalStableJson(record[key])}`).join(",")}}`;
}

interface AdmittedCard {
  name: string;
  version: string;
  requested: string;
  integrity: string;
  treeSha: string;
  manifestIdentity: { byteLength: number; sha256: string };
  manifest: Record<string, unknown>;
}

interface AdmittedInput {
  phase: DerivationPhase;
  rawBytes: Buffer;
  candidateBytes: Buffer;
  candidateIdentity: SerializedArtifactIdentity;
  producerSource: { repository: string; commit: string; tree: string };
  workerSourceCommit: string;
  workerPackageVersion: string;
  entrypoint: { name: string; version: string; kind: string };
  cards: AdmittedCard[];
  cardLock: { byteLength: number; sha256: string; storeMinDrwnVersion: string };
  storeExport: Record<string, unknown>;
  phaseEvidence: Record<string, unknown>;
  ruleCoverage: { candidateSha256: string; manifestSha256s: string[]; cardLockSha256: string };
}

/**
 * The publication identities always describe the tools artifact, so they stay
 * tools-phase even when they appear inside a root candidate.
 */
function admitToolsPublication(value: unknown): void {
  const record = closed(value, ["receiptIdentity", "immutableRef", "refetchIdentity"]);
  artifactIdentity(record.receiptIdentity, "tools");
  artifactIdentity(record.refetchIdentity, "tools");
  if (record.immutableRef !== "github:curation-labs/buzz-delivery-tools#synthetic") reject();
}

function admitPhaseEvidence(value: unknown, phase: DerivationPhase): Record<string, unknown> {
  const record = closed(value, [
    "serverIds",
    "requirementIds",
    "toolSelectors",
    "deny",
    "toolsPublication",
  ]);
  exactStrings(record.serverIds, ["buzz-tools"]);
  exactStrings(record.requirementIds, REQUIREMENT_IDS);
  exactStrings(record.deny, []);
  if (phase === "tools") {
    exactStrings(record.toolSelectors, []);
    if (record.toolsPublication !== null) reject();
  } else {
    exactStrings(record.toolSelectors, TOOL_SELECTORS);
    admitToolsPublication(record.toolsPublication);
  }
  return record;
}

function admitStoreExport(value: unknown): Record<string, unknown> {
  const record = closed(value, ["format", "compression", "encoding", "byteLength", "sha256"]);
  if (record.format !== "tar" || record.compression !== "gzip" || record.encoding !== "base64") {
    reject();
  }
  positiveInteger(record.byteLength);
  hex(record.sha256, SHA256_PATTERN);
  return record;
}

function admitCardSummary(value: unknown): {
  name: string;
  version: string;
  requested: string;
  integrity: string;
  treeSha: string;
  manifestIdentity: { byteLength: number; sha256: string };
} {
  const record = closed(value, [
    "name",
    "version",
    "requested",
    "integrity",
    "treeSha",
    "manifestIdentity",
  ]);
  const manifestIdentity = byteIdentity(record.manifestIdentity);
  if (record.integrity !== `sha256-${manifestIdentity.sha256}`) reject();
  return {
    name: boundedText(record.name),
    version: boundedText(record.version),
    requested: boundedText(record.requested),
    integrity: record.integrity,
    treeSha: hex(record.treeSha, GIT_OBJECT_PATTERN),
    manifestIdentity,
  };
}

function admitProducerSource(
  value: unknown,
  producer: "worker" | "services",
): { repository: string; commit: string; tree: string } {
  const record = closed(value, [
    "repository",
    "commit",
    "tree",
    "adapterVersion",
    "adapterImplementationSha256",
  ]);
  // The frozen adapter rollup is admitted for shape only. This producer publishes the
  // rollup it computes over its own bytes; the candidate freeze is where a producer
  // that swapped its implementation and recomputed its own rollup is caught.
  hex(record.adapterImplementationSha256, SHA256_PATTERN);
  const expected = producer === "worker"
    ? { repository: "remyjkim/darwinian-worker", adapterVersion: RUNTIME_ADMISSION_ADAPTER_VERSION }
    : {
      repository: "curation-labs/darwinian-services",
      adapterVersion: "cl.i266.services-runtime-admission-adapter.v1",
    };
  if (record.repository !== expected.repository || record.adapterVersion !== expected.adapterVersion) {
    reject();
  }
  return {
    repository: expected.repository,
    commit: hex(record.commit, GIT_OBJECT_PATTERN),
    tree: hex(record.tree, GIT_OBJECT_PATTERN),
  };
}

interface AdmittedCandidate {
  producerSource: { repository: string; commit: string; tree: string };
  workerPackageVersion: string;
  workerSourceCommit: string;
  entrypoint: { name: string; version: string; kind: string };
  cards: ReturnType<typeof admitCardSummary>[];
  cardLock: { byteLength: number; sha256: string; storeMinDrwnVersion: string };
  storeExport: Record<string, unknown>;
  phaseEvidence: Record<string, unknown>;
}

function admitCandidate(value: unknown, phase: DerivationPhase): AdmittedCandidate {
  const record = closed(value, [
    "schema",
    "classification",
    "phase",
    "target",
    "source",
    "producerSources",
    "release",
    "closure",
    "phaseEvidence",
    "noSecretScan",
    ...(phase === "root" ? ["toolsPublication"] : []),
  ]);
  if (
    record.schema !== `cl.i268.finch-${phase}-candidate.v1` ||
    record.classification !== `production_${phase}_candidate` ||
    record.phase !== phase
  ) reject();

  const target = closed(record.target, ["designationIdentity", "collisionSnapshotIdentity"]);
  artifactIdentity(target.designationIdentity, phase);
  artifactIdentity(target.collisionSnapshotIdentity, phase);

  const source = closed(record.source, ["repository", "commit", "tree", "card", "sidecar"]);
  const expectedRepository = phase === "tools"
    ? "https://github.com/curation-labs/buzz-delivery-tools.git"
    : "https://github.com/curation-labs/buzz-delivery-worker.git";
  if (source.repository !== expectedRepository) reject();
  hex(source.commit, GIT_OBJECT_PATTERN);
  hex(source.tree, GIT_OBJECT_PATTERN);
  const card = closed(source.card, ["blob", "byteLength", "sha256"]);
  hex(card.blob, GIT_OBJECT_PATTERN);
  positiveInteger(card.byteLength);
  hex(card.sha256, SHA256_PATTERN);
  if (phase === "tools") {
    const sidecar = closed(source.sidecar, ["blob", "byteLength", "sha256"]);
    hex(sidecar.blob, GIT_OBJECT_PATTERN);
    positiveInteger(sidecar.byteLength);
    hex(sidecar.sha256, SHA256_PATTERN);
  } else if (source.sidecar !== null) reject();

  const producerSources = closed(record.producerSources, ["worker", "services"]);
  const workerSource = admitProducerSource(producerSources.worker, "worker");
  admitProducerSource(producerSources.services, "services");

  const release = closed(record.release, [
    "workerPackageVersion",
    "workerSourceCommit",
    "workerSourceTree",
    "workerPackageIdentity",
    "workerPackageIntegrity",
    "workerExecutableIdentity",
    "integratedReceiptIdentity",
    "sourceEquivalenceReceiptIdentity",
    "commonBuzzSha256",
    "provisional",
  ]);
  if (typeof release.workerPackageVersion !== "string" || release.provisional !== false) reject();
  const workerSourceCommit = hex(release.workerSourceCommit, GIT_OBJECT_PATTERN);
  hex(release.workerSourceTree, GIT_OBJECT_PATTERN);
  artifactIdentity(release.workerPackageIdentity, phase);
  registryIntegrity(release.workerPackageIntegrity);
  artifactIdentity(release.workerExecutableIdentity, phase);
  artifactIdentity(release.integratedReceiptIdentity, phase);
  artifactIdentity(release.sourceEquivalenceReceiptIdentity, phase);
  hex(release.commonBuzzSha256, SHA256_PATTERN);

  const closure = closed(record.closure, ["entrypoint", "cards", "cardLock", "storeExportIdentity"]);
  const entrypoint = closed(closure.entrypoint, ["name", "version", "kind"]);
  const expectedName = phase === "tools" ? TOOLS_CARD_NAME : WORKER_CARD_NAME;
  const expectedKind = phase === "tools" ? "capability" : "blueprint";
  if (
    entrypoint.name !== expectedName ||
    entrypoint.version !== "0.1.0" ||
    entrypoint.kind !== expectedKind
  ) reject();
  if (!Array.isArray(closure.cards) || closure.cards.length !== (phase === "tools" ? 1 : 2)) reject();
  const cards = (closure.cards as unknown[]).map(admitCardSummary);
  const expectedNames = phase === "tools"
    ? [TOOLS_CARD_NAME]
    : [WORKER_CARD_NAME, TOOLS_CARD_NAME];
  if (cards.some((entry, index) => entry.name !== expectedNames[index])) reject();
  if (
    card.byteLength !== cards[0]!.manifestIdentity.byteLength ||
    card.sha256 !== cards[0]!.manifestIdentity.sha256
  ) reject();

  const cardLock = closed(closure.cardLock, ["byteLength", "sha256", "storeMinDrwnVersion"]);
  if (cardLock.storeMinDrwnVersion !== "1.3.0") reject();
  const storeExport = admitStoreExport(closure.storeExportIdentity);
  const phaseEvidence = admitPhaseEvidence(record.phaseEvidence, phase);

  const noSecretScan = closed(record.noSecretScan, ["commandIdentity", "result"]);
  if (
    noSecretScan.commandIdentity !== "cl.i268.no-secret-scan.v1" ||
    noSecretScan.result !== "pass"
  ) reject();

  if (phase === "root") {
    admitToolsPublication(record.toolsPublication);
    if (!deepEqual(record.toolsPublication, phaseEvidence.toolsPublication)) reject();
  }

  return {
    producerSource: workerSource,
    workerPackageVersion: release.workerPackageVersion as string,
    workerSourceCommit,
    entrypoint: entrypoint as { name: string; version: string; kind: string },
    cards,
    cardLock: {
      byteLength: positiveInteger(cardLock.byteLength),
      sha256: hex(cardLock.sha256, SHA256_PATTERN),
      storeMinDrwnVersion: "1.3.0",
    },
    storeExport,
    phaseEvidence,
  };
}

/**
 * The frozen target-specific rule, rerun by this producer over the decoded bytes.
 * Nested command, path, and URL strings are hashed and strictly parsed here and
 * never executed, interpolated, dereferenced, or otherwise granted authority.
 */
function applyNestedInertRule(
  config: NestedInertRuleConfig,
  manifests: Record<string, unknown>[],
  lock: Record<string, unknown>,
  phase: DerivationPhase,
  cards: ReturnType<typeof admitCardSummary>[],
): void {
  for (const manifest of manifests) {
    const name = manifest.name;
    if (typeof name !== "string") reject();
    // A plain property read would resolve `__proto__` and `constructor` through the
    // prototype chain and admit a Card name the allowlist never declared.
    if (!Object.hasOwn(config.cards, name)) reject();
    const allowed = config.cards[name];
    if (allowed === undefined) reject();
    const servers = manifest.servers;
    if (allowed.serverIds.length === 0) {
      if (servers !== undefined) reject();
    } else {
      const declared = closed(servers, allowed.serverIds);
      const expected = allowed.server!;
      const server = closed(declared[expected.id], [
        "description",
        "transport",
        "command",
        "args",
        "optional",
      ]);
      if (
        server.transport !== expected.transport ||
        server.command !== expected.command ||
        server.optional !== expected.optional ||
        typeof server.description !== "string" ||
        server.description.length === 0
      ) reject();
      exactStrings(server.args, expected.args);
    }
    if (manifest.version !== "0.1.0") reject();
    const harness = plainRecord(manifest.harness);
    if (harness.minVersion !== "1.3.0" || manifest.lastValidatedWith !== "1.3.0") reject();
    const applicationRequirements = plainRecord(manifest.applicationRequirements);
    if (
      applicationRequirements.version !== 1 ||
      !Array.isArray(applicationRequirements.apps) ||
      applicationRequirements.apps.length !== 0
    ) reject();
    const runtimeAdmission = plainRecord(manifest.runtimeAdmission);
    if (runtimeAdmission.version !== 1) reject();
    if (name === TOOLS_CARD_NAME) {
      const declaredServers = closed(runtimeAdmission.servers, ["buzz-tools"]);
      const declaration = closed(declaredServers["buzz-tools"], ["authMode", "requirementIds"]);
      if (declaration.authMode !== "none") reject();
      exactStrings(declaration.requirementIds, REQUIREMENT_IDS);
      if (!Array.isArray(runtimeAdmission.requirements) || runtimeAdmission.requirements.length !== 2) {
        reject();
      }
    } else {
      closed(runtimeAdmission.servers, []);
      exactStrings(runtimeAdmission.requirements, []);
      const tools = closed(manifest.tools, ["allow", "deny"]);
      exactStrings(tools.allow, TOOL_SELECTORS);
      exactStrings(tools.deny, []);
    }
    if (phase === "tools" && name !== TOOLS_CARD_NAME) reject();
  }

  const lockRecord = closed(lock, ["schema", "entrypoint", "cards", "store"]);
  if (lockRecord.schema !== "cl.i268.synthetic-card-lock.v1") reject();
  const first = cards[0]!;
  if (!deepEqual(lockRecord.entrypoint, {
    name: first.name,
    version: first.version,
    kind: phase === "tools" ? "capability" : "blueprint",
  })) reject();
  if (!Array.isArray(lockRecord.cards) || lockRecord.cards.length !== cards.length) reject();
  const allowedUrls = new Map([
    [TOOLS_CARD_NAME, config.lock.git.allowedUrls[0]],
    [WORKER_CARD_NAME, config.lock.git.allowedUrls[1]],
  ]);
  (lockRecord.cards as unknown[]).forEach((entry, index) => {
    const lockCard = closed(entry, [
      "name",
      "version",
      "requested",
      "integrity",
      "treeSha",
      "origin",
      "path",
      "git",
      "skills",
      "hooks",
      "registry",
    ]);
    const summary = cards[index]!;
    for (const field of ["name", "version", "requested", "integrity", "treeSha"] as const) {
      if (lockCard[field] !== summary[field]) reject();
    }
    if (!config.lock.allowedOrigins.includes(lockCard.origin as string)) reject();
    if (lockCard.origin !== "git") reject();
    const path = lockCard.path;
    if (
      typeof path !== "string" ||
      Buffer.byteLength(path) > config.lock.path.maxUtf8Bytes ||
      path.normalize(config.lock.path.normalization as "NFC") !== path ||
      CONTROL_PATTERN.test(path)
    ) reject();
    const git = closed(lockCard.git, ["url", "ref", "commit"]);
    let url: URL;
    try {
      url = new URL(git.url as string);
    } catch {
      return reject();
    }
    if (
      git.url !== allowedUrls.get(summary.name) ||
      url.protocol !== `${config.lock.git.scheme}:` ||
      url.hostname !== config.lock.git.host ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      typeof git.ref !== "string" ||
      git.ref.length === 0 ||
      !GIT_OBJECT_PATTERN.test(git.commit as string) ||
      git.commit !== summary.treeSha ||
      !deepEqual(lockCard.skills, config.lock.cardAuxiliary.skills) ||
      !deepEqual(lockCard.hooks, config.lock.cardAuxiliary.hooks) ||
      lockCard.registry !== config.lock.cardAuxiliary.registry
    ) reject();
  });
  const store = closed(lockRecord.store, ["minDrwnVersion"]);
  if (store.minDrwnVersion !== "1.3.0") reject();
}

function admitDerivationInput(rawBytes: Buffer): AdmittedInput {
  if (rawBytes.byteLength > MAX_DERIVATION_BYTES) reject();
  const config = admitNestedInertRuleConfig();
  const value = parseJsonBytes(rawBytes);
  const input = closed(value, [
    "schema",
    "schemaVersion",
    "phase",
    "candidate",
    "derivationPreimage",
    "context",
  ]);
  if (input.schema !== RUNTIME_ADMISSION_INPUT_SCHEMA || input.schemaVersion !== 1) reject();
  if (input.phase !== "tools" && input.phase !== "root") reject();
  const phase = input.phase as DerivationPhase;

  const candidateEnvelope = closed(input.candidate, ["schema", "identity", "encoding", "bytesBase64"]);
  if (
    candidateEnvelope.schema !== `cl.i268.finch-${phase}-candidate.v1` ||
    candidateEnvelope.encoding !== "base64"
  ) reject();
  const declaredCandidateIdentity = artifactIdentity(candidateEnvelope.identity, phase);
  const candidateBytes = decodeCanonicalBase64(candidateEnvelope.bytesBase64);
  if (
    candidateBytes.byteLength !== declaredCandidateIdentity.byteLength ||
    sha256(candidateBytes) !== declaredCandidateIdentity.sha256
  ) reject();
  const candidate = admitCandidate(parseJsonBytes(candidateBytes), phase);

  const preimage = closed(input.derivationPreimage, ["entrypoint", "cards", "cardLock"]);
  const entrypoint = closed(preimage.entrypoint, ["name", "version", "kind"]);
  if (!deepEqual(entrypoint, candidate.entrypoint)) reject();
  if (
    !Array.isArray(preimage.cards) ||
    preimage.cards.length !== (phase === "tools" ? 1 : 2)
  ) reject();

  const manifestBytes: Buffer[] = [];
  const cards: AdmittedCard[] = (preimage.cards as unknown[]).map((entry, index) => {
    const record = closed(entry, [
      "name",
      "version",
      "requested",
      "integrity",
      "treeSha",
      "manifest",
    ]);
    const bytes = encodedBytes(record.manifest);
    manifestBytes.push(bytes);
    const summary = candidate.cards[index];
    if (
      summary === undefined ||
      record.name !== summary.name ||
      record.version !== summary.version ||
      record.requested !== summary.requested ||
      record.integrity !== summary.integrity ||
      record.treeSha !== summary.treeSha ||
      bytes.byteLength !== summary.manifestIdentity.byteLength ||
      sha256(bytes) !== summary.manifestIdentity.sha256
    ) reject();
    return {
      name: summary.name,
      version: summary.version,
      requested: summary.requested,
      integrity: summary.integrity,
      treeSha: summary.treeSha,
      manifestIdentity: summary.manifestIdentity,
      manifest: plainRecord(parseJsonBytes(bytes)),
    };
  });

  const lockEnvelope = closed(preimage.cardLock, [
    "encoding",
    "bytesBase64",
    "byteLength",
    "sha256",
    "storeMinDrwnVersion",
  ]);
  if (lockEnvelope.storeMinDrwnVersion !== "1.3.0") reject();
  const lockBytes = encodedBytes({
    encoding: lockEnvelope.encoding,
    bytesBase64: lockEnvelope.bytesBase64,
    byteLength: lockEnvelope.byteLength,
    sha256: lockEnvelope.sha256,
  });
  if (
    lockEnvelope.byteLength !== candidate.cardLock.byteLength ||
    lockEnvelope.sha256 !== candidate.cardLock.sha256
  ) reject();
  const decodedTotal = candidateBytes.byteLength + lockBytes.byteLength +
    manifestBytes.reduce((total, bytes) => total + bytes.byteLength, 0);
  if (decodedTotal > MAX_DERIVATION_BYTES) reject();

  const lock = plainRecord(parseJsonBytes(lockBytes));
  applyNestedInertRule(
    config,
    cards.map((entry) => entry.manifest),
    lock,
    phase,
    candidate.cards,
  );

  const context = closed(input.context, ["storeExportIdentity", "phaseEvidence", "noSecretEvidence"]);
  const storeExport = admitStoreExport(context.storeExportIdentity);
  if (!deepEqual(storeExport, candidate.storeExport)) reject();
  const phaseEvidence = admitPhaseEvidence(context.phaseEvidence, phase);
  if (!deepEqual(phaseEvidence, candidate.phaseEvidence)) reject();

  const evidence = closed(context.noSecretEvidence, [
    "schema",
    "result",
    "rule",
    "receiptIdentity",
    "covered",
  ]);
  if (
    evidence.schema !== "cl.i268.complete-derivation-preimage-no-secret.v1" ||
    evidence.result !== "pass"
  ) reject();
  const rule = closed(evidence.rule, ["schema", "schemaVersion", "configSha256"]);
  if (
    rule.schema !== FINCH_NESTED_INERT_RULE_SCHEMA ||
    rule.schemaVersion !== 1 ||
    rule.configSha256 !== FINCH_NESTED_INERT_RULE_SHA256
  ) reject();
  artifactIdentity(evidence.receiptIdentity, phase);
  const covered = closed(evidence.covered, [
    "candidateSha256",
    "manifestSha256s",
    "cardLockSha256",
  ]);
  const manifestSha256s = cards.map((entry) => entry.manifestIdentity.sha256);
  if (
    covered.candidateSha256 !== declaredCandidateIdentity.sha256 ||
    !deepEqual(covered.manifestSha256s, manifestSha256s) ||
    covered.cardLockSha256 !== candidate.cardLock.sha256
  ) reject();

  return {
    phase,
    rawBytes,
    candidateBytes,
    candidateIdentity: declaredCandidateIdentity,
    producerSource: candidate.producerSource,
    workerPackageVersion: candidate.workerPackageVersion,
    workerSourceCommit: candidate.workerSourceCommit,
    entrypoint: candidate.entrypoint,
    cards,
    cardLock: candidate.cardLock,
    storeExport,
    phaseEvidence,
    ruleCoverage: {
      candidateSha256: declaredCandidateIdentity.sha256,
      manifestSha256s,
      cardLockSha256: candidate.cardLock.sha256,
    },
  };
}

interface AdmittedOperands {
  root: string;
  /** The admitted regular input itself; every derivation byte is read from here. */
  inputFd: number;
  outputPath: string;
  outputParent: string;
  /** The parent's identity, captured where its pathname is proven symlink-free. */
  outputParentIdentity: { dev: bigint; ino: bigint };
  outputName: string;
}

/**
 * `O_NOFOLLOW` refuses a final component that became a symlink, and `O_NONBLOCK`
 * refuses to wait on a substituted FIFO instead of blocking forever. Both are POSIX
 * only; on a platform that omits them the pathname admission above is the only
 * available defence and descriptor-bound publication is refused outright anyway.
 */
const INPUT_OPEN_FLAGS = constants.O_RDONLY |
  (constants.O_NOFOLLOW ?? 0) |
  (constants.O_NONBLOCK ?? 0);

function openAdmittedInput(inputPath: string): number {
  let fd: number;
  try {
    fd = openSync(inputPath, INPUT_OPEN_FLAGS);
  } catch {
    return reject();
  }
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.size > BigInt(MAX_DERIVATION_BYTES)) reject();
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return fd;
}

/**
 * Reads the admitted descriptor rather than its name, and refuses at the ceiling
 * instead of admitting an unbounded read into memory first. Reads are positioned so
 * the descriptor's own offset is never load-bearing.
 */
function readAdmittedInput(fd: number): Buffer {
  const buffer = Buffer.alloc(MAX_DERIVATION_BYTES + 1);
  let total = 0;
  for (;;) {
    const read = readSync(fd, buffer, total, buffer.byteLength - total, total);
    if (read === 0) break;
    total += read;
    if (total > MAX_DERIVATION_BYTES) reject();
  }
  return buffer.subarray(0, total);
}

function admitOperand(value: string): string {
  if (
    value.length === 0 ||
    value === "." ||
    value.includes("\\") ||
    value.includes("\0") ||
    LONE_SURROGATE_PATTERN.test(value) ||
    posixPath.isAbsolute(value) ||
    posixPath.normalize(value) !== value ||
    value.split("/").some((part) => part === "" || part === "." || part === "..") ||
    Buffer.byteLength(value, "utf8") > MAX_OPERAND_BYTES
  ) reject();
  return value;
}

function admitOperands(argv: readonly string[], workingDirectory: string): AdmittedOperands {
  if (argv.length !== 4) reject();
  const operands = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== "--input" && flag !== "--output") || value === undefined) reject();
    if (operands.has(flag as string)) reject();
    operands.set(flag as string, admitOperand(value as string));
  }
  const inputOperand = operands.get("--input");
  const outputOperand = operands.get("--output");
  if (inputOperand === undefined || outputOperand === undefined) reject();
  if (inputOperand === outputOperand) reject();

  let root: string;
  try {
    root = realpathSync(workingDirectory);
  } catch {
    return reject();
  }

  const inputPath = join(root, inputOperand);
  let inputReal: string;
  try {
    inputReal = realpathSync(inputPath);
  } catch {
    return reject();
  }
  if (inputReal !== inputPath) reject();
  const inputFd = openAdmittedInput(inputPath);

  try {
    const outputPath = join(root, outputOperand);
    if (inputPath === outputPath) reject();
    let outputExists = true;
    try {
      lstatSync(outputPath);
    } catch {
      outputExists = false;
    }
    // Only a fast diagnostic; the atomic no-replace link is the sole commit authority.
    if (outputExists) reject();

    const outputParent = dirname(outputPath);
    let parentReal: string;
    try {
      parentReal = realpathSync(outputParent);
    } catch {
      return reject();
    }
    // The identity is taken at the instant the pathname is proven symlink-free, and
    // the publication handle is later required to be this same object. Re-deriving
    // the parent from its pathname afterwards would prove nothing: `lstat` follows
    // every intermediate component and `O_NOFOLLOW` guards only the final one, so a
    // later reading traverses any substituted intermediate exactly as the open does.
    const parentStat = lstatSync(outputParent, { bigint: true });
    if (parentReal !== outputParent || !parentStat.isDirectory()) reject();

    return {
      root,
      inputFd,
      outputPath,
      outputParent,
      outputParentIdentity: { dev: parentStat.dev, ino: parentStat.ino },
      outputName: posixPath.basename(outputOperand),
    };
  } catch (error) {
    closeSync(inputFd);
    throw error;
  }
}

function buildOutputValue(
  input: AdmittedInput,
  derived: ReturnType<typeof deriveRuntimeAdmissionForClosure>,
): Record<string, unknown> {
  const envelopeBytes = Buffer.from(derived.canonicalEnvelope, "utf8");
  const applicationBytes = Buffer.from(derived.canonicalApplicationRequirements, "utf8");
  const adapter = readAdapterImplementation();
  const cards = input.cards.map((card) => ({
    name: card.name,
    version: card.version,
    requested: card.requested,
    integrity: card.integrity,
    treeSha: card.treeSha,
    manifestIdentity: card.manifestIdentity,
  }));
  return {
    schema: RUNTIME_ADMISSION_OUTPUT_SCHEMA,
    schemaVersion: 2,
    phase: input.phase,
    producer: "worker",
    producerSource: input.producerSource,
    adapter: {
      ownerIssue: 265,
      entrypoint: RUNTIME_ADMISSION_ADAPTER_ENTRY,
      implementation: adapter.implementation,
      implementationSha256: adapter.implementationSha256,
      commandId: RUNTIME_ADMISSION_DERIVE_COMMAND_ID,
      commandVersion: RUNTIME_ADMISSION_ADAPTER_VERSION,
    },
    candidateIdentity: input.candidateIdentity,
    input: {
      derivationInputIdentity: {
        schema: ARTIFACT_IDENTITY_SCHEMA,
        phase: input.phase,
        byteLength: input.rawBytes.byteLength,
        sha256: sha256(input.rawBytes),
      },
      entrypoint: input.entrypoint,
      cards,
      cardLock: input.cardLock,
      storeExport: input.storeExport,
    },
    output: {
      envelope: {
        encoding: "base64",
        bytesBase64: envelopeBytes.toString("base64"),
        byteLength: envelopeBytes.byteLength,
        sha256: sha256(envelopeBytes),
      },
      applicationRequirements: {
        encoding: "base64",
        bytesBase64: applicationBytes.toString("base64"),
        byteLength: applicationBytes.byteLength,
        sha256: sha256(applicationBytes),
      },
    },
    // Every semantic hash covers a value that output v2 already binds identically for
    // both producers, so producer parity holds by construction rather than by two
    // independent lanes agreeing on an unwritten preimage.
    semantic: {
      derivationVersion: derived.envelope.derivationVersion,
      closureHash: derived.envelope.closureHash,
      activationHash: derived.envelope.activation.activationHash,
      runtimeRequirementsManifestHash: derived.envelope.runtimeRequirements.manifestHash,
      applicationRequirementsHash: sha256(applicationBytes),
      cardsHash: sha256(canonicalizeRuntimeAdmissionJson(cards)),
      cardLockHash: input.cardLock.sha256,
      storeExportHash: input.storeExport.sha256 as string,
    },
    phaseEvidence: input.phaseEvidence,
    security: {
      nestedInertRule: {
        schema: FINCH_NESTED_INERT_RULE_SCHEMA,
        schemaVersion: 1,
        configSha256: FINCH_NESTED_INERT_RULE_SHA256,
        result: "pass",
        covered: input.ruleCoverage,
      },
    },
  };
}

interface PersistenceContext {
  bytes: Buffer;
  identity: SerializedArtifactIdentity;
  operands: AdmittedOperands;
  seams: Record<string, RuntimeAdmissionDeriveSeam>;
  observeDescriptorOps?: (ops: DescriptorOps) => DescriptorOps;
}

function sameEntry(left: DescriptorStat | null, right: DescriptorStat | null): boolean {
  return left !== null && right !== null && left.dev === right.dev && left.ino === right.ino;
}

function persist(context: PersistenceContext): PersistenceOutcome | null {
  const { bytes, identity, operands, seams } = context;
  const seam = (name: string, payload: Record<string, unknown> = {}): void => {
    seams[name]?.({ root: operands.root, ...payload });
  };

  let ops: DescriptorOps;
  try {
    const loaded = loadDescriptorOps();
    ops = context.observeDescriptorOps ? context.observeDescriptorOps(loaded) : loaded;
  } catch {
    return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
  }

  const admitted = ops.statPathNoFollow(operands.outputParent);
  if (admitted === null || !admitted.isDirectory) {
    return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
  }

  let dirfd = -1;
  try {
    seam("parent-open");
    try {
      dirfd = ops.openDirectoryNoFollow(operands.outputParent);
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
    }
    // The opened handle is bound to the identity captured at admission, which is the
    // only reading that predates the whole derivation window. The two readings use the
    // same stat interface, so no ABI or signedness translation sits between them.
    let handle: DescriptorStat;
    let openedIdentity: { dev: bigint; ino: bigint };
    try {
      handle = ops.fstat(dirfd);
      const opened = fstatSync(dirfd, { bigint: true });
      openedIdentity = { dev: opened.dev, ino: opened.ino };
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    }
    if (
      openedIdentity.dev !== operands.outputParentIdentity.dev ||
      openedIdentity.ino !== operands.outputParentIdentity.ino ||
      !sameEntry(handle, admitted) ||
      !handle.isDirectory ||
      !sameEntry(ops.statPathNoFollow(operands.outputParent), admitted)
    ) {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    }

    try {
      seam("preflight-sync");
      ops.fsync(dirfd);
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
    }

    let temporaryName: string;
    try {
      temporaryName = `.drwn-runtime-admission-${randomBytes(12).toString("hex")}.tmp`;
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    }
    let temporary: DescriptorStat | null = null;
    let created = false;

    const proveParent = (): boolean =>
      sameEntry(ops.statPathNoFollow(operands.outputParent), admitted);

    const cleanupBeforeCommit = (
      code: PersistenceOutcomeCode,
    ): PersistenceOutcome => {
      if (!created) return outcome(code);
      try {
        seam("cleanup-identity-proof");
        const observed = ops.fstatatNoFollow(dirfd, temporaryName);
        if (!sameEntry(observed, temporary) || !observed!.isRegular) {
          return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED");
        }
        seam("cleanup-unlink");
        ops.unlinkat(dirfd, temporaryName);
      } catch {
        return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED");
      }
      created = false;
      try {
        seam("cleanup-dir-sync");
        ops.fsync(dirfd);
      } catch {
        return outcome(
          "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE",
        );
      }
      return outcome(code);
    };

    let temporaryFd = -1;
    try {
      if (!proveParent()) return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
      // Both seams sit immediately after the last pathname check and immediately before
      // the descriptor-relative create, which is the exact window the contract names.
      seam("temp-create");
      seam("temp-open");
      // POSIX evaluates permission at open, not at each write, so a descriptor another
      // process obtains during creation stays valid for the inode that becomes the
      // published artifact; no later fchmod can revoke it and no fstat can see it. The
      // umask bounds the mode the create can produce, which is the only reach into
      // that instant. Residual: a umask does not mask setuid or setgid, so a garbage
      // 04000 still creates a setuid file — same-uid, and cleared by the fchmod below.
      const previousMask = process.umask(0o077);
      try {
        temporaryFd = ops.openTemporaryExclusive(dirfd, temporaryName);
      } finally {
        process.umask(previousMask);
      }
      created = true;

      // The variadic mode argument is untrusted on every platform, so the descriptor's
      // mode is established and then proved before a single byte is written.
      ops.fchmod(temporaryFd, 0o600);
      seam("temp-mode", { fd: temporaryFd, ops });
      const opened = ops.fstat(temporaryFd);
      temporary = opened;
      if ((opened.mode & 0o777) !== 0o600 || !opened.isRegular || opened.nlink !== 1) {
        ops.close(temporaryFd);
        temporaryFd = -1;
        return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
      }

      seam("temp-write");
      if (ops.write(temporaryFd, bytes) !== bytes.byteLength) {
        ops.close(temporaryFd);
        temporaryFd = -1;
        return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
      }
      seam("temp-file-sync");
      ops.fsync(temporaryFd);
      seam("temp-close");
      ops.close(temporaryFd);
      temporaryFd = -1;
    } catch {
      if (temporaryFd >= 0) ops.close(temporaryFd);
      return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    }

    let linked = false;
    try {
      seam("pre-link");
      const beforeLink = ops.fstatatNoFollow(dirfd, temporaryName);
      if (!proveParent() || !sameEntry(beforeLink, temporary) || !beforeLink!.isRegular) {
        return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
      }
      seam("link");
      linked = ops.linkat(dirfd, temporaryName, operands.outputName);
      seam("link-after");
    } catch {
      // A raised link is not a verdict; reconciliation below decides the real state.
    }

    // Every return or error is reconciled through descriptor-relative lookup before
    // classification, so a link that committed and then raised is still recognised.
    let finalEntry: DescriptorStat | null = null;
    let temporaryEntry: DescriptorStat | null = null;
    try {
      seam("reconcile-final");
      finalEntry = ops.fstatatNoFollow(dirfd, operands.outputName);
      seam("reconcile-temp");
      temporaryEntry = ops.fstatatNoFollow(dirfd, temporaryName);
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE", identity);
    }

    const ownedFinal = sameEntry(finalEntry, temporary) && finalEntry!.isRegular;
    if (!ownedFinal) {
      if (finalEntry !== null) {
        return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS");
      }
      // Ordinary pre-commit failure is allowed only where the final is proven absent
      // and the temporary is still the owned inode.
      if (sameEntry(temporaryEntry, temporary) && !linked) {
        return cleanupBeforeCommit("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
      }
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE", identity);
    }
    if (!sameEntry(temporaryEntry, temporary)) {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE", identity);
    }

    try {
      seam("post-link-validation");
      const observed = ops.fstatatNoFollow(dirfd, operands.outputName);
      if (!proveParent() || !sameEntry(observed, temporary) || !observed!.isRegular) {
        return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE", identity);
      }
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE", identity);
    }

    try {
      seam("first-dir-sync");
      ops.fsync(dirfd);
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE", identity);
    }

    try {
      seam("cleanup-identity-proof");
      const observed = ops.fstatatNoFollow(dirfd, temporaryName);
      if (!sameEntry(observed, temporary) || !observed!.isRegular) {
        return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED", identity);
      }
      seam("cleanup-unlink");
      ops.unlinkat(dirfd, temporaryName);
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED", identity);
    }
    created = false;

    try {
      seam("second-dir-sync");
      ops.fsync(dirfd);
    } catch {
      return outcome(
        "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE",
        identity,
      );
    }

    try {
      seam("final-validation");
      const observed = ops.fstatatNoFollow(dirfd, operands.outputName);
      if (!proveParent() || !sameEntry(observed, temporary) || !observed!.isRegular) {
        return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED", identity);
      }
    } catch {
      return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED", identity);
    }

    return null;
  } finally {
    // Releasing the handle is the one step that runs after the link and outside every
    // outcome handler. A raise here would discard the return value — a committed
    // outcome included — and report an artifact that exists on disk as not committed,
    // so the release is guarded and the classification already made stands.
    if (dirfd >= 0) {
      try {
        ops.close(dirfd);
      } catch {
        // The outcome is decided; a leaked descriptor cannot change what is on disk.
      }
    }
  }
}

/**
 * Runs the offline adapter. Returns `null` for clean success, which writes exactly
 * one output file and emits no diagnostic; every other result is the closed outcome
 * envelope the accepted process contract requires.
 */
export async function runRuntimeAdmissionDerive(
  options: RuntimeAdmissionDeriveOptions,
): Promise<PersistenceOutcome | null> {
  const seams = options.seams ?? {};
  let operands: AdmittedOperands;
  let input: AdmittedInput;
  let inputFd = -1;
  try {
    operands = admitOperands(options.argv, options.workingDirectory);
    inputFd = operands.inputFd;
    seams["input-read"]?.({ root: operands.root });
    const rawBytes = readAdmittedInput(inputFd);
    input = admitDerivationInput(rawBytes);
    const buildIdentity = await (options.loadBuildIdentity ?? loadPackagedBuildIdentity)();
    // The release identity comes from the running Worker, never from caller-supplied
    // source authority. Both comparisons are against the release the candidate
    // declares: the packaged build's source commit is the commit the released package
    // was built from, which is what `release.workerSourceCommit` names. The adapter's
    // own source identity in `producerSources.worker` is a different referent.
    if (buildIdentity.version !== input.workerPackageVersion) reject();
    if (
      buildIdentity.kind === "packaged" &&
      buildIdentity.sourceCommit !== input.workerSourceCommit
    ) reject();
  } catch {
    return outcome("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
  } finally {
    if (inputFd >= 0) closeSync(inputFd);
  }

  let derived: ReturnType<typeof deriveRuntimeAdmissionForClosure>;
  try {
    seams.derive?.({ root: operands.root });
    const closure: RuntimeAdmissionClosureCard[] = input.cards.map((card) => ({
      name: card.name,
      requested: card.requested,
      version: card.version,
      integrity: card.integrity,
      treeSha: card.treeSha,
      manifest: card.manifest as RuntimeAdmissionClosureCard["manifest"],
    }));
    derived = deriveRuntimeAdmissionForClosure(closure);
  } catch {
    return outcome("WORKER_RUNTIME_ADMISSION_DERIVATION_FAILED");
  }

  let bytes: Buffer;
  try {
    seams.serialize?.({ root: operands.root });
    bytes = Buffer.from(JSON.stringify(buildOutputValue(input, derived)), "utf8");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_DERIVATION_BYTES) {
      throw new Error("serialized output is out of bounds");
    }
  } catch {
    return outcome("WORKER_RUNTIME_ADMISSION_OUTPUT_SERIALIZATION_FAILED");
  }

  // A separate persistence consumer computes the external identity over the final
  // bytes; that tuple is never embedded in output v2.
  const identity: SerializedArtifactIdentity = {
    schema: ARTIFACT_IDENTITY_SCHEMA,
    phase: input.phase,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };

  return persist({
    bytes,
    identity,
    operands,
    seams,
    observeDescriptorOps: options.observeDescriptorOps,
  });
}
