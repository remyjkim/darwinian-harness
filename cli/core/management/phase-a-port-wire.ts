// ABOUTME: Admits the exact merged I321 D52 loopback wire and public projector bytes.
// ABOUTME: Worker consumes owner validators and constants without reauthoring transport semantics.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const lockSchema = z.object({
  schema: z.literal("dah.cli-management-phase-a-port-wire-contract-lock"),
  schemaVersion: z.literal(1),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: z.literal("d0156761c19f4e7dc5a63914a1117f298b535c37"),
  contractSha256: z.literal("4a62e76ebf5f4d8ffc5f5891a0939165e1aa7bb22ad3916aff5f3ced32cbce7a"),
  projectorSha256: z.literal("157eb03e7dde2ef6f816781e173a415373657382757bfdb568dc0dab9df5622a"),
  manifestSha256: z.literal("90bc380b54f277bc5179a6060609b99e76024e97b4bd871bab615e59332b0378"),
  readmeSha256: z.literal("855ea78eb51ae7bc2d6d63a86a9e1b28c1d05f6a05ecca72c8ed0815c3283bc8"),
  vectorCount: z.literal(67),
  positiveVectorCount: z.literal(17),
  hostileVectorCount: z.literal(50),
}).strict();

const manifestSchema = z.object({
  schema: z.literal("cl.dah.cli-management-phase-a-port-wire-artifact-manifest.v1"),
  schemaVersion: z.literal(1),
  sourceAuthority: z.literal("containing_git_commit"),
  contractFile: z.literal("contract.json"),
  contractSha256: sha256Schema,
  contractBytes: z.number().int().positive(),
  projectorFile: z.literal("projector.mjs"),
  projectorSha256: sha256Schema,
  projectorBytes: z.number().int().positive(),
  localOperationCount: z.literal(2),
  remoteOperationCallCount: z.literal(12),
  cleanupStateCount: z.literal(5),
  vectorCount: z.literal(67),
  positiveVectorCount: z.literal(17),
  hostileVectorCount: z.literal(50),
  qualificationIdentityContractSha256: z.literal("1dbde33ab10d12f31ee9581984cb37c88a9363da2af1518402e62546f582b0b6"),
  qualificationIdentityManifestSha256: z.literal("d5ba47199320b282e2938f80e56ccb55fc9618d57e27114fbc219bea2094a995"),
  qualificationIdentityVectorsSha256: z.literal("dc4580b5cddc8d5a493c14e29f6211cb7c2389fc5e658a963683c3a24ac3f4be"),
  approvalNoticeArtifactSha256: z.literal("40755caf06cc7c61bf302768eb20e8f41254d47868ee3515f4beee5af2afa8c7"),
}).strict();

const contractSchema = z.object({
  schema: z.literal("cl.dah.cli-management-phase-a-port-wire.v1"),
  schemaVersion: z.literal(1),
  transport: z.object({
    method: z.literal("POST"),
    executePath: z.literal("/v1/phase-a/execute"),
    cleanupPath: z.literal("/v1/phase-a/cleanup"),
    executeTimeoutMs: z.literal(15_000),
    cleanupTimeoutMs: z.literal(5_000),
    maxResponseBytes: z.literal(65_536),
  }).passthrough(),
  localOperationOrder: z.array(z.unknown()).length(2),
  remoteOperationOrder: z.array(z.unknown()).length(12),
  cleanupStateMachine: z.object({
    states: z.array(z.string()).length(5),
  }).passthrough(),
  vectors: z.array(z.unknown()).length(67),
}).passthrough();

export interface I321PhaseAPortWireProjector {
  I321_PHASE_A_BINDINGS_V1: readonly unknown[];
  I321_PHASE_A_CLEANUP_STATES_V1: readonly string[];
  I321_PHASE_A_CLEANUP_TRANSITIONS_V1: Readonly<Record<string, readonly string[]>>;
  I321_PHASE_A_ENTRYPOINT_METHODS_V1: readonly string[];
  I321_PHASE_A_LOCAL_OPERATION_ORDER_V1: readonly unknown[];
  I321_PHASE_A_PORT_CLEANUP_PATH_V1: "/v1/phase-a/cleanup";
  I321_PHASE_A_PORT_CLEANUP_TIMEOUT_MS_V1: 5000;
  I321_PHASE_A_PORT_EXECUTE_PATH_V1: "/v1/phase-a/execute";
  I321_PHASE_A_PORT_EXECUTE_REQUIRED_HEADERS_V1: readonly string[];
  I321_PHASE_A_PORT_EXECUTE_TIMEOUT_MS_V1: 15000;
  I321_PHASE_A_PORT_FAIL_SAFE_CLEANUP_REQUIRED_HEADERS_V1: readonly string[];
  I321_PHASE_A_PORT_MAX_AUTHORIZATION_HEADER_BYTES_V1: 16384;
  I321_PHASE_A_PORT_MAX_RESPONSE_BYTES_V1: 65536;
  I321_PHASE_A_PORT_METHOD_V1: "POST";
  I321_PHASE_A_PORT_NORMAL_CLEANUP_REQUIRED_HEADERS_V1: readonly string[];
  I321_PHASE_A_REMOTE_CALL_ORDER_V1: readonly unknown[];
  parseI321PhaseAAggregateRequestV1(value: unknown): Record<string, unknown>;
  parseI321PhaseACleanupRpcRequestV1(value: unknown): Record<string, unknown>;
  parseI321PhaseAPortCleanupRequestV1(value: unknown): Record<string, unknown>;
  parseI321PhaseAPortCleanupResponseV1(value: unknown): Record<string, unknown>;
  parseI321PhaseAPortExecuteRequestV1(value: unknown): Record<string, unknown>;
  parseI321PhaseAPortExecuteResponseV1(value: unknown): Record<string, unknown>;
  parseI321PhaseARemoteInvocationV1(value: unknown): Record<string, unknown>;
  projectI321PhaseAPublicReceiptsV1(value: unknown): Promise<Record<string, unknown>>;
}

export interface I321PhaseAPortWireAuthority {
  contract: z.infer<typeof contractSchema>;
  projector: I321PhaseAPortWireProjector;
}

const projectorExports = [
  "I321_PHASE_A_BINDINGS_V1",
  "I321_PHASE_A_CLEANUP_STATES_V1",
  "I321_PHASE_A_CLEANUP_TRANSITIONS_V1",
  "I321_PHASE_A_ENTRYPOINT_METHODS_V1",
  "I321_PHASE_A_LOCAL_OPERATION_ORDER_V1",
  "I321_PHASE_A_PORT_CLEANUP_PATH_V1",
  "I321_PHASE_A_PORT_CLEANUP_TIMEOUT_MS_V1",
  "I321_PHASE_A_PORT_EXECUTE_PATH_V1",
  "I321_PHASE_A_PORT_EXECUTE_REQUIRED_HEADERS_V1",
  "I321_PHASE_A_PORT_EXECUTE_TIMEOUT_MS_V1",
  "I321_PHASE_A_PORT_FAIL_SAFE_CLEANUP_REQUIRED_HEADERS_V1",
  "I321_PHASE_A_PORT_MAX_AUTHORIZATION_HEADER_BYTES_V1",
  "I321_PHASE_A_PORT_MAX_RESPONSE_BYTES_V1",
  "I321_PHASE_A_PORT_METHOD_V1",
  "I321_PHASE_A_PORT_NORMAL_CLEANUP_REQUIRED_HEADERS_V1",
  "I321_PHASE_A_REMOTE_CALL_ORDER_V1",
  "parseI321PhaseAAggregateRequestV1",
  "parseI321PhaseACleanupRpcRequestV1",
  "parseI321PhaseAPortCleanupRequestV1",
  "parseI321PhaseAPortCleanupResponseV1",
  "parseI321PhaseAPortExecuteRequestV1",
  "parseI321PhaseAPortExecuteResponseV1",
  "parseI321PhaseARemoteInvocationV1",
  "projectI321PhaseAPublicReceiptsV1",
] as const;

function refusal(): never {
  throw new DrwnError(
    "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    "Staging Community qualification refused.",
  );
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}

let authorityPromise: Promise<I321PhaseAPortWireAuthority> | undefined;

export async function loadI321PhaseAPortWireAuthority(): Promise<I321PhaseAPortWireAuthority> {
  return authorityPromise ??= (async () => {
    try {
      const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
      const authorityRoot = join(
        packageRoot,
        "registry",
        "contracts",
        "cli-management-phase-a-port-wire.v1",
      );
      const lock = lockSchema.parse(JSON.parse(readFileSync(
        join(packageRoot, "cli", "generated", "dah-cli-management-phase-a-port-wire-lock.json"),
        "utf8",
      )));
      const contractBytes = readFileSync(join(authorityRoot, "contract.json"));
      const projectorBytes = readFileSync(join(authorityRoot, "projector.mjs"));
      const manifestBytes = readFileSync(join(authorityRoot, "manifest.json"));
      const readmeBytes = readFileSync(join(authorityRoot, "README.md"));
      if (
        sha256(contractBytes) !== lock.contractSha256 ||
        sha256(projectorBytes) !== lock.projectorSha256 ||
        sha256(manifestBytes) !== lock.manifestSha256 ||
        sha256(readmeBytes) !== lock.readmeSha256
      ) refusal();

      const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
      if (
        manifest.contractSha256 !== lock.contractSha256 ||
        manifest.projectorSha256 !== lock.projectorSha256 ||
        manifest.contractBytes !== contractBytes.byteLength ||
        manifest.projectorBytes !== projectorBytes.byteLength ||
        manifest.vectorCount !== lock.vectorCount ||
        manifest.positiveVectorCount !== lock.positiveVectorCount ||
        manifest.hostileVectorCount !== lock.hostileVectorCount
      ) refusal();

      const contract = deepFreeze(contractSchema.parse(
        JSON.parse(contractBytes.toString("utf8")),
      ));
      const projector = await import(pathToFileURL(join(authorityRoot, "projector.mjs")).href);
      if (
        Object.keys(projector).sort().join("\0") !==
        [...projectorExports].sort().join("\0")
      ) refusal();

      return Object.freeze({
        contract,
        projector: projector as I321PhaseAPortWireProjector,
      });
    } catch (error) {
      if (error instanceof DrwnError) throw error;
      refusal();
    }
  })();
}
