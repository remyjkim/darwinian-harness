// ABOUTME: Implements Deployed Worker collection, detail, and verified project binding operations.
// ABOUTME: Slugs and names are display-only; all authority and context use distinct typed IDs.

import { randomUUID } from "node:crypto";
import { DrwnError } from "../errors";
import type { ManagementJsonObject } from "./contracts";
import { clearMachineOrganization, loadMachineCloudContext, writeProjectCloudContext } from "./context-store";
import {
  requireSelectedOrganizationId,
  type ManagementReadConnection,
  type ManagementReadDependencies,
} from "./organizations";
import { refusedManagementResult, renderManagementResultHuman, type DrwnManagementResult } from "./results";
import { executeManagementRequest } from "./transport";

export interface WorkerPageInput extends ManagementReadConnection {
  organizationId: string;
  environment?: string;
  limit?: number;
  cursor?: string;
}

export interface WorkerReadInput extends ManagementReadConnection {
  organizationId: string;
  deployedWorkerId: string;
}

export interface SelectedWorkerPageInput extends Omit<WorkerPageInput, "organizationId"> {
  homeDir: string;
  profileDigest: string;
}

export interface WorkerUseInput extends Omit<WorkerReadInput, "organizationId"> {
  homeDir: string;
  projectRoot: string;
  profileDigest: string;
}

function nextRequestId(dependencies: ManagementReadDependencies): string {
  return (dependencies.requestId ?? randomUUID)();
}

export async function listDeployedWorkers(
  input: WorkerPageInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return (dependencies.execute ?? executeManagementRequest)({
    routeKey: "deployed_workers.list",
    request: {
      requestId: nextRequestId(dependencies),
      organizationId: input.organizationId,
      ...(input.environment === undefined ? {} : { environment: input.environment }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
}

export async function readDeployedWorker(
  input: WorkerReadInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const result = await (dependencies.execute ?? executeManagementRequest)({
    routeKey: "deployed_workers.read",
    request: { requestId: nextRequestId(dependencies), deployedWorkerId: input.deployedWorkerId },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  if (result.outcome !== "succeeded") return result;
  const worker = result.data?.worker;
  if (!worker || typeof worker !== "object" || Array.isArray(worker)) {
    throw new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
  }
  if (worker.organizationId !== input.organizationId) {
    return refusedManagementResult(
      "deployed_workers.read",
      result.requestId,
      { code: "RESOURCE_UNAVAILABLE", retryable: false },
      result.observedAt,
    );
  }
  return result;
}

export async function listSelectedOrganizationWorkers(
  input: SelectedWorkerPageInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const context = await loadMachineCloudContext(input.homeDir);
  const organizationId = requireSelectedOrganizationId(context, input.profileDigest);
  const result = await listDeployedWorkers({ ...input, organizationId }, dependencies);
  if (result.outcome === "refused" && result.error?.code === "RESOURCE_UNAVAILABLE") {
    await clearMachineOrganization(input.homeDir, input.profileDigest);
  }
  return result;
}

export async function useDeployedWorker(
  input: WorkerUseInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const context = await loadMachineCloudContext(input.homeDir);
  const organizationId = requireSelectedOrganizationId(context, input.profileDigest);
  const result = await readDeployedWorker({ ...input, organizationId }, dependencies);
  if (result.outcome !== "succeeded") return result;
  const worker = result.data!.worker as ManagementJsonObject;
  await writeProjectCloudContext(input.projectRoot, {
    schema: "drwn.project-cloud-context",
    schemaVersion: 1,
    profileDigest: input.profileDigest,
    organizationId,
    deployedWorkerId: String(worker.deployedWorkerId),
    verifiedAt: result.observedAt,
  });
  return result;
}

export function renderWorkerResultHuman(result: DrwnManagementResult): string {
  if (result.outcome !== "succeeded") return renderManagementResultHuman(result);
  if (result.command === "deployed_workers.read") {
    const worker = result.data!.worker as ManagementJsonObject;
    return [
      `Deployed Worker: ${worker.deployedWorkerId}`,
      `Worker ID: ${worker.workerId}`,
      `Organization: ${worker.organizationId}`,
      `Name: ${worker.name}`,
      `Environment: ${worker.environment}`,
      `Worker revision: ${worker.workerRevision}`,
      `Binding revision: ${worker.bindingRevision}`,
      `Retired: ${worker.retired}`,
    ].join("\n") + "\n";
  }
  const workers = result.data!.workers as ManagementJsonObject[];
  if (workers.length === 0) return "No deployed Workers visible.\n";
  return [
    "deployed_worker_id\tname\tenvironment\tworker_revision\tbinding_revision\tretired",
    ...workers.map((worker) => [
      worker.deployedWorkerId,
      worker.name,
      worker.environment,
      worker.workerRevision,
      worker.bindingRevision,
      worker.retired,
    ].join("\t")),
    ...(result.data!.nextCursor ? [`Next cursor: ${result.data!.nextCursor}`] : []),
  ].join("\n") + "\n";
}
