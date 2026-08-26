// ABOUTME: Builds and uploads target-scoped immutable portable Worker deployment artifacts.
// ABOUTME: Digest-derived UUID identity makes response-loss replay deterministic without a large journal.

import { createHash } from "node:crypto";
import { DrwnError } from "../errors";
import { canonicalWorkerDeployPayloadBytes, type WorkerDeployPayload } from "../worker-deploy";
import { managementContract } from "./contracts";
import type { ManagementReadConnection, ManagementReadDependencies } from "./organizations";
import type { DrwnManagementResult } from "./results";
import { executeManagementRequest } from "./transport";

export interface DeploymentArtifact {
  bytes: Uint8Array;
  payloadBase64: string;
  byteLength: number;
  artifactSha256: string;
  artifactRef: string;
  requestId: string;
}

export interface StageDeploymentArtifactInput extends ManagementReadConnection {
  deployedWorkerId: string;
  payload: WorkerDeployPayload;
}

export type DeploymentArtifactDependencies = ManagementReadDependencies;

function uuidV4FromSha256(sha256: string): string {
  const bytes = Buffer.from(sha256.slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function buildDeploymentArtifact(payload: WorkerDeployPayload): Readonly<DeploymentArtifact> {
  const bytes = canonicalWorkerDeployPayloadBytes(payload);
  if (bytes.byteLength > managementContract.artifactStaging.maxPayloadBytes) {
    throw new DrwnError("DEPLOYMENT_ARTIFACT_TOO_LARGE", "The portable deployment artifact exceeds the supported limit.");
  }
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  return Object.freeze({
    bytes,
    payloadBase64: Buffer.from(bytes).toString("base64"),
    byteLength: bytes.byteLength,
    artifactSha256,
    artifactRef: `${managementContract.artifactStaging.artifactRefPrefix}${artifactSha256}`,
    requestId: uuidV4FromSha256(artifactSha256),
  });
}

export async function stageDeploymentArtifact(
  input: StageDeploymentArtifactInput,
  dependencies: DeploymentArtifactDependencies = {},
): Promise<{ artifact: Readonly<DeploymentArtifact>; result: Readonly<DrwnManagementResult> }> {
  const artifact = buildDeploymentArtifact(input.payload);
  const result = await (dependencies.execute ?? executeManagementRequest)({
    routeKey: "deployment_artifacts.put",
    request: {
      requestId: artifact.requestId,
      deployedWorkerId: input.deployedWorkerId,
      artifactSha256: artifact.artifactSha256,
      byteLength: artifact.byteLength,
      payloadBase64: artifact.payloadBase64,
    },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  return { artifact, result };
}
