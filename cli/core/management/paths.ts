// ABOUTME: Resolves the isolated machine/project cloud context and operation-journal paths.
// ABOUTME: Validates operation identities before they become filesystem names.

import { join } from "node:path";
import { DrwnError } from "../errors";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function resolveMachineCloudContextPath(homeDir: string): string {
  return join(homeDir, ".agents", "drwn", "cloud-context.json");
}

export function resolveMachineCloudLockPath(homeDir: string): string {
  return join(homeDir, ".agents", "drwn", ".cloud-state.lock");
}

export function resolveProjectCloudContextPath(projectRoot: string): string {
  return join(projectRoot, ".agents", "drwn", "cloud.local.json");
}

export function resolveProjectCloudLockPath(projectRoot: string): string {
  return join(projectRoot, ".agents", "drwn", ".cloud-state.lock");
}

export function resolveCloudOperationsDir(projectRoot: string): string {
  return join(projectRoot, ".agents", "drwn", ".cloud-operations");
}

export function resolveClientOperationPath(projectRoot: string, operationId: string): string {
  if (!UUID_V4.test(operationId)) {
    throw new DrwnError("CLIENT_OPERATION_INVALID", "Client operation ID must be a canonical UUIDv4.");
  }
  return join(resolveCloudOperationsDir(projectRoot), `${operationId}.json`);
}
