// ABOUTME: Verifies resumable Org Worker operation phases and exact idempotency.
// ABOUTME: Retains recovery evidence until both receipt and materialization record are durable.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ORG_WORKER_MATERIALIZATION_PHASES,
  advanceOrgWorkerMaterializationJournal,
  beginOrgWorkerMaterializationJournal,
  completeOrgWorkerMaterializationJournal,
  loadOrgWorkerMaterializationJournal,
  markOrgWorkerMaterializationRecordDurable,
  recoverOrgWorkerMaterializationJournal,
} from "../cli/core/org-worker-materialization-journal";
import {
  resolveOrgWorkerMaterializationJournalPath,
} from "../cli/core/paths";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

async function project() {
  const root = await mkdtemp(join(tmpdir(), "org-worker-journal-"));
  roots.push(root);
  return root;
}

function clock(...values: string[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

describe("Org Worker materialization journal", () => {
  test("same operation and request resumes exactly while different bytes conflict", async () => {
    const projectRoot = await project();
    const now = clock(
      "2026-07-24T00:00:00.000Z",
      "2026-07-24T00:00:01.000Z",
    );
    const input = {
      projectRoot,
      operationId: "operation:gtm:1",
      requestDigest: `sha256:${"1".repeat(64)}` as const,
      clock: now,
    };
    const first = await beginOrgWorkerMaterializationJournal(input);
    const resumed = await beginOrgWorkerMaterializationJournal(input);
    expect(resumed).toEqual(first);

    await expect(
      beginOrgWorkerMaterializationJournal({
        ...input,
        requestDigest: `sha256:${"2".repeat(64)}`,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_OPERATION_ID_CONFLICT",
      }),
    );
  });

  test("a crash after every persisted phase resumes from that exact phase", async () => {
    const projectRoot = await project();
    const operationId = "operation:phase-recovery";
    const requestDigest = `sha256:${"3".repeat(64)}` as const;
    const now = clock(
      ...Array.from(
        { length: 20 },
        (_, index) => `2026-07-24T00:00:${String(index).padStart(2, "0")}.000Z`,
      ),
    );
    await beginOrgWorkerMaterializationJournal({
      projectRoot,
      operationId,
      requestDigest,
      clock: now,
    });

    const resumablePhases = ORG_WORKER_MATERIALIZATION_PHASES.slice(
      1,
      -1,
    ) as Array<
      Parameters<typeof advanceOrgWorkerMaterializationJournal>[0]["phase"]
    >;
    for (const phase of resumablePhases) {
      await expect(
        advanceOrgWorkerMaterializationJournal({
          projectRoot,
          operationId,
          requestDigest,
          phase,
          clock: now,
          checkpoint: () => {
            throw new Error(`crash after ${phase}`);
          },
        }),
      ).rejects.toThrow(`crash after ${phase}`);
      expect(
        (await recoverOrgWorkerMaterializationJournal(projectRoot))?.phase,
      ).toBe(phase);
      expect(
        (
          await beginOrgWorkerMaterializationJournal({
            projectRoot,
            operationId,
            requestDigest,
            clock: now,
          })
        ).phase,
      ).toBe(phase);
    }
  });

  test("retains the journal until receipt and record are durable, including a completed-phase crash", async () => {
    const projectRoot = await project();
    const operationId = "operation:durability";
    const requestDigest = `sha256:${"4".repeat(64)}` as const;
    const now = clock(
      ...Array.from(
        { length: 20 },
        (_, index) => `2026-07-24T00:01:${String(index).padStart(2, "0")}.000Z`,
      ),
    );
    await beginOrgWorkerMaterializationJournal({
      projectRoot,
      operationId,
      requestDigest,
      clock: now,
    });
    const preReceiptPhases = ORG_WORKER_MATERIALIZATION_PHASES.slice(
      1,
      -2,
    ) as Array<
      Parameters<typeof advanceOrgWorkerMaterializationJournal>[0]["phase"]
    >;
    for (const phase of preReceiptPhases) {
      await advanceOrgWorkerMaterializationJournal({
        projectRoot,
        operationId,
        requestDigest,
        phase,
        clock: now,
      });
    }

    await expect(
      completeOrgWorkerMaterializationJournal({
        projectRoot,
        operationId,
        requestDigest,
        clock: now,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_OPERATION_NOT_DURABLE",
      }),
    );
    expect(
      await Bun.file(
        resolveOrgWorkerMaterializationJournalPath(projectRoot),
      ).exists(),
    ).toBe(true);

    await advanceOrgWorkerMaterializationJournal({
      projectRoot,
      operationId,
      requestDigest,
      phase: "receipt_persisted",
      clock: now,
    });
    await expect(
      completeOrgWorkerMaterializationJournal({
        projectRoot,
        operationId,
        requestDigest,
        clock: now,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_OPERATION_NOT_DURABLE",
      }),
    );
    await markOrgWorkerMaterializationRecordDurable({
      projectRoot,
      operationId,
      requestDigest,
      clock: now,
    });
    await expect(
      completeOrgWorkerMaterializationJournal({
        projectRoot,
        operationId,
        requestDigest,
        clock: now,
        checkpoint: () => {
          throw new Error("crash after completed");
        },
      }),
    ).rejects.toThrow("crash after completed");
    expect(
      (await loadOrgWorkerMaterializationJournal(projectRoot))?.phase,
    ).toBe("completed");
    expect(
      await Bun.file(
        resolveOrgWorkerMaterializationJournalPath(projectRoot),
      ).exists(),
    ).toBe(true);

    expect(
      await recoverOrgWorkerMaterializationJournal(projectRoot),
    ).toBeNull();
    expect(
      await Bun.file(
        resolveOrgWorkerMaterializationJournalPath(projectRoot),
      ).exists(),
    ).toBe(false);
  });

  test("malformed, path-bearing, and secret-bearing journals fail closed without deletion", async () => {
    const projectRoot = await project();
    const path = resolveOrgWorkerMaterializationJournalPath(projectRoot);
    for (const candidate of [
      { schema: "wrong" },
      {
        schema: "drwn.org-worker-materialization-journal",
        schemaVersion: 1,
        operationId: "/private/operation",
        requestDigest: `sha256:${"1".repeat(64)}`,
        phase: "validated",
        durability: { receiptPersisted: false, recordPersisted: false },
        createdAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
      {
        schema: "drwn.org-worker-materialization-journal",
        schemaVersion: 1,
        operationId: "operation:safe",
        requestDigest: `sha256:${"1".repeat(64)}`,
        phase: "validated",
        durability: { receiptPersisted: false, recordPersisted: false },
        createdAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:00.000Z",
        token: "not-a-real-secret",
      },
    ]) {
      await Bun.write(path, `${JSON.stringify(candidate)}\n`);
      await expect(
        loadOrgWorkerMaterializationJournal(projectRoot),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_MATERIALIZATION_JOURNAL_INVALID",
        }),
      );
      expect(await Bun.file(path).exists()).toBe(true);
    }
  });
});
