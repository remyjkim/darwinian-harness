// ABOUTME: Resolves one Deployed Worker target from explicit intent or verified project context.
// ABOUTME: Never infers authority from names, slugs, list cardinality, recency, or local Worker roots.

import { DrwnError } from "../errors";
import { compileManagementSchemaFragment, managementContract } from "./contracts";
import type { ProjectCloudContextV1 } from "./context-store";

const deployedWorkerIdSchema = compileManagementSchemaFragment(managementContract.idKinds.DeployedWorkerId);

export type DeployedWorkerSelector = Readonly<{
  source: "explicit" | "project";
  deployedWorkerId: string;
}>;

function validateId(value: unknown): string {
  const parsed = deployedWorkerIdSchema.safeParse(value);
  if (!parsed.success || typeof parsed.data !== "string") {
    throw new DrwnError("VALIDATION_FAILED", "Deployed Worker ID is malformed or uses another identifier kind.");
  }
  return parsed.data;
}

export function resolveDeployedWorkerSelector(input: {
  explicitId?: string;
  projectContext: ProjectCloudContextV1 | null;
  profileDigest: string;
  organizationId: string;
}): DeployedWorkerSelector {
  if (input.explicitId !== undefined) {
    return Object.freeze({ source: "explicit", deployedWorkerId: validateId(input.explicitId) });
  }
  if (
    input.projectContext &&
    input.projectContext.profileDigest === input.profileDigest &&
    input.projectContext.organizationId === input.organizationId
  ) {
    return Object.freeze({
      source: "project",
      deployedWorkerId: validateId(input.projectContext.deployedWorkerId),
    });
  }
  throw new DrwnError(
    "DEPLOYED_WORKER_TARGET_REQUIRED",
    "Select an explicit Deployed Worker ID with `drwn worker use` before this operation.",
  );
}
