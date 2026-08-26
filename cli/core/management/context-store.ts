// ABOUTME: Persists non-secret machine organization and project Deployed Worker selections.
// ABOUTME: State is strict, profile-isolated, owner-locked, and never treated as authorization.

import { z } from "zod";
import { DrwnError } from "../errors";
import { withOwnerLock } from "../owner-lock";
import { preparePrivateFilePath, readPrivateFile, removePrivateFile, writePrivateFile } from "../private-file";
import { compileManagementSchemaFragment, managementContract } from "./contracts";
import {
  resolveMachineCloudContextPath,
  resolveMachineCloudLockPath,
  resolveProjectCloudContextPath,
  resolveProjectCloudLockPath,
} from "./paths";

const profileDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
});
const organizationIdSchema = compileManagementSchemaFragment(managementContract.idKinds.OrganizationId);
const deployedWorkerIdSchema = compileManagementSchemaFragment(managementContract.idKinds.DeployedWorkerId);

const selectionSchema = z.object({
  profileDigest: profileDigestSchema,
  organizationId: organizationIdSchema,
  updatedAt: timestampSchema,
}).strict();

const machineContextSchema = z.object({
  schema: z.literal("drwn.cloud-context"),
  schemaVersion: z.literal(1),
  selections: z.array(selectionSchema).max(64),
}).strict().superRefine((value, context) => {
  const digests = value.selections.map((selection) => selection.profileDigest);
  if (new Set(digests).size !== digests.length || [...digests].sort().join("\n") !== digests.join("\n")) {
    context.addIssue({ code: "custom", path: ["selections"], message: "selections must be unique and sorted" });
  }
});

const projectContextSchema = z.object({
  schema: z.literal("drwn.project-cloud-context"),
  schemaVersion: z.literal(1),
  profileDigest: profileDigestSchema,
  organizationId: organizationIdSchema,
  deployedWorkerId: deployedWorkerIdSchema,
  verifiedAt: timestampSchema,
}).strict();

export type MachineCloudContextV1 = z.infer<typeof machineContextSchema>;
export type ProjectCloudContextV1 = z.infer<typeof projectContextSchema>;

function invalidContext(): DrwnError {
  return new DrwnError("CLOUD_CONTEXT_INVALID", "Cloud context is malformed or unsupported.");
}

function parseContext<T>(schema: z.ZodType<T>, bytes: string): T {
  try {
    return schema.parse(JSON.parse(bytes));
  } catch {
    throw invalidContext();
  }
}

function admitContext<T>(schema: z.ZodType<T>, candidate: unknown): T {
  try {
    return schema.parse(candidate);
  } catch {
    throw invalidContext();
  }
}

async function withCloudLock<T>(root: string, path: string, operation: () => Promise<T>): Promise<T> {
  await preparePrivateFilePath({ root, path });
  return withOwnerLock({
    path,
    label: "cloud state mutation",
    busyCode: "CLOUD_STATE_BUSY",
    unrecoverableCode: "CLOUD_STATE_LOCK_UNRECOVERABLE",
  }, async () => operation());
}

export async function loadMachineCloudContext(homeDir: string): Promise<MachineCloudContextV1 | null> {
  const path = resolveMachineCloudContextPath(homeDir);
  const bytes = await readPrivateFile({ root: homeDir, path });
  return bytes === null ? null : parseContext(machineContextSchema, bytes);
}

export async function selectMachineOrganization(
  homeDir: string,
  profileDigest: string,
  organizationId: string,
  updatedAt: string,
): Promise<MachineCloudContextV1> {
  const selection = admitContext(selectionSchema, { profileDigest, organizationId, updatedAt });
  const path = resolveMachineCloudContextPath(homeDir);
  return withCloudLock(homeDir, resolveMachineCloudLockPath(homeDir), async () => {
    const current = await loadMachineCloudContext(homeDir) ?? {
      schema: "drwn.cloud-context" as const,
      schemaVersion: 1 as const,
      selections: [],
    };
    const next = machineContextSchema.parse({
      ...current,
      selections: [
        ...current.selections.filter((candidate) => candidate.profileDigest !== profileDigest),
        selection,
      ].sort((left, right) => left.profileDigest < right.profileDigest ? -1 : 1),
    });
    await writePrivateFile({ root: homeDir, path, bytes: `${JSON.stringify(next, null, 2)}\n` });
    return next;
  });
}

export async function clearMachineOrganization(homeDir: string, profileDigest: string): Promise<void> {
  admitContext(profileDigestSchema, profileDigest);
  const path = resolveMachineCloudContextPath(homeDir);
  await withCloudLock(homeDir, resolveMachineCloudLockPath(homeDir), async () => {
    const current = await loadMachineCloudContext(homeDir);
    if (!current) return;
    const next = machineContextSchema.parse({
      ...current,
      selections: current.selections.filter((selection) => selection.profileDigest !== profileDigest),
    });
    if (next.selections.length === 0) await removePrivateFile({ root: homeDir, path });
    else await writePrivateFile({ root: homeDir, path, bytes: `${JSON.stringify(next, null, 2)}\n` });
  });
}

export async function loadProjectCloudContext(projectRoot: string): Promise<ProjectCloudContextV1 | null> {
  const path = resolveProjectCloudContextPath(projectRoot);
  const bytes = await readPrivateFile({ root: projectRoot, path });
  return bytes === null ? null : parseContext(projectContextSchema, bytes);
}

export async function writeProjectCloudContext(
  projectRoot: string,
  candidate: ProjectCloudContextV1,
): Promise<ProjectCloudContextV1> {
  const value = admitContext(projectContextSchema, candidate);
  const path = resolveProjectCloudContextPath(projectRoot);
  return withCloudLock(projectRoot, resolveProjectCloudLockPath(projectRoot), async () => {
    await writePrivateFile({ root: projectRoot, path, bytes: `${JSON.stringify(value, null, 2)}\n` });
    return value;
  });
}

export async function clearProjectCloudContext(projectRoot: string): Promise<void> {
  const path = resolveProjectCloudContextPath(projectRoot);
  await withCloudLock(projectRoot, resolveProjectCloudLockPath(projectRoot), async () => {
    await removePrivateFile({ root: projectRoot, path });
  });
}
