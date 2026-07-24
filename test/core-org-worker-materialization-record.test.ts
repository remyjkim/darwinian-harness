// ABOUTME: Verifies bounded Worker-local materialization evidence and exact lock binding.
// ABOUTME: Rejects paths, content, secrets, ambiguous pins, and stale artifact identity.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  serializeCardLock,
  type ProjectLockV1,
} from "../cli/core/card-lock";
import {
  loadOrgWorkerInstructionConsentContext,
  loadOrgWorkerMaterializationRecord,
  parseOrgWorkerMaterializationRecord,
  serializeOrgWorkerMaterializationRecord,
  writeOrgWorkerMaterializationRecord,
} from "../cli/core/org-worker-materialization-record";
import {
  resolveOrgWorkerMaterializationJournalPath,
  resolveOrgWorkerMaterializationRecordPath,
} from "../cli/core/paths";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

function validRecord() {
  const project = matchingProjectState();
  return {
    schema: "drwn.org-worker-materialization",
    schemaVersion: 1,
    sourceBundle: {
      digest:
        "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
      workerId: "worker:gtm-operator",
      blueprintId: "blueprint:gtm:1",
      blueprintRevision: 1,
      blueprintDigest:
        "sha256:82dcd59fc1a465304d8efeffe15a3213f44f2ba0b98be180e78512d287250d31",
    },
    projectState: {
      configDigest: digest(project.configBytes),
      lockDigest: digest(project.lockBytes),
      orderedRootNames: ["gtm-worker"],
      activeWorker: "gtm-worker",
    },
    artifactBindings: [
      {
        artifactPinRef: "artifact:gtm-worker-root",
        cardName: "gtm-worker",
        version: "1.0.0",
        integrity:
          "sha256-dc71165b300a88ab4bafd0bc6a32dc82afe106ac2b40102ac08cd74985edc092",
        treeSha: "1fb0a826d6fc73bb52c0a22e6e2925e2783701a5",
        gitCommit: "bbd7924d12a1cf8818755ea49c1858875e7bdac7",
      },
    ],
    instructionConsentEvidence: [
      {
        consentId: "consent:gtm-instructions",
        artifactPinRef: "artifact:gtm-worker-root",
        contentDigest:
          "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
        consentedRange: ">=1.0.0 <2.0.0",
        ratifierRef: "actor:gtm-owner",
        evidenceRefs: ["evidence:gtm-instruction-consent"],
      },
    ],
    projection: {
      instructionId: "worker:gtm-worker",
      contentDigest:
        "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
      ownershipHash: `sha256-${"4".repeat(64)}`,
      adapterState: "owned",
    },
    lastVerifiedReceiptId: "receipt:gtm-materialization:1",
  };
}

function digest(bytes: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function matchingLock(): ProjectLockV1 {
  return {
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: "0.8.0" },
    workerRoots: [
      {
        name: "gtm-worker",
        requested: "gtm-worker@1.0.0",
        kind: "blueprint",
        members: [],
      },
    ],
    cards: [
      {
        name: "gtm-worker",
        requested: "gtm-worker@1.0.0",
        version: "1.0.0",
        path: "/transient/not-recorded",
        integrity:
          "sha256-dc71165b300a88ab4bafd0bc6a32dc82afe106ac2b40102ac08cd74985edc092",
        treeSha: "1fb0a826d6fc73bb52c0a22e6e2925e2783701a5",
        manifest: {
          name: "gtm-worker",
          version: "1.0.0",
          kind: "blueprint",
          instructions: { text: "fixture-only" },
        },
        skills: [],
        hooks: [],
        registry: null,
        origin: "git",
        git: {
          commit: "bbd7924d12a1cf8818755ea49c1858875e7bdac7",
        },
      },
    ],
  };
}

function matchingProjectState() {
  const lock = matchingLock();
  return {
    configBytes:
      '{\n' +
      '  "schema": "drwn.project-config",\n' +
      '  "schemaVersion": 1,\n' +
      '  "workers": [\n' +
      '    "gtm-worker@1.0.0"\n' +
      "  ],\n" +
      '  "activeWorker": "gtm-worker"\n' +
      "}\n",
    lockBytes: serializeCardLock({
      workerRoots: lock.workerRoots,
      cards: lock.cards,
    }),
    lock,
  };
}

describe("Org Worker materialization record", () => {
  test("strictly parses and deterministically serializes bounded observed state", () => {
    const parsed = parseOrgWorkerMaterializationRecord(validRecord());
    const first = serializeOrgWorkerMaterializationRecord(parsed);
    const second = serializeOrgWorkerMaterializationRecord(
      parseOrgWorkerMaterializationRecord(JSON.parse(first)),
    );

    expect(second).toBe(first);
    expect(first).not.toContain("/transient");
    expect(first).not.toContain("fixture-only");
    expect(first).not.toMatch(/apiKey|password|secret|token|readiness/i);
  });

  test("rejects malformed, path-bearing, content-bearing, secret-bearing, unsorted, and ambiguous records", () => {
    const candidates = [
      { ...validRecord(), schemaVersion: 2 },
      { ...validRecord(), instructionBody: "private instruction content" },
      { ...validRecord(), apiKey: "not-a-real-secret" },
      {
        ...validRecord(),
        artifactBindings: [
          {
            ...validRecord().artifactBindings[0],
            cardName: "/private/absolute-card",
          },
        ],
      },
      {
        ...validRecord(),
        artifactBindings: [
          {
            ...validRecord().artifactBindings[0],
            artifactPinRef: "artifact:/private/absolute-pin",
          },
        ],
      },
      {
        ...validRecord(),
        artifactBindings: [
          {
            ...validRecord().artifactBindings[0],
            artifactPinRef: "artifact:z",
          },
          {
            ...validRecord().artifactBindings[0],
            artifactPinRef: "artifact:a",
          },
        ],
      },
      {
        ...validRecord(),
        artifactBindings: [
          validRecord().artifactBindings[0],
          validRecord().artifactBindings[0],
        ],
      },
      {
        ...validRecord(),
        instructionConsentEvidence: [
          {
            ...validRecord().instructionConsentEvidence[0],
            artifactPinRef: "artifact:missing",
          },
        ],
      },
      {
        ...validRecord(),
        instructionConsentEvidence: [
          {
            ...validRecord().instructionConsentEvidence[0],
            consentId: "consent:z",
          },
          {
            ...validRecord().instructionConsentEvidence[0],
            consentId: "consent:a",
          },
        ],
      },
      {
        ...validRecord(),
        instructionConsentEvidence: [
          {
            ...validRecord().instructionConsentEvidence[0],
            evidenceRefs: ["evidence:z", "evidence:a"],
          },
        ],
      },
    ];

    for (const candidate of candidates) {
      expect(() =>
        parseOrgWorkerMaterializationRecord(candidate),
      ).toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_MATERIALIZATION_RECORD_INVALID",
        }),
      );
    }
  });

  test("writes atomically and reconstructs external consent only after exact lock comparison", async () => {
    const projectRoot = await mkdtemp(
      join(tmpdir(), "org-worker-record-"),
    );
    roots.push(projectRoot);
    const parsed = parseOrgWorkerMaterializationRecord(validRecord());
    await writeOrgWorkerMaterializationRecord(projectRoot, parsed);

    expect(
      await loadOrgWorkerMaterializationRecord(projectRoot),
    ).toEqual(parsed);
    expect(
      await loadOrgWorkerInstructionConsentContext({
        projectRoot,
        ...matchingProjectState(),
      }),
    ).toEqual({
      workerId: "worker:gtm-operator",
      artifactPinRefsByCard: {
        "gtm-worker": "artifact:gtm-worker-root",
      },
      evidence: [
        {
          kind: "org_worker_bundle_consent",
          bundleDigest:
            "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
          sourceBlueprint: {
            id: "blueprint:gtm:1",
            revision: 1,
            digest:
              "sha256:82dcd59fc1a465304d8efeffe15a3213f44f2ba0b98be180e78512d287250d31",
          },
          consentId: "consent:gtm-instructions",
          workerId: "worker:gtm-operator",
          artifactPinRef: "artifact:gtm-worker-root",
          consentedRange: ">=1.0.0 <2.0.0",
          contentDigest:
            "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
          ratifierRef: "actor:gtm-owner",
          evidenceRefs: ["evidence:gtm-instruction-consent"],
          projectionSurface: "worker_instructions",
        },
      ],
    });

    const drifted = matchingLock();
    drifted.cards[0]!.integrity = `sha256-${"0".repeat(64)}`;
    await expect(
      loadOrgWorkerInstructionConsentContext({
        projectRoot,
        configBytes: matchingProjectState().configBytes,
        lockBytes: serializeCardLock({
          workerRoots: drifted.workerRoots,
          cards: drifted.cards,
        }),
        lock: drifted,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_MATERIALIZATION_DRIFT",
      }),
    );
  });

  test("removed-state evidence can never rehydrate organization consent", async () => {
    const projectRoot = await mkdtemp(
      join(tmpdir(), "org-worker-record-removed-"),
    );
    roots.push(projectRoot);
    const removed = {
      ...validRecord(),
      materializationState: "removed",
      projectState: {
        configDigest: `sha256:${"1".repeat(64)}`,
        lockDigest: `sha256:${"2".repeat(64)}`,
        orderedRootNames: [],
        activeWorker: null,
      },
      instructionConsentEvidence: [],
      projection: {
        instructionId: null,
        contentDigest: null,
        ownershipHash: null,
        adapterState: "absent",
      },
    };
    await writeOrgWorkerMaterializationRecord(projectRoot, removed);

    await expect(
      loadOrgWorkerInstructionConsentContext({
        projectRoot,
        configBytes: "{}\n",
        lockBytes: "{}\n",
        lock: null,
      }),
    ).resolves.toBeNull();
  });

  test("rejects same Card identities under changed config or unrelated lock consent", async () => {
    const projectRoot = await mkdtemp(
      join(tmpdir(), "org-worker-record-state-drift-"),
    );
    roots.push(projectRoot);
    await writeOrgWorkerMaterializationRecord(
      projectRoot,
      validRecord(),
    );
    const current = matchingProjectState();
    const changedConfig = current.configBytes.replace(
      '"activeWorker": "gtm-worker"',
      '"activeWorker": null',
    );
    const changedLock = {
      ...current.lock,
      cards: current.lock.cards.map((card) => ({
        ...card,
        instructionConsent: {
          consentedAt: "2026-07-24T00:00:00.000Z",
          consentedRange: "^1.0.0",
          contentDigest:
            "sha256-5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429" as const,
        },
      })),
    };
    const changedLockBytes = serializeCardLock({
      workerRoots: changedLock.workerRoots,
      cards: changedLock.cards,
    });

    for (const state of [
      { ...current, configBytes: changedConfig },
      {
        ...current,
        lock: changedLock,
        lockBytes: changedLockBytes,
      },
    ]) {
      await expect(
        loadOrgWorkerInstructionConsentContext({
          projectRoot,
          ...state,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_MATERIALIZATION_DRIFT",
        }),
      );
    }
  });

  test("uses explicit ignored runtime paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "org-worker-paths-"));
    roots.push(root);
    expect(resolveOrgWorkerMaterializationRecordPath(root)).toBe(
      join(root, ".agents", "drwn", "org-worker-materialization.json"),
    );
    expect(resolveOrgWorkerMaterializationJournalPath(root)).toBe(
      join(
        root,
        ".agents",
        "drwn",
        ".org-worker-materialization-journal.json",
      ),
    );
    await writeOrgWorkerMaterializationRecord(
      root,
      parseOrgWorkerMaterializationRecord(validRecord()),
    );
    expect(
      await readFile(resolveOrgWorkerMaterializationRecordPath(root), "utf8"),
    ).toBe(serializeOrgWorkerMaterializationRecord(validRecord()));
  });
});
