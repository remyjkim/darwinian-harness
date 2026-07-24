// ABOUTME: Persists bounded Worker-observed Org materialization evidence without paths or content.
// ABOUTME: Reconstructs external consent only after exact comparison with the current local lock.

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { z } from "zod";

import {
  validateCardLockfile,
  type ProjectLockV1,
} from "./card-lock";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import type { OrganizationInstructionConsentContext } from "./instruction-consent-evidence";
import { resolveOrgWorkerMaterializationRecordPath } from "./paths";
import { validateProjectConfig } from "./project";
import { isStrictSemver, validRange } from "./semver-utils";

const MAX_RECORD_BYTES = 262_144;
const digestColon = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const digestHyphen = z.string().regex(/^sha256-[a-f0-9]{64}$/);
const objectId = z.string().regex(/^[a-f0-9]{40}$/);
const safeIdentifier = (maximum = 160) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .regex(/^[A-Za-z0-9@._:+/-]+$/)
    .refine(
      (value) =>
        !value.startsWith("/") &&
        !value.includes("\\") &&
        !value.includes("://") &&
        !/(?:^|:)\/(?!\/)/.test(value) &&
        !/^[A-Za-z]:\//.test(value) &&
        !value.split("/").includes(".."),
    );
const exactVersion = z.string().max(80).refine(isStrictSemver);
const artifactBindingSchema = z
  .object({
    artifactPinRef: safeIdentifier(),
    cardName: safeIdentifier(),
    version: exactVersion,
    integrity: digestHyphen,
    treeSha: objectId,
    gitCommit: objectId,
  })
  .strict();

const instructionConsentEvidenceSchema = z
  .object({
    consentId: safeIdentifier(),
    artifactPinRef: safeIdentifier(),
    contentDigest: digestHyphen,
    consentedRange: z.string().min(1).max(80).refine(validRange),
    ratifierRef: safeIdentifier(),
    evidenceRefs: z.array(safeIdentifier()).min(1).max(32),
  })
  .strict();

const recordSchema = z
  .object({
    schema: z.literal("drwn.org-worker-materialization"),
    schemaVersion: z.literal(1),
    materializationState: z.enum(["active", "removed"]).optional(),
    sourceBundle: z
      .object({
        digest: digestColon,
        workerId: safeIdentifier(),
        blueprintId: safeIdentifier(),
        blueprintRevision: z.number().int().positive(),
        blueprintDigest: digestColon,
      })
      .strict(),
    projectState: z
      .object({
        configDigest: digestColon,
        lockDigest: digestColon,
        orderedRootNames: z.array(safeIdentifier()).max(32),
        activeWorker: safeIdentifier().nullable(),
      })
      .strict(),
    artifactBindings: z.array(artifactBindingSchema).min(1).max(128),
    instructionConsentEvidence: z
      .array(instructionConsentEvidenceSchema)
      .max(128),
    projection: z
      .object({
        instructionId: safeIdentifier().nullable(),
        contentDigest: digestHyphen.nullable(),
        ownershipHash: digestHyphen.nullable(),
        adapterState: z.enum([
          "absent",
          "owned",
          "foreign-valid",
          "foreign-missing",
          "drifted",
        ]),
      })
      .strict(),
    lastVerifiedReceiptId: safeIdentifier(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      record.materializationState !== "removed" &&
      record.projectState.orderedRootNames.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "active materialization requires an ordered root",
      });
    }
    if (
      record.materializationState === "removed" &&
      (record.instructionConsentEvidence.length > 0 ||
        record.projection.instructionId !== null ||
        record.projection.contentDigest !== null ||
        record.projection.ownershipHash !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "removed materialization retains active consent or projection",
      });
    }
    const bindingPins = record.artifactBindings.map(
      ({ artifactPinRef }) => artifactPinRef,
    );
    const sortedPins = [...bindingPins].sort();
    if (
      bindingPins.some((pin, index) => pin !== sortedPins[index]) ||
      new Set(bindingPins).size !== bindingPins.length
    ) {
      context.addIssue({
        code: "custom",
        message: "artifact bindings must be uniquely sorted by pin",
      });
    }
    const cardNames = record.artifactBindings.map(({ cardName }) => cardName);
    if (new Set(cardNames).size !== cardNames.length) {
      context.addIssue({
        code: "custom",
        message: "artifact bindings must have unique Card names",
      });
    }
    const bindingSet = new Set(bindingPins);
    const consentIds = new Set<string>();
    const orderedConsentIds = record.instructionConsentEvidence.map(
      ({ consentId }) => consentId,
    );
    if (
      orderedConsentIds.some(
        (consentId, index) =>
          consentId !== [...orderedConsentIds].sort()[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "instruction consent evidence must be sorted by consent ID",
      });
    }
    for (const evidence of record.instructionConsentEvidence) {
      if (!bindingSet.has(evidence.artifactPinRef)) {
        context.addIssue({
          code: "custom",
          message: "instruction evidence references an unknown artifact pin",
        });
      }
      if (consentIds.has(evidence.consentId)) {
        context.addIssue({
          code: "custom",
          message: "instruction consent IDs must be unique",
        });
      }
      consentIds.add(evidence.consentId);
      if (new Set(evidence.evidenceRefs).size !== evidence.evidenceRefs.length) {
        context.addIssue({
          code: "custom",
          message: "evidence references must be unique",
        });
      }
      if (
        evidence.evidenceRefs.some(
          (reference, index) =>
            reference !== [...evidence.evidenceRefs].sort()[index],
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "evidence references must be sorted",
        });
      }
    }
    if (
      new Set(record.projectState.orderedRootNames).size !==
      record.projectState.orderedRootNames.length
    ) {
      context.addIssue({
        code: "custom",
        message: "ordered roots must be unique",
      });
    }
    if (
      record.projectState.activeWorker !== null &&
      !record.projectState.orderedRootNames.includes(
        record.projectState.activeWorker,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "active Worker must be an ordered root",
      });
    }
  });

export type OrgWorkerMaterializationRecordV1 = z.infer<
  typeof recordSchema
>;

function invalidRecord(cause?: unknown): never {
  throw new DrwnError(
    "ORG_WORKER_MATERIALIZATION_RECORD_INVALID",
    "Org Worker materialization record is malformed or unsupported",
    undefined,
    cause,
  );
}

export function parseOrgWorkerMaterializationRecord(
  candidate: unknown,
): OrgWorkerMaterializationRecordV1 {
  const parsed = recordSchema.safeParse(candidate);
  if (!parsed.success) invalidRecord(parsed.error);
  return parsed.data;
}

export function serializeOrgWorkerMaterializationRecord(
  record: unknown,
): string {
  return `${JSON.stringify(
    parseOrgWorkerMaterializationRecord(record),
    null,
    2,
  )}\n`;
}

export async function loadOrgWorkerMaterializationRecord(
  projectRoot: string,
): Promise<OrgWorkerMaterializationRecordV1 | null> {
  const path = resolveOrgWorkerMaterializationRecordPath(projectRoot);
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    invalidRecord(error);
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_RECORD_BYTES) {
    invalidRecord();
  }
  try {
    return parseOrgWorkerMaterializationRecord(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if (
      error instanceof DrwnError &&
      error.code === "ORG_WORKER_MATERIALIZATION_RECORD_INVALID"
    ) {
      throw error;
    }
    invalidRecord(error);
  }
}

export async function writeOrgWorkerMaterializationRecord(
  projectRoot: string,
  record: unknown,
): Promise<string> {
  const path = resolveOrgWorkerMaterializationRecordPath(projectRoot);
  await writeAtomically(
    path,
    serializeOrgWorkerMaterializationRecord(record),
  );
  return path;
}

function drift(): never {
  throw new DrwnError(
    "ORG_WORKER_MATERIALIZATION_DRIFT",
    "Current Card lock does not match the verified Org Worker materialization",
  );
}

export async function loadOrgWorkerInstructionConsentContext(input: {
  projectRoot: string;
  configBytes: string;
  lockBytes: string;
  lock: ProjectLockV1 | null;
}): Promise<OrganizationInstructionConsentContext | null> {
  const record = await loadOrgWorkerMaterializationRecord(
    input.projectRoot,
  );
  if (!record) return null;
  if (record.materializationState === "removed") return null;
  if (!input.lock) drift();
  const bytesDigest = (bytes: string): `sha256:${string}` =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (
    bytesDigest(input.configBytes) !== record.projectState.configDigest ||
    bytesDigest(input.lockBytes) !== record.projectState.lockDigest
  ) {
    drift();
  }
  let config;
  let lockFromBytes;
  try {
    config = validateProjectConfig(JSON.parse(input.configBytes));
    lockFromBytes = validateCardLockfile(JSON.parse(input.lockBytes));
  } catch {
    drift();
  }
  if (
    JSON.stringify(lockFromBytes) !== JSON.stringify(input.lock) ||
    config.workers.length !== lockFromBytes.workerRoots.length ||
    config.workers.some(
      (requested, index) =>
        lockFromBytes.workerRoots[index]?.requested !== requested,
    ) ||
    config.activeWorker !== record.projectState.activeWorker ||
    JSON.stringify(lockFromBytes.workerRoots.map(({ name }) => name)) !==
      JSON.stringify(record.projectState.orderedRootNames)
  ) {
    drift();
  }
  if (record.artifactBindings.length !== input.lock.cards.length) drift();
  const cardsByName = new Map(
    input.lock.cards.map((card) => [card.name, card]),
  );
  const artifactPinRefsByCard: Record<string, string> = {};
  for (const binding of record.artifactBindings) {
    const card = cardsByName.get(binding.cardName);
    if (
      !card ||
      card.version !== binding.version ||
      card.integrity !== binding.integrity ||
      card.treeSha !== binding.treeSha ||
      card.git?.commit !== binding.gitCommit
    ) {
      drift();
    }
    artifactPinRefsByCard[binding.cardName] = binding.artifactPinRef;
  }
  if (
    Object.keys(artifactPinRefsByCard).length !== input.lock.cards.length
  ) {
    drift();
  }
  const bindingsByPin = new Map(
    record.artifactBindings.map((binding) => [
      binding.artifactPinRef,
      binding,
    ]),
  );
  return {
    workerId: record.sourceBundle.workerId,
    artifactPinRefsByCard,
    evidence: record.instructionConsentEvidence.map((evidence) => {
      if (!bindingsByPin.has(evidence.artifactPinRef)) drift();
      return {
        kind: "org_worker_bundle_consent" as const,
        bundleDigest: record.sourceBundle.digest as `sha256:${string}`,
        sourceBlueprint: {
          id: record.sourceBundle.blueprintId,
          revision: record.sourceBundle.blueprintRevision,
          digest:
            record.sourceBundle.blueprintDigest as `sha256:${string}`,
        },
        consentId: evidence.consentId,
        workerId: record.sourceBundle.workerId,
        artifactPinRef: evidence.artifactPinRef,
        consentedRange: evidence.consentedRange,
        contentDigest:
          evidence.contentDigest as `sha256-${string}`,
        ratifierRef: evidence.ratifierRef,
        evidenceRefs: [...evidence.evidenceRefs],
        projectionSurface: "worker_instructions" as const,
      };
    }),
  };
}
