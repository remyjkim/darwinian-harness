// ABOUTME: Persists resumable Org Worker operation phases with exact request idempotency.
// ABOUTME: Retains recovery evidence until receipt and materialization record durability are proven.

import { lstat, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { DrwnError } from "./errors";
import { syncDirectory, writeAtomically } from "./fs";
import { resolveOrgWorkerMaterializationJournalPath } from "./paths";

export const ORG_WORKER_MATERIALIZATION_PHASES = [
  "validated",
  "artifacts_verified",
  "project_state_committed",
  "projection_applied",
  "read_back_verified",
  "receipt_persisted",
  "completed",
] as const;

export type OrgWorkerMaterializationPhase =
  (typeof ORG_WORKER_MATERIALIZATION_PHASES)[number];

const MAX_JOURNAL_BYTES = 16_384;
const safeOperationId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9@._:+-]+$/);
const isoTimestamp = z.string().refine((value) => {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
});
const journalSchema = z
  .object({
    schema: z.literal("drwn.org-worker-materialization-journal"),
    schemaVersion: z.literal(1),
    operationId: safeOperationId,
    requestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    phase: z.enum(ORG_WORKER_MATERIALIZATION_PHASES),
    durability: z
      .object({
        receiptPersisted: z.boolean(),
        recordPersisted: z.boolean(),
      })
      .strict(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict()
  .superRefine((journal, context) => {
    const phaseIndex = ORG_WORKER_MATERIALIZATION_PHASES.indexOf(
      journal.phase,
    );
    const receiptIndex = ORG_WORKER_MATERIALIZATION_PHASES.indexOf(
      "receipt_persisted",
    );
    if (
      journal.durability.receiptPersisted !==
      (phaseIndex >= receiptIndex)
    ) {
      context.addIssue({
        code: "custom",
        message: "receipt durability does not match the phase",
      });
    }
    if (
      journal.durability.recordPersisted &&
      !journal.durability.receiptPersisted
    ) {
      context.addIssue({
        code: "custom",
        message: "record durability requires a durable receipt",
      });
    }
    if (
      journal.phase === "completed" &&
      !journal.durability.recordPersisted
    ) {
      context.addIssue({
        code: "custom",
        message: "completed operations require a durable record",
      });
    }
  });

export type OrgWorkerMaterializationJournalV1 = z.infer<
  typeof journalSchema
>;

function invalidJournal(cause?: unknown): never {
  throw new DrwnError(
    "ORG_WORKER_MATERIALIZATION_JOURNAL_INVALID",
    "Org Worker materialization journal is malformed or unsupported",
    undefined,
    cause,
  );
}

function parseJournal(
  candidate: unknown,
): OrgWorkerMaterializationJournalV1 {
  const parsed = journalSchema.safeParse(candidate);
  if (!parsed.success) invalidJournal(parsed.error);
  return parsed.data;
}

async function persistJournal(
  projectRoot: string,
  journal: OrgWorkerMaterializationJournalV1,
) {
  await writeAtomically(
    resolveOrgWorkerMaterializationJournalPath(projectRoot),
    `${JSON.stringify(parseJournal(journal), null, 2)}\n`,
  );
}

export async function loadOrgWorkerMaterializationJournal(
  projectRoot: string,
): Promise<OrgWorkerMaterializationJournalV1 | null> {
  const path = resolveOrgWorkerMaterializationJournalPath(projectRoot);
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
    invalidJournal(error);
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_JOURNAL_BYTES) {
    invalidJournal();
  }
  try {
    return parseJournal(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (
      error instanceof DrwnError &&
      error.code === "ORG_WORKER_MATERIALIZATION_JOURNAL_INVALID"
    ) {
      throw error;
    }
    invalidJournal(error);
  }
}

function assertOperationIdentity(
  journal: OrgWorkerMaterializationJournalV1,
  operationId: string,
  requestDigest: string,
) {
  if (journal.operationId !== operationId) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_IN_PROGRESS",
      "Another Org Worker materialization operation is in progress",
    );
  }
  if (journal.requestDigest !== requestDigest) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_ID_CONFLICT",
      "Org Worker operation ID was reused with a different request",
    );
  }
}

export async function beginOrgWorkerMaterializationJournal(input: {
  projectRoot: string;
  operationId: string;
  requestDigest: `sha256:${string}`;
  clock: () => string;
}): Promise<OrgWorkerMaterializationJournalV1> {
  const existing = await loadOrgWorkerMaterializationJournal(
    input.projectRoot,
  );
  if (existing) {
    assertOperationIdentity(
      existing,
      input.operationId,
      input.requestDigest,
    );
    return existing;
  }
  const now = input.clock();
  const journal = parseJournal({
    schema: "drwn.org-worker-materialization-journal",
    schemaVersion: 1,
    operationId: input.operationId,
    requestDigest: input.requestDigest,
    phase: "validated",
    durability: {
      receiptPersisted: false,
      recordPersisted: false,
    },
    createdAt: now,
    updatedAt: now,
  });
  await persistJournal(input.projectRoot, journal);
  return journal;
}

export async function advanceOrgWorkerMaterializationJournal(input: {
  projectRoot: string;
  operationId: string;
  requestDigest: `sha256:${string}`;
  phase: Exclude<OrgWorkerMaterializationPhase, "validated" | "completed">;
  clock: () => string;
  checkpoint?: (phase: OrgWorkerMaterializationPhase) => void | Promise<void>;
}): Promise<OrgWorkerMaterializationJournalV1> {
  const journal = await loadOrgWorkerMaterializationJournal(
    input.projectRoot,
  );
  if (!journal) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_JOURNAL_MISSING",
      "Org Worker materialization journal is missing",
    );
  }
  assertOperationIdentity(
    journal,
    input.operationId,
    input.requestDigest,
  );
  if (journal.phase === input.phase) return journal;
  const currentIndex = ORG_WORKER_MATERIALIZATION_PHASES.indexOf(
    journal.phase,
  );
  const nextIndex = ORG_WORKER_MATERIALIZATION_PHASES.indexOf(input.phase);
  if (nextIndex !== currentIndex + 1) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_PHASE_INVALID",
      "Org Worker materialization phase transition is invalid",
    );
  }
  const next = parseJournal({
    ...journal,
    phase: input.phase,
    durability: {
      ...journal.durability,
      receiptPersisted:
        input.phase === "receipt_persisted"
          ? true
          : journal.durability.receiptPersisted,
    },
    updatedAt: input.clock(),
  });
  await persistJournal(input.projectRoot, next);
  await input.checkpoint?.(input.phase);
  return next;
}

export async function markOrgWorkerMaterializationRecordDurable(input: {
  projectRoot: string;
  operationId: string;
  requestDigest: `sha256:${string}`;
  clock: () => string;
}): Promise<OrgWorkerMaterializationJournalV1> {
  const journal = await loadOrgWorkerMaterializationJournal(
    input.projectRoot,
  );
  if (!journal) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_JOURNAL_MISSING",
      "Org Worker materialization journal is missing",
    );
  }
  assertOperationIdentity(
    journal,
    input.operationId,
    input.requestDigest,
  );
  if (
    journal.phase !== "receipt_persisted" ||
    !journal.durability.receiptPersisted
  ) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_PHASE_INVALID",
      "Materialization record cannot be marked durable before the receipt",
    );
  }
  if (journal.durability.recordPersisted) return journal;
  const next = parseJournal({
    ...journal,
    durability: {
      receiptPersisted: true,
      recordPersisted: true,
    },
    updatedAt: input.clock(),
  });
  await persistJournal(input.projectRoot, next);
  return next;
}

export async function completeOrgWorkerMaterializationJournal(input: {
  projectRoot: string;
  operationId: string;
  requestDigest: `sha256:${string}`;
  clock: () => string;
  checkpoint?: (phase: "completed") => void | Promise<void>;
}): Promise<void> {
  const journal = await loadOrgWorkerMaterializationJournal(
    input.projectRoot,
  );
  if (!journal) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_JOURNAL_MISSING",
      "Org Worker materialization journal is missing",
    );
  }
  assertOperationIdentity(
    journal,
    input.operationId,
    input.requestDigest,
  );
  if (
    journal.phase !== "receipt_persisted" &&
    journal.phase !== "completed"
  ) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_NOT_DURABLE",
      "Org Worker operation cannot complete before receipt and record durability",
    );
  }
  if (
    !journal.durability.receiptPersisted ||
    !journal.durability.recordPersisted
  ) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_NOT_DURABLE",
      "Org Worker operation cannot complete before receipt and record durability",
    );
  }
  if (journal.phase !== "completed") {
    const completed = parseJournal({
      ...journal,
      phase: "completed",
      updatedAt: input.clock(),
    });
    await persistJournal(input.projectRoot, completed);
    await input.checkpoint?.("completed");
  }
  const path = resolveOrgWorkerMaterializationJournalPath(
    input.projectRoot,
  );
  await rm(path);
  await syncDirectory(dirname(path));
}

export async function recoverOrgWorkerMaterializationJournal(
  projectRoot: string,
): Promise<OrgWorkerMaterializationJournalV1 | null> {
  const journal = await loadOrgWorkerMaterializationJournal(projectRoot);
  if (!journal) return null;
  if (
    journal.phase === "completed" &&
    journal.durability.receiptPersisted &&
    journal.durability.recordPersisted
  ) {
    const path = resolveOrgWorkerMaterializationJournalPath(projectRoot);
    await rm(path);
    await syncDirectory(dirname(path));
    return null;
  }
  return journal;
}
