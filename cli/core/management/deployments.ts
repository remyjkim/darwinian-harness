// ABOUTME: Implements deployment create, history, and explicit rollback through small resumable journals.
// ABOUTME: Deployment artifact bytes remain outside local operation state and aggregate mutation requests.

import { randomUUID } from "node:crypto";
import type { ManagementJsonObject } from "./contracts";
import {
  advanceClientOperation,
  createClientOperation,
  findMatchingClientOperation,
  removeCompletedClientOperation,
  type ClientOperationV1,
} from "./operation-journal";
import type { ManagementReadConnection, ManagementReadDependencies } from "./organizations";
import { refusedManagementResult, renderManagementResultHuman, type DrwnManagementResult } from "./results";
import { parseRouteRequest, parseRouteSuccess } from "./schemas";
import { executeManagementRequest } from "./transport";

type DeploymentMutationRoute = "deployments.create" | "deployments.rollback";
export type DeploymentCheckpoint = "after_response" | "before_journal_remove";

export interface DeploymentDependencies extends ManagementReadDependencies {
  operationId?: () => string;
  journalNow?: () => string;
  checkpoint?: (phase: DeploymentCheckpoint) => void | Promise<void>;
}

export interface CreateDeploymentInput extends ManagementReadConnection {
  projectRoot: string;
  profileDigest: string;
  deployedWorkerId: string;
  artifactRef: string;
  expectedWorkerRevision: number;
}

export interface ListDeploymentsInput extends ManagementReadConnection {
  deployedWorkerId: string;
  limit?: number;
  cursor?: string;
}

export interface RollbackDeploymentInput extends ManagementReadConnection {
  projectRoot: string;
  profileDigest: string;
  deployedWorkerId: string;
  deploymentId: string;
  expectedWorkerRevision: number;
}

function timestampAfter(current: string | undefined, dependencies: DeploymentDependencies): string {
  const candidate = dependencies.journalNow?.() ?? new Date().toISOString();
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return new Date(Date.parse(current) + 1).toISOString();
}

function canonicalMutationBytes(routeKey: DeploymentMutationRoute, request: ManagementJsonObject): Uint8Array {
  const value = routeKey === "deployments.create"
    ? {
        artifactRef: request.artifactRef,
        deployedWorkerId: request.deployedWorkerId,
        expectedWorkerRevision: request.expectedWorkerRevision,
      }
    : {
        deployedWorkerId: request.deployedWorkerId,
        deploymentId: request.deploymentId,
        expectedWorkerRevision: request.expectedWorkerRevision,
      };
  return new TextEncoder().encode(JSON.stringify(value));
}

async function advance(
  projectRoot: string,
  journal: ClientOperationV1,
  phase: "sent" | "indeterminate" | "receipt_verified" | "context_committed",
  dependencies: DeploymentDependencies,
): Promise<ClientOperationV1> {
  return advanceClientOperation(
    projectRoot,
    journal.operationId,
    phase,
    timestampAfter(journal.updatedAt, dependencies),
  );
}

async function executeDeploymentMutation(
  routeKey: DeploymentMutationRoute,
  input: CreateDeploymentInput | RollbackDeploymentInput,
  requestWithoutId: ManagementJsonObject,
  dependencies: DeploymentDependencies,
): Promise<Readonly<DrwnManagementResult>> {
  const candidateOperationId = (dependencies.operationId ?? randomUUID)();
  const admitted = parseRouteRequest(routeKey, { requestId: candidateOperationId, ...requestWithoutId });
  const requestBytes = canonicalMutationBytes(routeKey, admitted);
  let journal = await findMatchingClientOperation(input.projectRoot, {
    profileDigest: input.profileDigest,
    routeKey,
    requestBytes,
  });
  if (!journal) {
    journal = await createClientOperation(input.projectRoot, {
      operationId: candidateOperationId,
      profileDigest: input.profileDigest,
      routeKey,
      requestBytes,
      now: timestampAfter(undefined, dependencies),
    });
  }
  if (journal.phase === "prepared") journal = await advance(input.projectRoot, journal, "sent", dependencies);

  const request = { ...admitted, requestId: journal.operationId };
  const result = await (dependencies.execute ?? executeManagementRequest)({
    routeKey,
    request,
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  await dependencies.checkpoint?.("after_response");
  if (result.outcome === "indeterminate") {
    if (journal.phase === "sent") await advance(input.projectRoot, journal, "indeterminate", dependencies);
    return result;
  }
  if (result.outcome === "refused") return result;

  const receipt = parseRouteSuccess(routeKey, result.data, request);
  if (
    receipt.requestId !== journal.operationId ||
    receipt.deployedWorkerId !== admitted.deployedWorkerId ||
    Number(receipt.workerRevision) <= Number(admitted.expectedWorkerRevision) ||
    (routeKey === "deployments.rollback" && receipt.deploymentId !== admitted.deploymentId)
  ) {
    return refusedManagementResult(
      routeKey,
      journal.operationId,
      { code: "SERVER_RESPONSE_INVALID", retryable: false },
      result.observedAt,
    );
  }
  if (journal.phase === "sent" || journal.phase === "indeterminate") {
    journal = await advance(input.projectRoot, journal, "receipt_verified", dependencies);
  }
  if (journal.phase === "receipt_verified") {
    journal = await advance(input.projectRoot, journal, "context_committed", dependencies);
  }
  await dependencies.checkpoint?.("before_journal_remove");
  await removeCompletedClientOperation(input.projectRoot, journal.operationId);
  return result;
}

export async function createDeployment(
  input: CreateDeploymentInput,
  dependencies: DeploymentDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return executeDeploymentMutation("deployments.create", input, {
    deployedWorkerId: input.deployedWorkerId,
    artifactRef: input.artifactRef,
    expectedWorkerRevision: input.expectedWorkerRevision,
  }, dependencies);
}

export async function listDeployments(
  input: ListDeploymentsInput,
  dependencies: DeploymentDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return (dependencies.execute ?? executeManagementRequest)({
    routeKey: "deployments.list",
    request: {
      requestId: (dependencies.requestId ?? randomUUID)(),
      deployedWorkerId: input.deployedWorkerId,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
}

export async function rollbackDeployment(
  input: RollbackDeploymentInput,
  dependencies: DeploymentDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return executeDeploymentMutation("deployments.rollback", input, {
    deployedWorkerId: input.deployedWorkerId,
    deploymentId: input.deploymentId,
    expectedWorkerRevision: input.expectedWorkerRevision,
  }, dependencies);
}

export function renderDeploymentResultHuman(result: DrwnManagementResult): string {
  if (result.outcome !== "succeeded") return renderManagementResultHuman(result);
  if (result.command === "deployments.list") {
    const deployments = result.data!.deployments as ManagementJsonObject[];
    if (deployments.length === 0) return "No deployment attempts.\n";
    return [
      "deployment_id\tstatus\tartifact_ref\tcreated",
      ...deployments.map((deployment) => [
        deployment.deploymentId,
        deployment.status,
        deployment.artifactRef,
        deployment.createdAt,
      ].join("\t")),
      ...(result.data!.nextCursor ? [`Next cursor: ${result.data!.nextCursor}`] : []),
    ].join("\n") + "\n";
  }
  return [
    `Deployed Worker: ${result.data!.deployedWorkerId}`,
    `Deployment: ${result.data!.deploymentId}`,
    `Worker revision: ${result.data!.workerRevision}`,
    result.command === "deployments.create"
      ? `Created: ${result.data!.createdAt}`
      : `Activated: ${result.data!.activatedAt}`,
  ].join("\n") + "\n";
}
