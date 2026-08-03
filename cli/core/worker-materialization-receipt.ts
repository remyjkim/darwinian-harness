// ABOUTME: Defines canonical bounded Worker materialization receipts and append-only storage.
// ABOUTME: Digests the complete receipt, including its path-safe immutable receipt ID.

import { createHash, randomBytes } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import { DrwnError } from "./errors";
import { syncDirectory } from "./fs";
import { isStrictSemver } from "./semver-utils";

export const WORKER_MATERIALIZATION_RECEIPT_DIGEST_DOMAIN =
  "darwinian:worker-materialization-receipt:v1\n";

const MAX_RECEIPT_BYTES = 65_536;
const MAX_STORED_RECEIPTS = 1_024;
const digestColon = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const digestHyphen = z.string().regex(/^sha256-[a-f0-9]{64}$/);
const pathSafeReceiptId = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+$/)
  .refine((value) => value !== "." && value !== "..");
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
        !value.split("/").includes(".."),
    );
const isoTimestamp = z.string().refine((value) => {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
});
const checkSchema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,79}$/),
    result: z.enum(["passed", "failed", "not_applicable"]),
  })
  .strict();

const receiptSchema = z
  .object({
    receiptVersion: z.literal("worker-materialization-receipt@1"),
    receiptId: pathSafeReceiptId,
    operationId: safeIdentifier(),
    action: z.enum(["materialize", "reconcile", "remove"]),
    outcome: z.enum(["verified", "removed", "blocked", "failed"]),
    sourceBundle: z
      .object({
        digest: digestColon,
        workerId: safeIdentifier(),
        sourceBlueprint: z
          .object({
            id: safeIdentifier(),
            revision: z.number().int().positive(),
            digest: digestColon,
          })
          .strict(),
      })
      .strict(),
    consumer: z
      .object({
        name: z.literal("darwinian"),
        version: z.string().max(80).refine(isStrictSemver),
        compatibilityProfile: z.literal(
          "drwn-org-worker-materialization@1",
        ),
      })
      .strict(),
    artifactVerification: z
      .object({
        verifiedPinRefs: z.array(safeIdentifier()).max(128),
        snapshotDigest: digestColon,
      })
      .strict(),
    projectState: z
      .object({
        configDigest: digestColon.nullable(),
        lockDigest: digestColon.nullable(),
        orderedRootNames: z.array(safeIdentifier()).max(32),
        activeWorker: safeIdentifier().nullable(),
      })
      .strict(),
    instructionProjection: z
      .object({
        state: z.enum([
          "absent",
          "current",
          "drifted",
          "blocked",
          "removed",
        ]),
        instructionId: safeIdentifier().optional(),
        contentDigest: digestHyphen.optional(),
        ownershipHash: digestHyphen.optional(),
        adapterState: z.enum([
          "absent",
          "owned",
          "foreign-valid",
          "foreign-missing",
          "drifted",
        ]),
      })
      .strict(),
    verifiedConsentIds: z.array(safeIdentifier()).max(128),
    checks: z.array(checkSchema).min(1).max(64),
    priorReceiptDigest: digestColon.optional(),
    observedAt: isoTimestamp,
  })
  .strict()
  .superRefine((receipt, context) => {
    const assertUniqueSorted = (
      values: string[],
      label: string,
    ) => {
      const sorted = [...values].sort();
      if (
        new Set(values).size !== values.length ||
        values.some((value, index) => value !== sorted[index])
      ) {
        context.addIssue({
          code: "custom",
          message: `${label} must be uniquely sorted`,
        });
      }
    };
    assertUniqueSorted(
      receipt.artifactVerification.verifiedPinRefs,
      "verified pin references",
    );
    assertUniqueSorted(
      receipt.verifiedConsentIds,
      "verified consent IDs",
    );
    assertUniqueSorted(
      receipt.checks.map(({ code }) => code),
      "checks",
    );
    if (
      (receipt.action === "remove" &&
        receipt.outcome === "verified") ||
      (receipt.action !== "remove" &&
        receipt.outcome === "removed")
    ) {
      context.addIssue({
        code: "custom",
        message: "receipt action and outcome are inconsistent",
      });
    }
    if (receipt.outcome === "verified") {
      if (
        !receipt.projectState.configDigest ||
        !receipt.projectState.lockDigest ||
        receipt.projectState.orderedRootNames.length === 0 ||
        receipt.checks.some(({ result }) => result === "failed") ||
        (receipt.instructionProjection.state !== "current" &&
          receipt.instructionProjection.state !== "absent")
      ) {
        context.addIssue({
          code: "custom",
          message: "verified receipt contains an unverified postcondition",
        });
      }
    }
    if (
      (receipt.outcome === "blocked" ||
        receipt.outcome === "failed") &&
      (receipt.projectState.configDigest !== null ||
        receipt.projectState.lockDigest !== null ||
        receipt.projectState.orderedRootNames.length > 0 ||
        receipt.projectState.activeWorker !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "blocked or failed receipt makes an applied-state claim",
      });
    }
    if (
      receipt.projectState.activeWorker !== null &&
      !receipt.projectState.orderedRootNames.includes(
        receipt.projectState.activeWorker,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "active Worker must be an ordered root",
      });
    }
    if (
      receipt.instructionProjection.state === "current" &&
      (!receipt.instructionProjection.instructionId ||
        !receipt.instructionProjection.contentDigest ||
        !receipt.instructionProjection.ownershipHash ||
        receipt.instructionProjection.adapterState !== "owned")
    ) {
      context.addIssue({
        code: "custom",
        message: "current instruction projection lacks identity evidence",
      });
    }
    if (
      receipt.instructionProjection.state === "absent" &&
      (receipt.instructionProjection.instructionId !== undefined ||
        receipt.instructionProjection.contentDigest !== undefined ||
        receipt.instructionProjection.ownershipHash !== undefined ||
        receipt.instructionProjection.adapterState !== "absent")
    ) {
      context.addIssue({
        code: "custom",
        message: "absent instruction projection contains identity evidence",
      });
    }
    if (
      receipt.outcome === "verified" &&
      receipt.verifiedConsentIds.length > 0 &&
      (receipt.instructionProjection.state !== "current" ||
        receipt.instructionProjection.adapterState !== "owned")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "verified instruction consent requires a current owned projection",
      });
    }
    if (
      receipt.outcome === "verified" ||
      receipt.outcome === "removed"
    ) {
      const checksByCode = new Map(
        receipt.checks.map((check) => [check.code, check.result]),
      );
      for (const required of [
        "ARTIFACT_BYTES",
        "PROJECTION_OWNERSHIP",
        "PROJECT_STATE",
        "VENDOR_CONTENT",
      ]) {
        if (checksByCode.get(required) !== "passed") {
          context.addIssue({
            code: "custom",
            message: `verified receipt lacks required check ${required}`,
          });
        }
      }
    }
  });

export type WorkerMaterializationReceiptV1 = z.infer<
  typeof receiptSchema
>;

function invalidReceipt(cause?: unknown): never {
  throw new DrwnError(
    "ORG_WORKER_RECEIPT_INVALID",
    "Worker materialization receipt is malformed or unsupported",
    undefined,
    cause,
  );
}

export function parseWorkerMaterializationReceipt(
  candidate: unknown,
): WorkerMaterializationReceiptV1 {
  const parsed = receiptSchema.safeParse(candidate);
  if (!parsed.success) invalidReceipt(parsed.error);
  return parsed.data;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      )
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${canonicalJson(child)}`,
      )
      .join(",")}}`;
  }
  throw new Error("Receipt contains a non-canonical value");
}

export function computeWorkerMaterializationReceiptDigest(
  receipt: unknown,
): `sha256:${string}` {
  const parsed = parseWorkerMaterializationReceipt(receipt);
  return `sha256:${createHash("sha256")
    .update(WORKER_MATERIALIZATION_RECEIPT_DIGEST_DOMAIN)
    .update(canonicalJson(parsed))
    .digest("hex")}`;
}

export function resolveWorkerMaterializationReceiptsRoot(
  projectRoot: string,
) {
  return join(
    projectRoot,
    ".agents",
    "drwn",
    "receipts",
    "worker-materialization",
  );
}

export function resolveWorkerMaterializationReceiptPath(
  projectRoot: string,
  receiptId: string,
) {
  const safeId = pathSafeReceiptId.parse(receiptId);
  return join(
    resolveWorkerMaterializationReceiptsRoot(projectRoot),
    `${safeId}.json`,
  );
}

function serializeReceipt(receipt: unknown): string {
  return `${JSON.stringify(
    parseWorkerMaterializationReceipt(receipt),
    null,
    2,
  )}\n`;
}

export async function persistWorkerMaterializationReceipt(
  projectRoot: string,
  receipt: unknown,
  options: {
    checkpoint?: (
      checkpoint: "after-temp-sync" | "after-final-link",
    ) => void | Promise<void>;
  } = {},
): Promise<string> {
  const parsed = parseWorkerMaterializationReceipt(receipt);
  const path = resolveWorkerMaterializationReceiptPath(
    projectRoot,
    parsed.receiptId,
  );
  const bytes = serializeReceipt(parsed);
  const root = dirname(path);
  await mkdir(root, { recursive: true });
  const temporary = join(
    root,
    `.${parsed.receiptId}.tmp-${randomBytes(8).toString("hex")}`,
  );
  try {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await options.checkpoint?.("after-temp-sync");
    try {
      await link(temporary, path);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        let existing;
        try {
          existing = await readFile(path, "utf8");
        } catch (readError) {
          throw new DrwnError(
            "ORG_WORKER_RECEIPT_ID_CONFLICT",
            "Worker materialization receipt ID already exists",
            undefined,
            readError,
          );
        }
        if (existing === bytes) return path;
        throw new DrwnError(
          "ORG_WORKER_RECEIPT_ID_CONFLICT",
          "Worker materialization receipt ID already exists",
        );
      }
      throw error;
    }
    await syncDirectory(root);
    await options.checkpoint?.("after-final-link");
    return path;
  } finally {
    await rm(temporary, { force: true });
    await syncDirectory(root);
  }
}

export async function findWorkerMaterializationReceiptByOperation(
  projectRoot: string,
  operationId: string,
): Promise<WorkerMaterializationReceiptV1 | null> {
  if (!safeIdentifier().safeParse(operationId).success) invalidReceipt();
  const root = resolveWorkerMaterializationReceiptsRoot(projectRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
  if (entries.length > MAX_STORED_RECEIPTS) {
    throw new DrwnError(
      "ORG_WORKER_RECEIPT_STORE_INVALID",
      "Worker materialization receipt store exceeds its bounded profile",
    );
  }
  const matches: WorkerMaterializationReceiptV1[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new DrwnError(
        "ORG_WORKER_RECEIPT_STORE_INVALID",
        "Worker materialization receipt store contains unsupported content",
      );
    }
    if (!/^[A-Za-z0-9._-]+\.json$/.test(entry.name)) {
      throw new DrwnError(
        "ORG_WORKER_RECEIPT_STORE_INVALID",
        "Worker materialization receipt store contains an invalid entry",
      );
    }
    const path = join(root, entry.name);
    const stats = await lstat(path);
    if (
      stats.isSymbolicLink() ||
      !stats.isFile() ||
      stats.size > MAX_RECEIPT_BYTES
    ) {
      throw new DrwnError(
        "ORG_WORKER_RECEIPT_STORE_INVALID",
        "Worker materialization receipt store contains an invalid receipt",
      );
    }
    let parsed;
    try {
      parsed = parseWorkerMaterializationReceipt(
        JSON.parse(await readFile(path, "utf8")),
      );
    } catch (error) {
      throw new DrwnError(
        "ORG_WORKER_RECEIPT_STORE_INVALID",
        "Worker materialization receipt store contains an invalid receipt",
        undefined,
        error,
      );
    }
    if (parsed.receiptId !== entry.name.slice(0, -5)) {
      throw new DrwnError(
        "ORG_WORKER_RECEIPT_STORE_INVALID",
        "Worker materialization receipt filename does not match its identity",
      );
    }
    if (parsed.operationId === operationId) matches.push(parsed);
  }
  if (matches.length > 1) {
    throw new DrwnError(
      "ORG_WORKER_RECEIPT_OPERATION_CONFLICT",
      "Multiple Worker receipts claim the same operation ID",
    );
  }
  return matches[0] ?? null;
}
