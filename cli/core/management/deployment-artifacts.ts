// ABOUTME: Builds and uploads target-scoped immutable portable Worker deployment artifacts.
// ABOUTME: Digest-derived UUID identity makes response-loss replay deterministic without a large journal.

import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerDeployPayload } from "../worker-deploy";
import { DrwnError } from "../errors";
import { managementContract } from "./contracts";
import {
  buildDeterministicDeploymentBundle,
  type DeterministicDeploymentBundle,
} from "./deployment-bundle";
import type { ManagementReadConnection, ManagementReadDependencies } from "./organizations";
import type { DrwnManagementResult } from "./results";
import { executeManagementRequest } from "./transport";

export type DeploymentArtifact = DeterministicDeploymentBundle;

export interface StageDeploymentArtifactInput extends ManagementReadConnection {
  deployedWorkerId: string;
  payload: WorkerDeployPayload;
}

export type DeploymentArtifactDependencies = ManagementReadDependencies;

export function buildDeploymentArtifact(payload: WorkerDeployPayload): Readonly<DeploymentArtifact> {
  return buildDeterministicDeploymentBundle(payload);
}

async function openVerifiedBundleStream(path: string, artifact: Readonly<DeploymentArtifact>): Promise<Blob> {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o600 || before.size !== artifact.byteLength) {
      throw new Error("unsafe spool");
    }
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      createHash("sha256").update(bytes).digest("hex") !== artifact.artifactSha256
    ) throw new Error("changed spool");
    return Bun.file(path);
  } catch {
    throw new DrwnError("DEPLOYMENT_ARTIFACT_INVALID", "The deployment artifact spool is unavailable or changed.");
  }
}

export async function stageDeploymentArtifact(
  input: StageDeploymentArtifactInput,
  dependencies: DeploymentArtifactDependencies = {},
): Promise<{ artifact: Readonly<DeploymentArtifact>; result: Readonly<DrwnManagementResult> }> {
  const artifact = buildDeploymentArtifact(input.payload);
  const spoolRoot = await mkdtemp(join(tmpdir(), "drwn-deployment-bundle-"));
  const spoolPath = join(spoolRoot, "bundle.tar");
  try {
    await chmod(spoolRoot, 0o700);
    await writeFile(spoolPath, artifact.bytes, { flag: "wx", mode: 0o600 });
    const result = await (dependencies.execute ?? executeManagementRequest)({
      routeKey: "deployment_artifacts.put",
      request: {
        requestId: artifact.requestId,
        deployedWorkerId: input.deployedWorkerId,
        artifactSha256: artifact.artifactSha256,
        byteLength: artifact.byteLength,
      },
      rawBody: {
        mediaType: managementContract.rawBodyContracts.DeterministicWorkerDeployBundleV1.mediaType,
        byteLength: artifact.byteLength,
        createBody: () => openVerifiedBundleStream(spoolPath, artifact),
      },
      credentialsPath: input.credentialsPath,
      env: input.env,
      keychainBackend: input.keychainBackend,
    }, dependencies);
    return { artifact, result };
  } finally {
    await rm(spoolRoot, { recursive: true, force: true });
  }
}
