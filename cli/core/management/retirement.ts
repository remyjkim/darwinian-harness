// ABOUTME: Coordinates revisioned Deployed Worker retirement with exact replay and retired readback.
// ABOUTME: Project binding clears only after authoritative retirement proof and before journal completion.

import { randomUUID } from "node:crypto";
import type { ManagementJsonObject } from "./contracts";
import { clearProjectCloudContext } from "./context-store";
import {
  advanceClientOperation,
  createClientOperation,
  findMatchingClientOperation,
  removeCompletedClientOperation,
  type ClientOperationV1,
} from "./operation-journal";
import type { ManagementReadConnection, ManagementReadDependencies } from "./organizations";
import {
  indeterminateManagementResult,
  refusedManagementResult,
  type DrwnManagementResult,
} from "./results";
import { parseRouteRequest, parseRouteSuccess } from "./schemas";
import { executeManagementRequest } from "./transport";

export interface RetirementInput extends ManagementReadConnection {
  projectRoot: string;
  profileDigest: string;
  organizationId: string;
  workerId: string;
  deployedWorkerId: string;
  expectedWorkerRevision: number;
  expectedBindingRevision: number;
}

export interface RetirementDependencies extends ManagementReadDependencies {
  operationId?: () => string;
  readbackRequestId?: () => string;
  journalNow?: () => string;
}

function timestampAfter(current: string | undefined, dependencies: RetirementDependencies): string {
  const candidate = dependencies.journalNow?.() ?? new Date().toISOString();
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return new Date(Date.parse(current) + 1).toISOString();
}

async function advance(
  projectRoot: string,
  journal: ClientOperationV1,
  phase: "sent" | "indeterminate" | "receipt_verified" | "context_committed",
  dependencies: RetirementDependencies,
): Promise<ClientOperationV1> {
  return advanceClientOperation(projectRoot, journal.operationId, phase, timestampAfter(journal.updatedAt, dependencies));
}

function requestBytes(request: ManagementJsonObject): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    deployedWorkerId: request.deployedWorkerId,
    expectedBindingRevision: request.expectedBindingRevision,
    expectedWorkerRevision: request.expectedWorkerRevision,
  }));
}

function invalidResult(operationId: string, observedAt: string): Readonly<DrwnManagementResult> {
  return refusedManagementResult(
    "deployed_workers.retire",
    operationId,
    { code: "SERVER_RESPONSE_INVALID", retryable: false },
    observedAt,
  );
}

export async function retireDeployedWorker(
  input: RetirementInput,
  dependencies: RetirementDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const candidateOperationId = (dependencies.operationId ?? randomUUID)();
  const admitted = parseRouteRequest("deployed_workers.retire", {
    requestId: candidateOperationId,
    deployedWorkerId: input.deployedWorkerId,
    expectedWorkerRevision: input.expectedWorkerRevision,
    expectedBindingRevision: input.expectedBindingRevision,
  });
  const bytes = requestBytes(admitted);
  let journal = await findMatchingClientOperation(input.projectRoot, {
    profileDigest: input.profileDigest,
    routeKey: "deployed_workers.retire",
    requestBytes: bytes,
  });
  if (!journal) {
    journal = await createClientOperation(input.projectRoot, {
      operationId: candidateOperationId,
      profileDigest: input.profileDigest,
      routeKey: "deployed_workers.retire",
      requestBytes: bytes,
      now: timestampAfter(undefined, dependencies),
    });
  }
  if (journal.phase === "prepared") journal = await advance(input.projectRoot, journal, "sent", dependencies);
  const execute = dependencies.execute ?? executeManagementRequest;
  const request = { ...admitted, requestId: journal.operationId };
  const result = await execute({
    routeKey: "deployed_workers.retire",
    request,
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  if (result.outcome === "indeterminate") {
    if (journal.phase === "sent") await advance(input.projectRoot, journal, "indeterminate", dependencies);
    return result;
  }
  if (result.outcome === "refused") return result;
  const receipt = parseRouteSuccess("deployed_workers.retire", result.data, request);
  if (
    receipt.requestId !== journal.operationId ||
    receipt.organizationId !== input.organizationId ||
    receipt.workerId !== input.workerId ||
    receipt.deployedWorkerId !== input.deployedWorkerId ||
    Number(receipt.workerRevision) <= input.expectedWorkerRevision ||
    Number(receipt.bindingRevision) <= input.expectedBindingRevision
  ) return invalidResult(journal.operationId, result.observedAt);
  if (journal.phase === "sent" || journal.phase === "indeterminate") {
    journal = await advance(input.projectRoot, journal, "receipt_verified", dependencies);
  }

  const readbackId = (dependencies.readbackRequestId ?? randomUUID)();
  const detail = await execute({
    routeKey: "deployed_workers.read",
    request: { requestId: readbackId, deployedWorkerId: input.deployedWorkerId },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  if (detail.outcome === "indeterminate") {
    return indeterminateManagementResult("deployed_workers.retire", journal.operationId, detail.observedAt);
  }
  if (detail.outcome === "refused") {
    return refusedManagementResult("deployed_workers.retire", journal.operationId, detail.error!, detail.observedAt);
  }
  const readback = parseRouteSuccess("deployed_workers.read", detail.data);
  const worker = readback.worker as ManagementJsonObject;
  if (
    worker.organizationId !== input.organizationId ||
    worker.workerId !== input.workerId ||
    worker.deployedWorkerId !== input.deployedWorkerId ||
    worker.retired !== true ||
    Number(worker.workerRevision) < Number(receipt.workerRevision) ||
    Number(worker.bindingRevision) < Number(receipt.bindingRevision)
  ) return invalidResult(journal.operationId, detail.observedAt);

  await clearProjectCloudContext(input.projectRoot);
  if (journal.phase === "receipt_verified") journal = await advance(input.projectRoot, journal, "context_committed", dependencies);
  await removeCompletedClientOperation(input.projectRoot, journal.operationId);
  return result;
}
