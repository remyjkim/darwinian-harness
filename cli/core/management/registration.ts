// ABOUTME: Coordinates resumable Deployed Worker registration from one non-secret client operation journal.
// ABOUTME: Replays one request ID and binds project context only after authoritative detail readback.

import { randomUUID } from "node:crypto";
import type { ManagementJsonObject } from "./contracts";
import { loadProjectCloudContext, writeProjectCloudContext } from "./context-store";
import {
  advanceClientOperation,
  createClientOperation,
  findMatchingClientOperation,
  loadClientOperation,
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

export interface RegistrationInput extends ManagementReadConnection {
  projectRoot: string;
  profileDigest: string;
  organizationId: string;
  name: string;
  environment: string;
}

export type RegistrationCheckpoint = "after_response" | "after_context_write" | "before_journal_remove";

export interface RegistrationDependencies extends ManagementReadDependencies {
  operationId?: () => string;
  readbackRequestId?: () => string;
  journalNow?: () => string;
  checkpoint?: (phase: RegistrationCheckpoint) => void | Promise<void>;
}

function timestampAfter(current: string | undefined, dependencies: RegistrationDependencies): string {
  const candidate = dependencies.journalNow?.() ?? new Date().toISOString();
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return new Date(Date.parse(current) + 1).toISOString();
}

function canonicalIntentBytes(intent: {
  organizationId: string;
  name: string;
  environment: string;
}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    environment: intent.environment,
    name: intent.name,
    organizationId: intent.organizationId,
  }));
}

async function advance(
  projectRoot: string,
  journal: ClientOperationV1,
  phase: "sent" | "indeterminate" | "receipt_verified" | "context_committed",
  dependencies: RegistrationDependencies,
): Promise<ClientOperationV1> {
  return advanceClientOperation(
    projectRoot,
    journal.operationId,
    phase,
    timestampAfter(journal.updatedAt, dependencies),
  );
}

function registrationFailure(
  operationId: string,
  observedAt: string,
  code: "SERVER_RESPONSE_INVALID" | "RESOURCE_UNAVAILABLE",
): Readonly<DrwnManagementResult> {
  return refusedManagementResult(
    "deployed_workers.register",
    operationId,
    { code, retryable: false },
    observedAt,
  );
}

function projectContextMatches(
  value: Awaited<ReturnType<typeof loadProjectCloudContext>>,
  input: RegistrationInput,
  deployedWorkerId: string,
): boolean {
  return Boolean(
    value &&
    value.profileDigest === input.profileDigest &&
    value.organizationId === input.organizationId &&
    value.deployedWorkerId === deployedWorkerId,
  );
}

export async function registerDeployedWorker(
  input: RegistrationInput,
  dependencies: RegistrationDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const candidateOperationId = (dependencies.operationId ?? randomUUID)();
  const admitted = parseRouteRequest("deployed_workers.register", {
    requestId: candidateOperationId,
    organizationId: input.organizationId,
    name: input.name,
    environment: input.environment,
  });
  const intent = {
    organizationId: String(admitted.organizationId),
    name: String(admitted.name),
    environment: String(admitted.environment),
  };
  const requestBytes = canonicalIntentBytes(intent);
  let journal = await findMatchingClientOperation(input.projectRoot, {
    profileDigest: input.profileDigest,
    routeKey: "deployed_workers.register",
    requestBytes,
  });
  if (!journal) {
    journal = await createClientOperation(input.projectRoot, {
      operationId: candidateOperationId,
      profileDigest: input.profileDigest,
      routeKey: "deployed_workers.register",
      requestBytes,
      now: timestampAfter(undefined, dependencies),
    });
  }

  if (journal.phase === "prepared") journal = await advance(input.projectRoot, journal, "sent", dependencies);
  const execute = dependencies.execute ?? executeManagementRequest;
  const registration = await execute({
    routeKey: "deployed_workers.register",
    request: { requestId: journal.operationId, ...intent },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  await dependencies.checkpoint?.("after_response");

  if (registration.outcome === "indeterminate") {
    if (journal.phase === "sent") await advance(input.projectRoot, journal, "indeterminate", dependencies);
    return registration;
  }
  if (registration.outcome === "refused") return registration;

  let receipt: ManagementJsonObject;
  try {
    receipt = parseRouteSuccess("deployed_workers.register", registration.data);
  } catch {
    return registrationFailure(journal.operationId, registration.observedAt, "SERVER_RESPONSE_INVALID");
  }
  if (
    receipt.requestId !== journal.operationId ||
    receipt.organizationId !== intent.organizationId ||
    typeof receipt.workerId !== "string" ||
    typeof receipt.deployedWorkerId !== "string"
  ) {
    return registrationFailure(journal.operationId, registration.observedAt, "SERVER_RESPONSE_INVALID");
  }
  const deployedWorkerId = receipt.deployedWorkerId;
  if (journal.phase === "sent" || journal.phase === "indeterminate") {
    journal = await advance(input.projectRoot, journal, "receipt_verified", dependencies);
  }

  const readbackRequestId = (dependencies.readbackRequestId ?? randomUUID)();
  const detail = await execute({
    routeKey: "deployed_workers.read",
    request: { requestId: readbackRequestId, deployedWorkerId: receipt.deployedWorkerId },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
  if (detail.outcome === "indeterminate") {
    return indeterminateManagementResult("deployed_workers.register", journal.operationId, detail.observedAt);
  }
  if (detail.outcome === "refused") {
    return refusedManagementResult("deployed_workers.register", journal.operationId, detail.error!, detail.observedAt);
  }

  let worker: ManagementJsonObject;
  try {
    const parsed = parseRouteSuccess("deployed_workers.read", detail.data);
    worker = parsed.worker as ManagementJsonObject;
  } catch {
    return registrationFailure(journal.operationId, detail.observedAt, "SERVER_RESPONSE_INVALID");
  }
  if (
    worker.organizationId !== intent.organizationId ||
    worker.workerId !== receipt.workerId ||
    worker.deployedWorkerId !== receipt.deployedWorkerId ||
    worker.name !== intent.name ||
    worker.environment !== intent.environment ||
    worker.retired !== false ||
    Number(worker.workerRevision) < Number(receipt.workerRevision) ||
    Number(worker.bindingRevision) < Number(receipt.bindingRevision)
  ) {
    return registrationFailure(journal.operationId, detail.observedAt, "SERVER_RESPONSE_INVALID");
  }

  const existingContext = await loadProjectCloudContext(input.projectRoot);
  if (journal.phase === "context_committed" && !projectContextMatches(existingContext, input, deployedWorkerId)) {
    return registrationFailure(journal.operationId, detail.observedAt, "SERVER_RESPONSE_INVALID");
  }
  await writeProjectCloudContext(input.projectRoot, {
    schema: "drwn.project-cloud-context",
    schemaVersion: 1,
    profileDigest: input.profileDigest,
    organizationId: input.organizationId,
    deployedWorkerId,
    verifiedAt: detail.observedAt,
  });
  await dependencies.checkpoint?.("after_context_write");
  if (journal.phase === "receipt_verified") {
    journal = await advance(input.projectRoot, journal, "context_committed", dependencies);
  }
  await dependencies.checkpoint?.("before_journal_remove");
  await removeCompletedClientOperation(input.projectRoot, journal.operationId);
  return registration;
}

export function renderRegistrationResultHuman(result: DrwnManagementResult): string {
  if (result.outcome !== "succeeded") {
    return `${result.error!.code}: ${result.outcome}.\nRequest: ${result.requestId}\n`;
  }
  return [
    `Organization: ${result.data!.organizationId}`,
    `Worker ID: ${result.data!.workerId}`,
    `Deployed Worker: ${result.data!.deployedWorkerId}`,
    `Worker revision: ${result.data!.workerRevision}`,
    `Binding revision: ${result.data!.bindingRevision}`,
  ].join("\n") + "\n";
}
