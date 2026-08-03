// ABOUTME: Freezes bounded Worker materialization receipt canonicalization and append-only storage.
// ABOUTME: Prevents premature success claims, privacy leaks, duplicate operations, and receipt overwrite.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WORKER_MATERIALIZATION_RECEIPT_DIGEST_DOMAIN,
  computeWorkerMaterializationReceiptDigest,
  findWorkerMaterializationReceiptByOperation,
  parseWorkerMaterializationReceipt,
  persistWorkerMaterializationReceipt,
  resolveWorkerMaterializationReceiptPath,
} from "../cli/core/worker-materialization-receipt";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

function receipt() {
  return {
    receiptVersion: "worker-materialization-receipt@1",
    receiptId: "receipt-gtm-0001",
    operationId: "operation:gtm:0001",
    action: "materialize",
    outcome: "verified",
    sourceBundle: {
      digest:
        "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
      workerId: "worker:gtm-operator",
      sourceBlueprint: {
        id: "blueprint:gtm:1",
        revision: 1,
        digest:
          "sha256:82dcd59fc1a465304d8efeffe15a3213f44f2ba0b98be180e78512d287250d31",
      },
    },
    consumer: {
      name: "darwinian",
      version: "1.0.0",
      compatibilityProfile: "drwn-org-worker-materialization@1",
    },
    artifactVerification: {
      verifiedPinRefs: ["artifact:gtm-worker-root"],
      snapshotDigest:
        "sha256:b77d54d032c0b02e42413a720086bca5cb21dc9cf1aa5921cfa3ea699897f086",
    },
    projectState: {
      configDigest: `sha256:${"1".repeat(64)}`,
      lockDigest: `sha256:${"2".repeat(64)}`,
      orderedRootNames: ["gtm-worker"],
      activeWorker: "gtm-worker",
    },
    instructionProjection: {
      state: "current",
      instructionId: "worker:gtm-worker",
      contentDigest:
        "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
      ownershipHash: `sha256-${"4".repeat(64)}`,
      adapterState: "owned",
    },
    verifiedConsentIds: ["consent:gtm-instructions"],
    checks: [
      { code: "ARTIFACT_BYTES", result: "passed" },
      { code: "PROJECTION_OWNERSHIP", result: "passed" },
      { code: "PROJECT_STATE", result: "passed" },
      { code: "VENDOR_CONTENT", result: "passed" },
    ],
    observedAt: "2026-07-24T00:00:00.000Z",
  };
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
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

describe("Worker materialization receipt V1", () => {
  test("digests the complete strict receipt including receiptId", () => {
    const parsed = parseWorkerMaterializationReceipt(receipt());
    const independent = `sha256:${createHash("sha256")
      .update(WORKER_MATERIALIZATION_RECEIPT_DIGEST_DOMAIN)
      .update(canonicalJson(parsed))
      .digest("hex")}` as `sha256:${string}`;

    expect(computeWorkerMaterializationReceiptDigest(parsed)).toBe(
      independent,
    );
    expect(
      computeWorkerMaterializationReceiptDigest({
        ...parsed,
        receiptId: "receipt-gtm-0002",
      }),
    ).not.toBe(independent);
  });

  test("rejects content, secrets, paths, unbounded checks, unsorted identities, and false verified outcomes", () => {
    const candidates = [
      { ...receipt(), instructionBody: "private instruction content" },
      { ...receipt(), apiKey: "not-a-real-secret" },
      { ...receipt(), receiptId: "../escaping-receipt" },
      {
        ...receipt(),
        checks: Array.from({ length: 65 }, (_, index) => ({
          code: `CHECK_${index}`,
          result: "passed",
        })),
      },
      {
        ...receipt(),
        artifactVerification: {
          ...receipt().artifactVerification,
          verifiedPinRefs: ["artifact:z", "artifact:a"],
        },
      },
      {
        ...receipt(),
        checks: [
          { code: "PROJECT_STATE", result: "passed" },
          { code: "ARTIFACT_BYTES", result: "passed" },
        ],
      },
      {
        ...receipt(),
        checks: [
          { code: "ARTIFACT_BYTES", result: "failed" },
        ],
      },
      {
        ...receipt(),
        instructionProjection: {
          ...receipt().instructionProjection,
          adapterState: "maybe-owned",
        },
      },
      {
        ...receipt(),
        instructionProjection: {
          ...receipt().instructionProjection,
          adapterState: "absent",
        },
      },
      {
        ...receipt(),
        verifiedConsentIds: [],
        instructionProjection: {
          state: "absent",
          instructionId: "worker:must-not-remain",
          adapterState: "absent",
        },
      },
      {
        ...receipt(),
        verifiedConsentIds: [],
        instructionProjection: {
          state: "absent",
          adapterState: "owned",
        },
      },
      {
        ...receipt(),
        checks: [
          { code: "ARTIFACT_BYTES", result: "passed" },
        ],
      },
    ];

    for (const candidate of candidates) {
      expect(() =>
        parseWorkerMaterializationReceipt(candidate),
      ).toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_RECEIPT_INVALID",
        }),
      );
    }
  });

  test("accepts blocked and failed action truth while rejecting cross-action outcomes", () => {
    for (const [action, outcome] of [
      ["materialize", "blocked"],
      ["reconcile", "failed"],
      ["remove", "blocked"],
    ] as const) {
      expect(() =>
        parseWorkerMaterializationReceipt({
          ...receipt(),
          action,
          outcome,
          projectState: {
            configDigest: null,
            lockDigest: null,
            orderedRootNames: [],
            activeWorker: null,
          },
          instructionProjection: {
            state: "blocked",
            adapterState: "drifted",
          },
          checks: [
            { code: "PROJECT_STATE", result: "failed" },
          ],
          verifiedConsentIds: [],
        }),
      ).not.toThrow();
    }
    for (const [action, outcome] of [
      ["materialize", "removed"],
      ["remove", "verified"],
    ] as const) {
      expect(() =>
        parseWorkerMaterializationReceipt({
          ...receipt(),
          action,
          outcome,
        }),
      ).toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_RECEIPT_INVALID",
        }),
      );
    }

    expect(() =>
      parseWorkerMaterializationReceipt({
        ...receipt(),
        action: "remove",
        outcome: "removed",
        instructionProjection: {
          state: "removed",
          adapterState: "absent",
        },
        checks: [
          { code: "ARTIFACT_BYTES", result: "passed" },
          { code: "PROJECTION_OWNERSHIP", result: "passed" },
          { code: "PROJECT_STATE", result: "failed" },
          { code: "VENDOR_CONTENT", result: "passed" },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_RECEIPT_INVALID",
      }),
    );
  });

  test("stores receipts append-only and finds exactly one operation receipt", async () => {
    const projectRoot = await mkdtemp(
      join(tmpdir(), "worker-receipts-"),
    );
    roots.push(projectRoot);
    const parsed = parseWorkerMaterializationReceipt(receipt());
    const firstPath = await persistWorkerMaterializationReceipt(
      projectRoot,
      parsed,
    );
    const repeatedPath = await persistWorkerMaterializationReceipt(
      projectRoot,
      parsed,
    );
    expect(repeatedPath).toBe(firstPath);
    expect(
      await findWorkerMaterializationReceiptByOperation(
        projectRoot,
        parsed.operationId,
      ),
    ).toEqual(parsed);

    await expect(
      persistWorkerMaterializationReceipt(projectRoot, {
        ...parsed,
        observedAt: "2026-07-24T00:00:01.000Z",
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_RECEIPT_ID_CONFLICT",
      }),
    );
  });

  test("never exposes a partial final receipt when creation crashes", async () => {
    const projectRoot = await mkdtemp(
      join(tmpdir(), "worker-receipt-crash-"),
    );
    roots.push(projectRoot);
    const parsed = parseWorkerMaterializationReceipt(receipt());
    await expect(
      persistWorkerMaterializationReceipt(projectRoot, parsed, {
        checkpoint: (checkpoint) => {
          if (checkpoint === "after-temp-sync") {
            throw new Error("crash before final install");
          }
        },
      }),
    ).rejects.toThrow("crash before final install");
    expect(
      await Bun.file(
        resolveWorkerMaterializationReceiptPath(
          projectRoot,
          parsed.receiptId,
        ),
      ).exists(),
    ).toBe(false);

    await persistWorkerMaterializationReceipt(projectRoot, parsed);
    const finalPath = resolveWorkerMaterializationReceiptPath(
      projectRoot,
      parsed.receiptId,
    );
    await expect(
      persistWorkerMaterializationReceipt(projectRoot, {
        ...parsed,
        observedAt: "2026-07-24T00:00:01.000Z",
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_RECEIPT_ID_CONFLICT",
      }),
    );
    expect(JSON.parse(await Bun.file(finalPath).text())).toEqual(parsed);

    const corruptRoot = await mkdtemp(
      join(tmpdir(), "worker-receipt-corrupt-"),
    );
    roots.push(corruptRoot);
    const corruptPath = resolveWorkerMaterializationReceiptPath(
      corruptRoot,
      parsed.receiptId,
    );
    await mkdir(join(corruptRoot, ".agents", "drwn", "receipts", "worker-materialization"), {
      recursive: true,
    });
    await Bun.write(corruptPath, '{"partial":');
    await expect(
      persistWorkerMaterializationReceipt(corruptRoot, parsed),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_RECEIPT_ID_CONFLICT",
      }),
    );
    expect(await Bun.file(corruptPath).text()).toBe('{"partial":');
  });
});
