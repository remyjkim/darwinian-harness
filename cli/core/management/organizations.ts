// ABOUTME: Implements strict organization discovery, detail verification, and UX selection.
// ABOUTME: Organization context is profile-isolated local convenience and never authorization.

import { randomUUID } from "node:crypto";
import { DrwnError } from "../errors";
import type { KeychainBackend } from "../secret-store";
import type { ManagementJsonObject } from "./contracts";
import { selectMachineOrganization, type MachineCloudContextV1 } from "./context-store";
import { renderManagementResultHuman, type DrwnManagementResult } from "./results";
import { executeManagementRequest, type ManagementTransportDependencies } from "./transport";

export interface ManagementReadConnection {
  credentialsPath: string;
  env: Record<string, string | undefined>;
  keychainBackend?: KeychainBackend;
}

export interface ManagementReadDependencies extends ManagementTransportDependencies {
  execute?: typeof executeManagementRequest;
  requestId?: () => string;
  keychainBackend?: KeychainBackend;
}

export interface OrganizationPageInput extends ManagementReadConnection {
  limit?: number;
  cursor?: string;
}

export interface OrganizationReadInput extends ManagementReadConnection {
  organizationId: string;
}

export interface OrganizationUseInput extends OrganizationReadInput {
  homeDir: string;
  profileDigest: string;
}

function nextRequestId(dependencies: ManagementReadDependencies): string {
  return (dependencies.requestId ?? randomUUID)();
}

export async function listOrganizations(
  input: OrganizationPageInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return (dependencies.execute ?? executeManagementRequest)({
    routeKey: "organizations.list",
    request: {
      requestId: nextRequestId(dependencies),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
}

export async function readOrganization(
  input: OrganizationReadInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  return (dependencies.execute ?? executeManagementRequest)({
    routeKey: "organizations.read",
    request: { requestId: nextRequestId(dependencies), organizationId: input.organizationId },
    credentialsPath: input.credentialsPath,
    env: input.env,
    keychainBackend: input.keychainBackend,
  }, dependencies);
}

export async function useOrganization(
  input: OrganizationUseInput,
  dependencies: ManagementReadDependencies = {},
): Promise<Readonly<DrwnManagementResult>> {
  const result = await readOrganization(input, dependencies);
  if (result.outcome !== "succeeded") return result;
  const organization = result.data?.organization;
  if (!organization || typeof organization !== "object" || Array.isArray(organization)) {
    throw new DrwnError("SERVER_RESPONSE_INVALID", "The management server returned an invalid response.");
  }
  await selectMachineOrganization(
    input.homeDir,
    input.profileDigest,
    String(organization.organizationId),
    result.observedAt,
  );
  return result;
}

export function selectedOrganizationId(context: MachineCloudContextV1 | null, profileDigest: string): string | null {
  const value = context?.selections.find((selection) => selection.profileDigest === profileDigest)?.organizationId;
  return typeof value === "string" ? value : null;
}

export function requireSelectedOrganizationId(context: MachineCloudContextV1 | null, profileDigest: string): string {
  const organizationId = selectedOrganizationId(context, profileDigest);
  if (!organizationId) {
    throw new DrwnError(
      "ORGANIZATION_SELECTION_REQUIRED",
      "Select an organization with `drwn org use <organizationId>`.",
    );
  }
  return organizationId;
}

export function renderOrganizationResultHuman(result: DrwnManagementResult): string {
  if (result.outcome !== "succeeded") return renderManagementResultHuman(result);
  if (result.command === "organizations.read") {
    const organization = result.data!.organization as ManagementJsonObject;
    return [
      `Organization: ${organization.organizationId}`,
      `Name: ${organization.displayName}`,
      `Revision: ${organization.revision}`,
    ].join("\n") + "\n";
  }
  const organizations = result.data!.organizations as ManagementJsonObject[];
  if (organizations.length === 0) return "No organizations visible.\n";
  return [
    "organization_id\tname\trevision",
    ...organizations.map((organization) => [organization.organizationId, organization.displayName, organization.revision].join("\t")),
    ...(result.data!.nextCursor ? [`Next cursor: ${result.data!.nextCursor}`] : []),
  ].join("\n") + "\n";
}

export function renderManagementCommandFailure(error: unknown): string {
  const code = error instanceof DrwnError ? error.code : "MANAGEMENT_COMMAND_FAILED";
  return `${code}: management command failed.\n`;
}
