// ABOUTME: Sends one Deployed Worker secret as request-only bytes and returns metadata only.
// ABOUTME: No secret value, derived fingerprint, journal entry, or reflected server detail is retained.

import { randomUUID } from "node:crypto";
import type { ManagementReadConnection, ManagementReadDependencies } from "./organizations";
import type { DrwnManagementResult } from "./results";
import { parseRouteRequest } from "./schemas";
import { executeManagementRequest } from "./transport";

export interface SetSecretInput extends ManagementReadConnection {
  deployedWorkerId: string;
  name: string;
  value: string;
  expectedWorkerRevision: number;
}

export async function setDeployedWorkerSecret(
  input: SetSecretInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const request = parseRouteRequest("secrets.set", {
    requestId: (dependencies.requestId ?? randomUUID)(),
    deployedWorkerId: input.deployedWorkerId,
    name: input.name,
    value: input.value,
    expectedWorkerRevision: input.expectedWorkerRevision,
  });
  return (dependencies.execute ?? executeManagementRequest)({
    routeKey: "secrets.set",
    request,
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
}
