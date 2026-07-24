// ABOUTME: Proves fresh Org Worker application emits success only after sync and exact read-back.
// ABOUTME: Covers dry/no-write purity, failure recovery, replay, and request conflicts.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeWorkerArtifactGitTreeSha,
  computeWorkerArtifactTreeDigest,
  parseWorkerArtifactSnapshotV1,
} from "../cli/core/org-worker-artifact-snapshot";
import { computeCardIntegrity } from "../cli/core/card-store";
import { computeContentManifest } from "../cli/core/content-manifest";
import { serializeCardLock } from "../cli/core/card-lock";
import {
  materializeOrgWorkerProject,
  reconcileOrgWorkerProject,
  removeOrgWorkerProject,
} from "../cli/core/org-worker-materializer";
import {
  computeOrgWorkerBundleDigest,
  parseOrgWorkerBundleV1,
} from "../cli/core/org-worker-bundle-v1";
import {
  resolveOrgWorkerMaterializationJournalPath,
  resolveOrgWorkerMaterializationRecordPath,
} from "../cli/core/paths";
import {
  resolveWorkerMaterializationReceiptsRoot,
} from "../cli/core/worker-materialization-receipt";
import {
  ensureVendorTree,
  resolveProjectVendorTree,
} from "../cli/core/vendor";
import {
  buildVendorManifestSidecar,
  resolveVendorManifestSidecarPath,
  writeVendorManifestSidecar,
} from "../cli/core/vendor-manifest";
import {
  cleanupTempRoots,
  scaffoldCliFixture,
} from "./helpers";
import { hashManagedContent } from "../cli/core/write-record";

const roots: string[] = [];
afterEach(async () => {
  await cleanupTempRoots(roots);
});

async function readJson(relativePath: string) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

const packetRoot = fileURLToPath(
  new URL(
    "./fixtures/org-worker-materialization-v1/packet-root/",
    import.meta.url,
  ),
);

async function inputs() {
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const projectRoot = join(fixture.root, "fresh-project");
  await mkdir(projectRoot);
  return {
    fixture,
    projectRoot,
    bundle: parseOrgWorkerBundleV1(
      await readJson("./fixtures/org-worker-bundle-v1/gtm.valid.json"),
    ),
    snapshot: parseWorkerArtifactSnapshotV1(
      await readJson(
        "./fixtures/org-worker-materialization-v1/snapshot.valid.json",
      ),
    ),
  };
}

function operationOptions(
  input: Awaited<ReturnType<typeof inputs>>,
  operationId = "operation:gtm:materialize:1",
) {
  return {
    projectRoot: input.projectRoot,
    bundle: input.bundle,
    snapshot: input.snapshot,
    packetRoot,
    operationId,
    repoRoot: input.fixture.repoRoot,
    agentsDir: input.fixture.agentsDir,
    homeDir: input.fixture.homeDir,
    clock: () => "2026-07-24T00:00:00.000Z",
    receiptIdFactory: () => "receipt-gtm-materialize-0001",
  };
}

describe("Org Worker fresh-project materializer", () => {
  test("materializes verified bytes, syncs, reads back, then emits record and receipt", async () => {
    const input = await inputs();
    let beforeSyncReceiptExists = true;
    const result = await materializeOrgWorkerProject({
      ...operationOptions(input),
      checkpoint: async (checkpoint) => {
        if (checkpoint === "before-sync") {
          beforeSyncReceiptExists = existsSync(
            resolveWorkerMaterializationReceiptsRoot(
              input.projectRoot,
            ),
          );
        }
      },
    });

    expect(beforeSyncReceiptExists).toBe(false);
    expect(result).toMatchObject({
      applied: true,
      replayed: false,
      receipt: {
        receiptVersion: "worker-materialization-receipt@1",
        action: "materialize",
        outcome: "verified",
        operationId: "operation:gtm:materialize:1",
        verifiedConsentIds: ["consent:gtm-instructions"],
      },
    });
    const lock = JSON.parse(
      await readFile(
        join(input.projectRoot, ".agents", "drwn", "card.lock"),
        "utf8",
      ),
    );
    const card = lock.cards[0];
    expect(
      existsSync(
        resolveProjectVendorTree(
          input.projectRoot,
          card.name,
          card.treeSha,
        ),
      ),
    ).toBe(true);
    expect(
      await readFile(join(input.projectRoot, "AGENTS.md"), "utf8"),
    ).toContain("reviewed instructions");
    expect(
      existsSync(
        resolveOrgWorkerMaterializationRecordPath(input.projectRoot),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolveOrgWorkerMaterializationJournalPath(input.projectRoot),
      ),
    ).toBe(false);
  });

  test("dry-run and no-write validate without creating project state or operation evidence", async () => {
    for (const mode of ["dryRun", "noWrite"] as const) {
      const input = await inputs();
      const result = await materializeOrgWorkerProject({
        ...operationOptions(input, `operation:${mode}`),
        [mode]: true,
      });

      expect(result.applied).toBe(false);
      expect(existsSync(join(input.projectRoot, ".agents"))).toBe(false);
      expect(
        existsSync(
          resolveWorkerMaterializationReceiptsRoot(input.projectRoot),
        ),
      ).toBe(false);
    }
  });

  test("sync failure and read-back mismatch retain recovery journal without success evidence", async () => {
    for (const failure of [
      "sync",
      "config-read-back",
      "vendor-read-back",
      "raw-vendor-read-back",
    ] as const) {
      const input = await inputs();
      await expect(
        materializeOrgWorkerProject({
          ...operationOptions(input, `operation:failure:${failure}`),
          ...(failure === "sync"
            ? {
                dependencies: {
                  syncRepository: async () => {
                    throw new Error("injected sync failure");
                  },
                },
              }
            : {
                checkpoint: async (checkpoint) => {
                  if (checkpoint === "after-sync") {
                    if (failure === "config-read-back") {
                      await writeFile(
                        join(
                          input.projectRoot,
                          ".agents",
                          "drwn",
                          "config.json",
                        ),
                        "{}\n",
                      );
                    } else {
                      const card = input.snapshot.artifacts[0]!;
                      await writeFile(
                        join(
                          resolveProjectVendorTree(
                            input.projectRoot,
                            card.name,
                            card.treeSha,
                          ),
                          "instructions.md",
                        ),
                        failure === "raw-vendor-read-back"
                          ? "reviewed instructions\r\n"
                          : "corrupted instructions\n",
                      );
                    }
                  }
                },
              }),
        }),
      ).rejects.toThrow(
        failure === "sync"
          ? /injected sync failure/
          : expect.objectContaining({
              code: "ORG_WORKER_MATERIALIZATION_DRIFT",
            }),
      );
      expect(
        existsSync(
          resolveWorkerMaterializationReceiptsRoot(input.projectRoot),
        ),
      ).toBe(false);
      expect(
        existsSync(
          resolveOrgWorkerMaterializationRecordPath(input.projectRoot),
        ),
      ).toBe(false);
      expect(
        existsSync(
          resolveOrgWorkerMaterializationJournalPath(input.projectRoot),
        ),
      ).toBe(true);
    }
  });

  test("serializes the complete operation under one project owner lock", async () => {
    for (const secondOperationId of [
      "operation:gtm:materialize:1",
      "operation:gtm:materialize:2",
    ]) {
      const input = await inputs();
      let release!: () => void;
      let entered!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const atSync = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const first = materializeOrgWorkerProject({
        ...operationOptions(input),
        checkpoint: async (checkpoint) => {
          if (checkpoint === "before-sync") {
            entered();
            await blocked;
          }
        },
      });
      await atSync;
      await expect(
        materializeOrgWorkerProject(
          operationOptions(input, secondOperationId),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "PROJECT_STATE_TRANSACTION_BUSY",
        }),
      );
      release();
      await expect(first).resolves.toMatchObject({ applied: true });
    }
  });

  test("recovers a matching incomplete operation by restoring expected project state", async () => {
    const input = await inputs();
    const options = operationOptions(input);
    await expect(
      materializeOrgWorkerProject({
        ...options,
        dependencies: {
          syncRepository: async () => {
            throw new Error("stop after project commit");
          },
        },
      }),
    ).rejects.toThrow(/stop after project commit/);
    await writeFile(
      join(input.projectRoot, ".agents", "drwn", "config.json"),
      "{}\n",
    );

    await expect(
      materializeOrgWorkerProject(options),
    ).resolves.toMatchObject({ applied: true, replayed: false });
  });

  test("recovers crashes after receipt and record durability boundaries without duplicating evidence", async () => {
    for (const crashPoint of [
      "after-receipt",
      "after-record",
    ] as const) {
      const input = await inputs();
      const options = operationOptions(
        input,
        `operation:crash:${crashPoint}`,
      );
      await expect(
        materializeOrgWorkerProject({
          ...options,
          checkpoint: async (checkpoint) => {
            if (checkpoint === crashPoint) {
              throw new Error(`injected ${crashPoint} crash`);
            }
          },
        }),
      ).rejects.toThrow(`injected ${crashPoint} crash`);

      const recovered = await materializeOrgWorkerProject(options);
      expect(recovered).toMatchObject({
        applied: true,
        replayed: true,
        receipt: { receiptId: "receipt-gtm-materialize-0001" },
      });
      expect(
        existsSync(
          resolveOrgWorkerMaterializationJournalPath(
            input.projectRoot,
          ),
        ),
      ).toBe(false);
      expect(
        (
          await Array.fromAsync(
            new Bun.Glob("*.json").scan(
              resolveWorkerMaterializationReceiptsRoot(
                input.projectRoot,
              ),
            ),
          )
        ).length,
      ).toBe(1);
    }
  });

  test("fails closed on hook consent until hook projection evidence is supported", async () => {
    const input = await inputs();
    const bundle = parseOrgWorkerBundleV1({
      ...structuredClone(input.bundle),
      contributionConsents: [
        ...input.bundle.contributionConsents,
        {
          consentId: "consent:gtm-hooks",
          workerId: input.bundle.workerId,
          artifactPinRef: "artifact:gtm-worker-root",
          contributionKind: "hooks",
          contentDigest: `sha256:${"0".repeat(64)}`,
          consentedVersionRange: ">=1.0.0 <2.0.0",
          ratifierRef: "actor:gtm-owner",
          evidenceRefs: ["evidence:gtm-hook-consent"],
          projectionSurface: "worker_lifecycle_hooks",
        },
      ],
    });
    const snapshot = parseWorkerArtifactSnapshotV1({
      ...structuredClone(input.snapshot),
      sourceBundleDigest: computeOrgWorkerBundleDigest(bundle),
    });

    await expect(
      materializeOrgWorkerProject({
        ...operationOptions(input),
        bundle,
        snapshot,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_HOOK_CONSENT_UNSUPPORTED",
      }),
    );
    expect(existsSync(join(input.projectRoot, ".agents"))).toBe(false);
  });

  test("binds projection and verified consent to the selected root in a multi-root bundle", async () => {
    const input = await inputs();
    const customPacket = join(input.fixture.root, "multi-root-packet");
    await cp(packetRoot, customPacket, { recursive: true });
    const secondRoot = join(
      customPacket,
      "artifacts",
      "other-worker-root",
    );
    await cp(
      join(customPacket, "artifacts", "gtm-worker-root"),
      secondRoot,
      { recursive: true },
    );
    await writeFile(
      join(secondRoot, "card.json"),
      '{"name":"other-worker","version":"1.0.0","kind":"blueprint","instructions":{"path":"instructions.md"}}\n',
    );
    const secondIntegrity = (
      await computeCardIntegrity(secondRoot)
    ).replace("sha256-", "sha256:");
    const [secondTree, secondGitTree] = await Promise.all([
      computeWorkerArtifactTreeDigest(secondRoot),
      computeWorkerArtifactGitTreeSha(secondRoot),
    ]);
    const bundle = parseOrgWorkerBundleV1({
      ...structuredClone(input.bundle),
      artifactPins: [
        ...input.bundle.artifactPins,
        {
          artifactId: "artifact:other-worker-root",
          kind: "worker_root",
          name: "other-worker",
          version: "1.0.0",
          integrity: secondIntegrity,
          origin: "git:approved/other-worker",
          provenanceRefs: ["provenance:other-worker-root"],
          resolutionSnapshotRef: "resolution:other-worker-root",
        },
      ],
      orderedWorkerRoots: [
        "artifact:gtm-worker-root",
        "artifact:other-worker-root",
      ],
      activeWorkerRoot: "artifact:other-worker-root",
      contributionConsents: [
        ...input.bundle.contributionConsents,
        {
          ...input.bundle.contributionConsents[0],
          consentId: "consent:other-instructions",
          artifactPinRef: "artifact:other-worker-root",
        },
      ],
    });
    const snapshot = parseWorkerArtifactSnapshotV1({
      ...structuredClone(input.snapshot),
      sourceBundleDigest: computeOrgWorkerBundleDigest(bundle),
      artifacts: [
        ...input.snapshot.artifacts,
        {
          artifactPinRef: "artifact:other-worker-root",
          kind: "worker_root",
          name: "other-worker",
          version: "1.0.0",
          integrity: secondIntegrity,
          treeSha: secondGitTree,
          gitCommit: "c".repeat(40),
          contentFormat: "darwinian-card-tree-directory@1",
          contentTreeDigest: secondTree.digest,
          contentPath: "artifacts/other-worker-root",
        },
      ],
    });

    const result = await materializeOrgWorkerProject({
      ...operationOptions(input, "operation:multi-root"),
      bundle,
      snapshot,
      packetRoot: customPacket,
    });

    expect(result.receipt).toMatchObject({
      projectState: {
        orderedRootNames: ["gtm-worker", "other-worker"],
        activeWorker: "other-worker",
      },
      instructionProjection: {
        instructionId: "worker:other-worker",
      },
      verifiedConsentIds: [
        "consent:gtm-instructions",
        "consent:other-instructions",
      ],
    });
    expect(
      await readFile(join(input.projectRoot, "AGENTS.md"), "utf8"),
    ).toContain("Instruction-ID: worker:other-worker");
  });

  test("same operation/request replays one receipt while changed request conflicts", async () => {
    const input = await inputs();
    const options = operationOptions(input);
    const first = await materializeOrgWorkerProject(options);
    const repeated = await materializeOrgWorkerProject(options);
    expect(repeated).toMatchObject({
      applied: true,
      replayed: true,
      receipt: first.receipt,
    });
    expect(
      (
        await Array.fromAsync(
          new Bun.Glob("*.json").scan(
            resolveWorkerMaterializationReceiptsRoot(input.projectRoot),
          ),
        )
      ).length,
    ).toBe(1);

    const changedBundle = parseOrgWorkerBundleV1({
      ...structuredClone(input.bundle),
      sourceBlueprint: {
        ...input.bundle.sourceBlueprint,
        revision: 2,
      },
    });
    const changedSnapshot = parseWorkerArtifactSnapshotV1({
      ...structuredClone(input.snapshot),
      sourceBundleDigest: computeOrgWorkerBundleDigest(changedBundle),
    });
    await expect(
      materializeOrgWorkerProject({
        ...options,
        bundle: changedBundle,
        snapshot: changedSnapshot,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_OPERATION_ID_CONFLICT",
      }),
    );

    const card = input.snapshot.artifacts[0]!;
    await writeFile(
      join(
        resolveProjectVendorTree(
          input.projectRoot,
          card.name,
          card.treeSha,
        ),
        "instructions.md",
      ),
      "post-receipt drift\n",
    );
    await expect(materializeOrgWorkerProject(options)).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_MATERIALIZATION_DRIFT",
      }),
    );
  });

  test("reconcile repairs only record-owned drift and replays idempotently", async () => {
    const input = await inputs();
    await materializeOrgWorkerProject(operationOptions(input));
    const card = input.snapshot.artifacts[0]!;
    const instructionsPath = join(
      resolveProjectVendorTree(
        input.projectRoot,
        card.name,
        card.treeSha,
      ),
      "instructions.md",
    );
    await writeFile(instructionsPath, "drifted vendor\n");
    const options = {
      ...operationOptions(input, "operation:reconcile:1"),
      receiptIdFactory: () => "receipt-reconcile-0001",
    };

    const repaired = await reconcileOrgWorkerProject(options);
    expect(repaired).toMatchObject({
      applied: true,
      replayed: false,
      receipt: { action: "reconcile", outcome: "verified" },
    });
    expect(await readFile(instructionsPath, "utf8")).toBe(
      "reviewed instructions\n",
    );
    const replay = await reconcileOrgWorkerProject(options);
    expect(replay).toMatchObject({
      applied: true,
      replayed: true,
      receipt: repaired.receipt,
    });
  });

  test("reconcile preserves an unrelated valid project state change", async () => {
    const input = await inputs();
    await materializeOrgWorkerProject(operationOptions(input));
    const configPath = join(
      input.projectRoot,
      ".agents",
      "drwn",
      "config.json",
    );
    const unrelated = `${
      JSON.stringify(
        {
          schema: "drwn.project-config",
          schemaVersion: 1,
          workers: [],
          activeWorker: null,
        },
        null,
        2,
      )
    }\n`;
    await writeFile(configPath, unrelated);

    await expect(
      reconcileOrgWorkerProject({
        ...operationOptions(input, "operation:reconcile:conflict"),
        receiptIdFactory: () => "receipt-reconcile-conflict",
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_MATERIALIZATION_DRIFT",
      }),
    );
    expect(await readFile(configPath, "utf8")).toBe(unrelated);
  });

  test("remove deletes only proven owned state, retains a chained tombstone, and replays", async () => {
    const input = await inputs();
    const materialized = await materializeOrgWorkerProject(
      operationOptions(input),
    );
    const options = {
      ...operationOptions(input, "operation:remove:1"),
      receiptIdFactory: () => "receipt-remove-0001",
    };

    const removed = await removeOrgWorkerProject(options);
    expect(removed).toMatchObject({
      applied: true,
      replayed: false,
      receipt: {
        action: "remove",
        outcome: "removed",
      },
    });
    expect(removed.receipt?.priorReceiptDigest).toBeDefined();
    expect(materialized.receipt?.receiptId).toBe(
      "receipt-gtm-materialize-0001",
    );
    const config = JSON.parse(
      await readFile(
        join(input.projectRoot, ".agents", "drwn", "config.json"),
        "utf8",
      ),
    );
    const lock = JSON.parse(
      await readFile(
        join(input.projectRoot, ".agents", "drwn", "card.lock"),
        "utf8",
      ),
    );
    expect(config).toMatchObject({ workers: [], activeWorker: null });
    expect(lock).toMatchObject({ workerRoots: [], cards: [] });
    const record = JSON.parse(
      await readFile(
        resolveOrgWorkerMaterializationRecordPath(
          input.projectRoot,
        ),
        "utf8",
      ),
    );
    expect(record).toMatchObject({
      materializationState: "removed",
      instructionConsentEvidence: [],
      lastVerifiedReceiptId: "receipt-remove-0001",
    });
    expect(
      await removeOrgWorkerProject(options),
    ).toMatchObject({
      applied: true,
      replayed: true,
      receipt: removed.receipt,
    });
  });

  test("remove resumes at every mutation durability boundary", async () => {
    for (const crashPoint of [
      "before-sync",
      "after-sync",
      "after-receipt",
      "after-record",
    ] as const) {
      const input = await inputs();
      await materializeOrgWorkerProject(operationOptions(input));
      const options = {
        ...operationOptions(input, `operation:remove:${crashPoint}`),
        receiptIdFactory: () => `receipt-remove-${crashPoint}`,
      };
      await expect(
        removeOrgWorkerProject({
          ...options,
          checkpoint: async (checkpoint) => {
            if (checkpoint === crashPoint) {
              throw new Error(`crash at ${crashPoint}`);
            }
          },
        }),
      ).rejects.toThrow(`crash at ${crashPoint}`);

      const recovered = await removeOrgWorkerProject(options);
      expect(recovered).toMatchObject({
        applied: true,
        receipt: { action: "remove", outcome: "removed" },
      });
      expect(
        existsSync(
          resolveOrgWorkerMaterializationJournalPath(
            input.projectRoot,
          ),
        ),
      ).toBe(false);
    }
  });

  test("remove fails before project mutation on projection, vendor, or sidecar ownership drift", async () => {
    for (const driftKind of [
      "instructions",
      "vendor-missing",
      "sidecar-missing",
    ] as const) {
      const input = await inputs();
      await materializeOrgWorkerProject(operationOptions(input));
      const configPath = join(
        input.projectRoot,
        ".agents",
        "drwn",
        "config.json",
      );
      const lockPath = join(
        input.projectRoot,
        ".agents",
        "drwn",
        "card.lock",
      );
      const [configBefore, lockBefore] = await Promise.all([
        readFile(configPath, "utf8"),
        readFile(lockPath, "utf8"),
      ]);
      const artifact = input.snapshot.artifacts[0]!;
      const vendorDir = resolveProjectVendorTree(
        input.projectRoot,
        artifact.name,
        artifact.treeSha,
      );
      if (driftKind === "instructions") {
        const agentsPath = join(input.projectRoot, "AGENTS.md");
        await writeFile(
          agentsPath,
          (await readFile(agentsPath, "utf8")).replace(
            "reviewed instructions",
            "tampered instructions",
          ),
        );
      } else if (driftKind === "vendor-missing") {
        await rm(vendorDir, { recursive: true });
      } else {
        await rm(
          resolveVendorManifestSidecarPath(
            input.projectRoot,
            artifact.name,
            artifact.treeSha,
          ),
        );
      }

      await expect(
        removeOrgWorkerProject({
          ...operationOptions(input, `operation:remove:${driftKind}`),
          receiptIdFactory: () => `receipt-remove-${driftKind}`,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "ORG_WORKER_REMOVAL_OWNERSHIP_DRIFT",
        }),
      );
      expect(await readFile(configPath, "utf8")).toBe(configBefore);
      expect(await readFile(lockPath, "utf8")).toBe(lockBefore);
    }
  });

  test("remove preserves an unrelated active root, local consent, overlay fields, and user instruction bytes", async () => {
    const input = await inputs();
    await materializeOrgWorkerProject(operationOptions(input));
    const unrelatedRoot = join(input.fixture.root, "unrelated-worker");
    await mkdir(unrelatedRoot);
    const unrelatedInstructions =
      "unrelated local instructions\n";
    await writeFile(
      join(unrelatedRoot, "card.json"),
      '{"name":"unrelated-worker","version":"1.0.0","instructions":{"path":"instructions.md"}}\n',
    );
    await writeFile(
      join(unrelatedRoot, "instructions.md"),
      unrelatedInstructions,
    );
    const unrelatedIntegrity = await computeCardIntegrity(
      unrelatedRoot,
    );
    const unrelatedTreeSha =
      await computeWorkerArtifactGitTreeSha(unrelatedRoot);
    const unrelatedManifest = JSON.parse(
      await readFile(join(unrelatedRoot, "card.json"), "utf8"),
    );
    const unrelatedCard = {
      name: "unrelated-worker",
      requested: "unrelated-worker@1.0.0",
      version: "1.0.0",
      path: unrelatedRoot,
      integrity: unrelatedIntegrity,
      treeSha: unrelatedTreeSha,
      manifest: unrelatedManifest,
      skills: [],
      hooks: [],
      instructionConsent: {
        consentedAt: "2026-07-24T00:00:00.000Z",
        consentedRange: "1.0.0",
        contentDigest: hashManagedContent(unrelatedInstructions),
      },
      registry: null,
      origin: "git",
      git: { commit: "d".repeat(40) },
    };
    const lockPath = join(
      input.projectRoot,
      ".agents",
      "drwn",
      "card.lock",
    );
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.workerRoots.push({
      name: unrelatedCard.name,
      requested: unrelatedCard.requested,
      kind: "card",
      members: [],
    });
    lock.cards.push(unrelatedCard);
    await writeFile(lockPath, serializeCardLock(lock));
    const configPath = join(
      input.projectRoot,
      ".agents",
      "drwn",
      "config.json",
    );
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.workers.push(unrelatedCard.requested);
    config.activeWorker = unrelatedCard.name;
    config.targets = { cursor: { enabled: false } };
    await writeFile(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
    );
    const unrelatedManifestBytes =
      await computeContentManifest(unrelatedRoot);
    const unrelatedVendor = resolveProjectVendorTree(
      input.projectRoot,
      unrelatedCard.name,
      unrelatedTreeSha,
    );
    await ensureVendorTree({
      projectRoot: input.projectRoot,
      storeDir: unrelatedRoot,
      vendorDir: unrelatedVendor,
      manifest: unrelatedManifestBytes,
    });
    await writeVendorManifestSidecar(
      resolveVendorManifestSidecarPath(
        input.projectRoot,
        unrelatedCard.name,
        unrelatedTreeSha,
      ),
      buildVendorManifestSidecar(
        unrelatedCard as any,
        unrelatedManifestBytes,
      ),
    );
    const agentsPath = join(input.projectRoot, "AGENTS.md");
    await writeFile(
      agentsPath,
      `# user-owned preface\n\n${await readFile(agentsPath, "utf8")}`,
    );

    const removeOptions = {
      ...operationOptions(input, "operation:remove:unrelated"),
      receiptIdFactory: () => "receipt-remove-unrelated",
    };
    await expect(
      removeOrgWorkerProject({
        ...removeOptions,
        checkpoint: async (checkpoint) => {
          if (checkpoint === "after-record") {
            throw new Error("unrelated-root crash after record");
          }
        },
      }),
    ).rejects.toThrow("unrelated-root crash after record");
    const removed = await removeOrgWorkerProject(removeOptions);

    const nextConfig = JSON.parse(
      await readFile(configPath, "utf8"),
    );
    const nextLock = JSON.parse(await readFile(lockPath, "utf8"));
    expect(nextConfig).toMatchObject({
      workers: ["unrelated-worker@1.0.0"],
      activeWorker: "unrelated-worker",
      targets: { cursor: { enabled: false } },
    });
    expect(nextLock.workerRoots.map(({ name }: any) => name)).toEqual([
      "unrelated-worker",
    ]);
    expect(nextLock.cards.map(({ name }: any) => name)).toEqual([
      "unrelated-worker",
    ]);
    expect(existsSync(unrelatedVendor)).toBe(true);
    const agents = await readFile(agentsPath, "utf8");
    expect(agents).toContain("# user-owned preface");
    expect(agents).toContain(
      "Instruction-ID: worker:unrelated-worker",
    );
    expect(agents).not.toContain("Instruction-ID: worker:gtm-worker");
    expect(removed.receipt).toMatchObject({
      action: "remove",
      outcome: "removed",
      projectState: {
        orderedRootNames: ["unrelated-worker"],
        activeWorker: "unrelated-worker",
      },
    });
    await expect(
      removeOrgWorkerProject({
        ...removeOptions,
      }),
    ).resolves.toMatchObject({ replayed: true });
  });
});
