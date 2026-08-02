// ABOUTME: Applies a verified Org Worker packet to a fresh project without network resolution.
// ABOUTME: Emits success evidence only after exact state, vendor, projection, and ownership read-back.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { computeContentManifest } from "./content-manifest";
import { DrwnError } from "./errors";
import { withOrderedProjectOwnerLock } from "./inventory-lock";
import {
  advanceOrgWorkerMaterializationJournal,
  beginOrgWorkerMaterializationJournal,
  completeOrgWorkerMaterializationJournal,
  loadOrgWorkerMaterializationJournal,
  markOrgWorkerMaterializationRecordDurable,
  ORG_WORKER_MATERIALIZATION_PHASES,
  type OrgWorkerMaterializationJournalV1,
  type OrgWorkerMaterializationPhase,
} from "./org-worker-materialization-journal";
import {
  deriveFreshOrgWorkerMaterializationPlan,
  type OrgWorkerMaterializationPlan,
} from "./org-worker-materialization-plan";
import {
  loadOrgWorkerMaterializationRecord,
  writeOrgWorkerMaterializationRecord,
  type OrgWorkerMaterializationRecordV1,
} from "./org-worker-materialization-record";
import {
  canonicalJson,
  computeWorkerArtifactGitTreeSha,
  computeWorkerArtifactSnapshotDigest,
  computeWorkerArtifactTreeDigest,
  verifyWorkerArtifactSnapshot,
  type WorkerArtifactSnapshotV1,
  type VerifiedWorkerArtifactSnapshotV1,
} from "./org-worker-artifact-snapshot";
import {
  computeOrgWorkerBundleDigest,
  type OrgWorkerBundleV1,
  verifyOrgWorkerBundleInstructions,
} from "./org-worker-bundle-v1";
import { assertOrgWorkerCompatibility } from "./org-worker-compatibility";
import { parseManagedBlock } from "./managed-block";
import {
  serializeCardLock,
  validateCardLockfile,
} from "./card-lock";
import { validateProjectConfig } from "./project";
import { commitProjectState, transactionPaths } from "./project-state-transaction";
import {
  composeConsentedInstructions,
  INSTRUCTION_BLOCK_MARKERS,
} from "./sync-instructions";
import { syncRepository } from "./sync";
import type { SyncOptions, SyncResult } from "./types";
import {
  ensureVendorTree,
  resolveProjectVendorTree,
} from "./vendor";
import {
  buildVendorManifestSidecar,
  loadVendorManifestSidecar,
  resolveVendorManifestSidecarPath,
  validateSidecarSelfConsistency,
  verifyVendorTreeAgainstLock,
  writeVendorManifestSidecar,
} from "./vendor-manifest";
import { DRWN_VERSION } from "./version";
import {
  hashManagedContent,
  hashManagedDirectory,
  loadWriteRecord,
  resolveProjectWriteRecordPath,
  type ManagedPath,
} from "./write-record";
import {
  computeWorkerMaterializationReceiptDigest,
  findWorkerMaterializationReceiptByOperation,
  parseWorkerMaterializationReceipt,
  persistWorkerMaterializationReceipt,
  resolveWorkerMaterializationReceiptPath,
  type WorkerMaterializationReceiptV1,
} from "./worker-materialization-receipt";

export type OrgWorkerMaterializationCheckpoint =
  | "before-sync"
  | "after-sync"
  | "after-receipt"
  | "after-record";

export interface MaterializeOrgWorkerProjectOptions {
  projectRoot: string;
  bundle: OrgWorkerBundleV1;
  snapshot: WorkerArtifactSnapshotV1;
  packetRoot: string;
  operationId: string;
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  dryRun?: boolean;
  noWrite?: boolean;
  clock: () => string;
  receiptIdFactory: (operationId: string) => string;
  checkpoint?: (
    checkpoint: OrgWorkerMaterializationCheckpoint,
  ) => void | Promise<void>;
  dependencies?: {
    syncRepository?: (options?: SyncOptions) => Promise<SyncResult>;
  };
  /** Internal action identity used by the reconcile entrypoint. */
  action?: "materialize" | "reconcile";
}

export interface MaterializeOrgWorkerProjectResult {
  applied: boolean;
  replayed: boolean;
  plan: OrgWorkerMaterializationPlan;
  receipt?: WorkerMaterializationReceiptV1;
}

interface ProjectionReadBack {
  instructionId: string | null;
  contentDigest: `sha256-${string}` | null;
  ownershipHash: `sha256-${string}` | null;
  adapterState:
    | "absent"
    | "owned"
    | "foreign-valid"
    | "foreign-missing"
    | "drifted";
  verifiedConsentIds: string[];
}

function digest(bytes: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function drift(): never {
  throw new DrwnError(
    "ORG_WORKER_MATERIALIZATION_DRIFT",
    "Current project state does not match the verified Org Worker materialization",
  );
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
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
}

function requestDigest(input: {
  bundleDigest: string;
  snapshotDigest: string;
  action: "materialize" | "reconcile" | "remove";
}): `sha256:${string}` {
  return digest(
    `darwinian:org-worker-materialization-request:v1\n${canonicalJson({
      action: input.action,
      sourceBundleDigest: input.bundleDigest,
      artifactSnapshotDigest: input.snapshotDigest,
    })}`,
  );
}

function phaseAtLeast(
  journal: OrgWorkerMaterializationJournalV1,
  phase: OrgWorkerMaterializationPhase,
) {
  return (
    ORG_WORKER_MATERIALIZATION_PHASES.indexOf(journal.phase) >=
    ORG_WORKER_MATERIALIZATION_PHASES.indexOf(phase)
  );
}

async function advance(
  journal: OrgWorkerMaterializationJournalV1,
  phase: Exclude<OrgWorkerMaterializationPhase, "validated" | "completed">,
  input: MaterializeOrgWorkerProjectOptions,
  request: `sha256:${string}`,
) {
  if (phaseAtLeast(journal, phase)) return journal;
  return advanceOrgWorkerMaterializationJournal({
    projectRoot: input.projectRoot,
    operationId: input.operationId,
    requestDigest: request,
    phase,
    clock: input.clock,
  });
}

async function populateVerifiedVendor(
  projectRoot: string,
  plan: OrgWorkerMaterializationPlan,
  verified: VerifiedWorkerArtifactSnapshotV1,
) {
  const cards = new Map(plan.lock.cards.map((card) => [card.name, card]));
  for (const artifact of verified.verifiedArtifacts) {
    const card = cards.get(artifact.name);
    if (!card || !card.treeSha) drift();
    const manifest = await computeContentManifest(artifact.contentRoot);
    const vendorDir = resolveProjectVendorTree(
      projectRoot,
      card.name,
      card.treeSha,
    );
    await ensureVendorTree({
      projectRoot,
      storeDir: artifact.contentRoot,
      vendorDir,
      manifest,
    });
    await writeVendorManifestSidecar(
      resolveVendorManifestSidecarPath(
        projectRoot,
        card.name,
        card.treeSha,
      ),
      buildVendorManifestSidecar(card, manifest),
    );
  }
}

function verifyManagedPath(projectRoot: string, entry: ManagedPath) {
  const path = join(projectRoot, entry.path);
  if (!existsSync(path)) drift();
  if (entry.kind === "managed-content") {
    if (hashManagedContent(readFileSync(path)) !== entry.contentHash) drift();
    return;
  }
  if (entry.kind === "managed-directory") {
    if (hashManagedDirectory(path) !== entry.contentHash) drift();
    return;
  }
  if (entry.kind === "symlink") {
    if (!lstatSync(path).isSymbolicLink() || readlinkSync(path) !== entry.linkTarget) {
      drift();
    }
    return;
  }
  if (entry.kind === "generated-symlink") {
    if (
      !lstatSync(path).isSymbolicLink() ||
      readlinkSync(path) !== entry.generatedPath
    ) {
      drift();
    }
  }
}

async function exactReadBack(input: {
  projectRoot: string;
  plan: OrgWorkerMaterializationPlan;
  verifiedSnapshot: VerifiedWorkerArtifactSnapshotV1;
}): Promise<ProjectionReadBack> {
  const paths = transactionPaths(input.projectRoot);
  const [configBytes, lockBytes] = await Promise.all([
    readOptional(paths.configTarget),
    readOptional(paths.lockTarget),
  ]);
  if (
    configBytes !== input.plan.configBytes ||
    lockBytes !== input.plan.lockBytes
  ) {
    drift();
  }

  const verifiedByCard = new Map(
    input.verifiedSnapshot.verifiedArtifacts.map((artifact) => [
      artifact.name,
      artifact,
    ]),
  );
  for (const card of input.plan.lock.cards) {
    if (!card.treeSha) drift();
    const artifact = verifiedByCard.get(card.name);
    if (!artifact) drift();
    const vendorDir = resolveProjectVendorTree(
      input.projectRoot,
      card.name,
      card.treeSha,
    );
    const verified = await verifyVendorTreeAgainstLock(
      vendorDir,
      card.integrity,
    );
    if (!verified.ok) drift();
    const [rawTree, gitTreeSha] = await Promise.all([
      computeWorkerArtifactTreeDigest(vendorDir),
      computeWorkerArtifactGitTreeSha(vendorDir),
    ]);
    if (
      rawTree.digest !== artifact.contentTreeDigest ||
      gitTreeSha !== artifact.treeSha
    ) {
      drift();
    }
    const sidecar = await loadVendorManifestSidecar(
      resolveVendorManifestSidecarPath(
        input.projectRoot,
        card.name,
        card.treeSha,
      ),
    );
    if (
      !sidecar ||
      !validateSidecarSelfConsistency(sidecar, {
        projectRoot: input.projectRoot,
        vendorDir,
      }).ok ||
      sidecar.card !== card.name ||
      sidecar.treeSha !== card.treeSha ||
      sidecar.integrity !== card.integrity
    ) {
      drift();
    }
  }

  const writeRecord = loadWriteRecord(
    resolveProjectWriteRecordPath(input.projectRoot),
    "project",
  );
  if (!writeRecord) drift();
  for (const entry of writeRecord.managedPaths) {
    verifyManagedPath(input.projectRoot, entry);
  }

  const instructionEntry = writeRecord.managedPaths.find(
    (entry) =>
      entry.path === "AGENTS.md" &&
      entry.surface === "instructions" &&
      entry.kind === "managed-fields",
  );
  const activeWorker = input.plan.config.activeWorker;
  const activeRoot = activeWorker
    ? input.plan.lock.workerRoots.find(
        ({ name }) => name === activeWorker,
      )
    : null;
  if (activeWorker && !activeRoot) drift();
  const activeNames = activeRoot
    ? [activeRoot.name, ...activeRoot.members]
    : [];
  const cardsByName = new Map(
    input.plan.lock.cards.map((card) => [card.name, card]),
  );
  const activeCards = activeNames.map((name) => {
    const card = cardsByName.get(name);
    if (!card) drift();
    return card;
  });
  const artifactPinRefsByCard = Object.fromEntries(
    input.plan.artifactClosure.map((artifact) => [
      artifact.name,
      artifact.artifactPinRef,
    ]),
  );
  const composition = composeConsentedInstructions({
    cards: activeCards,
    contentRootsByCard: Object.fromEntries(
      activeCards.map((card) => [
        card.name,
        resolveProjectVendorTree(
          input.projectRoot,
          card.name,
          card.treeSha!,
        ),
      ]),
    ),
    organizationConsent: {
      workerId:
        input.plan.effectiveExternalConsentEvidence[0]?.workerId ??
        "",
      artifactPinRefsByCard,
      evidence: input.plan.effectiveExternalConsentEvidence,
    },
  });
  if (composition.excluded.length > 0) drift();
  const verifiedConsentIds = composition.included
    .map((included) => {
      if (included.evidenceKind !== "org_worker_bundle_consent") {
        drift();
      }
      return included.evidenceId;
    })
    .sort();
  let instructionId: string | null = null;
  let contentDigest: `sha256-${string}` | null = null;
  let ownershipHash: `sha256-${string}` | null = null;
  if (composition.bytes && composition.contentDigest) {
    if (!instructionEntry || instructionEntry.kind !== "managed-fields") {
      drift();
    }
    const agentsBytes = new Uint8Array(
      await readFile(join(input.projectRoot, "AGENTS.md")),
    );
    const block = parseManagedBlock(agentsBytes, INSTRUCTION_BLOCK_MARKERS);
    if (block.state !== "present") drift();
    const blockText = new TextDecoder().decode(block.block);
    instructionId = `worker:${activeRoot!.name}`;
    contentDigest = composition.contentDigest;
    ownershipHash = hashManagedContent(
      block.block,
    ) as `sha256-${string}`;
    if (
      !blockText.includes(`Instruction-ID: ${instructionId}\n`) ||
      !blockText.includes(`Content-Digest: ${contentDigest}\n`) ||
      instructionEntry.fieldHashes["drwn:instructions"] !== ownershipHash
    ) {
      drift();
    }
  } else if (instructionEntry || existsSync(join(input.projectRoot, "AGENTS.md"))) {
    const bytes = existsSync(join(input.projectRoot, "AGENTS.md"))
      ? new Uint8Array(await readFile(join(input.projectRoot, "AGENTS.md")))
      : new Uint8Array();
    if (
      parseManagedBlock(bytes, INSTRUCTION_BLOCK_MARKERS).state !== "absent"
    ) {
      drift();
    }
  }

  const adapterEntry = writeRecord.managedPaths.find(
    (entry) =>
      entry.path === ".claude/CLAUDE.md" &&
      entry.surface === "instructions",
  );
  const adapterState = adapterEntry ? "owned" : "absent";
  if (Boolean(composition.bytes) !== Boolean(adapterEntry)) drift();

  return {
    instructionId,
    contentDigest,
    ownershipHash,
    adapterState,
    verifiedConsentIds,
  };
}

function assertSameRequest(
  receipt: WorkerMaterializationReceiptV1,
  input: {
    bundleDigest: string;
    snapshotDigest: string;
    action: "materialize" | "reconcile" | "remove";
  },
) {
  if (
    receipt.action !== input.action ||
    receipt.sourceBundle.digest !== input.bundleDigest ||
    receipt.artifactVerification.snapshotDigest !== input.snapshotDigest
  ) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_ID_CONFLICT",
      "Org Worker operation ID was reused with a different request",
    );
  }
}

function buildRecord(input: {
  bundle: OrgWorkerBundleV1;
  bundleDigest: `sha256:${string}`;
  plan: OrgWorkerMaterializationPlan;
  projection: ProjectionReadBack;
  receiptId: string;
}): OrgWorkerMaterializationRecordV1 {
  return {
    schema: "drwn.org-worker-materialization",
    schemaVersion: 1,
    materializationState: "active",
    sourceBundle: {
      digest: input.bundleDigest,
      workerId: input.bundle.workerId,
      blueprintId: input.bundle.sourceBlueprint.id,
      blueprintRevision: input.bundle.sourceBlueprint.revision,
      blueprintDigest: input.bundle.sourceBlueprint.digest,
    },
    projectState: {
      configDigest: digest(input.plan.configBytes),
      lockDigest: digest(input.plan.lockBytes),
      orderedRootNames: input.plan.lock.workerRoots.map(({ name }) => name),
      activeWorker: input.plan.config.activeWorker,
    },
    artifactBindings: input.bundle.artifactPins
      .map((pin) => {
        const card = input.plan.lock.cards.find(
          ({ name }) => name === pin.name,
        );
        if (!card?.treeSha || !card.git?.commit) drift();
        return {
          artifactPinRef: pin.artifactId,
          cardName: card.name,
          version: card.version,
          integrity: card.integrity as `sha256-${string}`,
          treeSha: card.treeSha,
          gitCommit: card.git.commit,
        };
      })
      .sort((left, right) =>
        left.artifactPinRef < right.artifactPinRef
          ? -1
          : left.artifactPinRef > right.artifactPinRef
            ? 1
            : 0,
      ),
    instructionConsentEvidence:
      input.plan.effectiveExternalConsentEvidence
        .map((evidence) => ({
          consentId: evidence.consentId,
          artifactPinRef: evidence.artifactPinRef,
          contentDigest: evidence.contentDigest,
          consentedRange: evidence.consentedRange,
          ratifierRef: evidence.ratifierRef,
          evidenceRefs: [...evidence.evidenceRefs].sort(),
        }))
        .sort((left, right) =>
          left.consentId < right.consentId
            ? -1
            : left.consentId > right.consentId
              ? 1
              : 0,
        ),
    projection: {
      instructionId: input.projection.instructionId,
      contentDigest: input.projection.contentDigest,
      ownershipHash: input.projection.ownershipHash,
      adapterState: input.projection.adapterState,
    },
    lastVerifiedReceiptId: input.receiptId,
  };
}

async function assertReconcileOwnership(input: {
  projectRoot: string;
  bundleDigest: string;
  plan: OrgWorkerMaterializationPlan;
}) {
  const record = await loadOrgWorkerMaterializationRecord(
    input.projectRoot,
  );
  if (
    !record ||
    record.sourceBundle.digest !== input.bundleDigest
  ) {
    drift();
  }
  const expectedBindings = input.plan.lock.cards
    .map((card) => ({
      cardName: card.name,
      version: card.version,
      integrity: card.integrity,
      treeSha: card.treeSha,
      gitCommit: card.git?.commit,
    }))
    .sort((left, right) =>
      left.cardName < right.cardName
        ? -1
        : left.cardName > right.cardName
          ? 1
          : 0,
    );
  const observedBindings = record.artifactBindings
    .map((binding) => ({
      cardName: binding.cardName,
      version: binding.version,
      integrity: binding.integrity,
      treeSha: binding.treeSha,
      gitCommit: binding.gitCommit,
    }))
    .sort((left, right) =>
      left.cardName < right.cardName
        ? -1
        : left.cardName > right.cardName
          ? 1
          : 0,
    );
  if (JSON.stringify(expectedBindings) !== JSON.stringify(observedBindings)) {
    drift();
  }

  const paths = transactionPaths(input.projectRoot);
  const [configBytes, lockBytes] = await Promise.all([
    readOptional(paths.configTarget),
    readOptional(paths.lockTarget),
  ]);
  if (
    configBytes !== input.plan.configBytes &&
    configBytes !== null
  ) {
    try {
      const current = validateProjectConfig(JSON.parse(configBytes));
      if (
        JSON.stringify(current) !== JSON.stringify(input.plan.config)
      ) {
        drift();
      }
    } catch (error) {
      if (
        error instanceof DrwnError &&
        error.code === "ORG_WORKER_MATERIALIZATION_DRIFT"
      ) {
        throw error;
      }
    }
  }
  if (lockBytes !== input.plan.lockBytes && lockBytes !== null) {
    try {
      const current = validateCardLockfile(JSON.parse(lockBytes));
      if (JSON.stringify(current) !== JSON.stringify(input.plan.lock)) {
        drift();
      }
    } catch (error) {
      if (
        error instanceof DrwnError &&
        error.code === "ORG_WORKER_MATERIALIZATION_DRIFT"
      ) {
        throw error;
      }
    }
  }
}

export async function materializeOrgWorkerProject(
  input: MaterializeOrgWorkerProjectOptions,
): Promise<MaterializeOrgWorkerProjectResult> {
  const action = input.action ?? "materialize";
  if (
    !/^[A-Za-z0-9@._:+-]{1,160}$/.test(input.operationId)
  ) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_ID_INVALID",
      "Org Worker operation ID is malformed or unsupported",
    );
  }
  if (
    input.bundle.contributionConsents.some(
      ({ contributionKind }) => contributionKind === "hooks",
    )
  ) {
    throw new DrwnError(
      "ORG_WORKER_HOOK_CONSENT_UNSUPPORTED",
      "Org Worker hook consent cannot be materialized until hook projection evidence is supported",
    );
  }
  // Enforce the Worker version / environment compatibility floor directly at the
  // entrypoint, so the A06/A07 contract cannot be silently dropped by a future
  // refactor of the snapshot verifier (which also calls it today). Fails closed.
  assertOrgWorkerCompatibility({ bundle: input.bundle });
  const verifiedSnapshot = await verifyWorkerArtifactSnapshot({
    bundle: input.bundle,
    snapshot: input.snapshot,
    packetRoot: input.packetRoot,
  });
  const verifiedInstructionConsents =
    verifyOrgWorkerBundleInstructions(
      input.bundle,
      verifiedSnapshot.verifiedArtifacts.map((artifact) => ({
        card: input.bundle.artifactPins.some(
          (pin) =>
            pin.artifactId === artifact.artifactPinRef &&
            pin.name === artifact.name,
        )
          ? {
              name: artifact.name,
              requested: artifact.requestedRef,
              version: artifact.version,
              path: artifact.contentRoot,
              integrity: artifact.integrity.replace(
                /^sha256:/,
                "sha256-",
              ),
              treeSha: artifact.treeSha,
              manifest: artifact.manifest,
              skills: artifact.manifest.skills?.include ?? [],
              hooks: artifact.manifest.hooks?.include ?? [],
              registry: null,
              origin: "git" as const,
              git: { commit: artifact.gitCommit },
            }
          : drift(),
        contentRoot: artifact.contentRoot,
      })),
    );
  const bundleDigest = computeOrgWorkerBundleDigest(input.bundle);
  const snapshotDigest = computeWorkerArtifactSnapshotDigest(
    input.snapshot,
  );
  const request = requestDigest({
    bundleDigest,
    snapshotDigest,
    action,
  });
  if (input.dryRun || input.noWrite) {
    const statePaths = transactionPaths(input.projectRoot);
    const plan = deriveFreshOrgWorkerMaterializationPlan({
      bundle: input.bundle,
      verifiedSnapshot,
      ...(action === "materialize"
        ? {
            existingProject: {
              configBytes: await readOptional(statePaths.configTarget),
              lockBytes: await readOptional(statePaths.lockTarget),
            },
          }
        : {}),
    });
    return { applied: false, replayed: false, plan };
  }

  return withOrderedProjectOwnerLock(
    join(
      input.projectRoot,
      ".agents",
      "drwn",
      ".org-worker-materialization.lock",
    ),
    async () => {
      const statePaths = transactionPaths(input.projectRoot);
      const liveJournal =
        await loadOrgWorkerMaterializationJournal(input.projectRoot);
      if (
        liveJournal &&
        liveJournal.operationId !== input.operationId
      ) {
        throw new DrwnError(
          "ORG_WORKER_OPERATION_IN_PROGRESS",
          "Another Org Worker materialization operation is in progress",
        );
      }
      if (
        liveJournal &&
        liveJournal.requestDigest !== request
      ) {
        throw new DrwnError(
          "ORG_WORKER_OPERATION_ID_CONFLICT",
          "Org Worker operation ID was reused with a different request",
        );
      }
      const priorReceipt =
        await findWorkerMaterializationReceiptByOperation(
          input.projectRoot,
          input.operationId,
        );
      if (priorReceipt) {
        assertSameRequest(priorReceipt, {
          bundleDigest,
          snapshotDigest,
          action,
        });
      }
      const plan = deriveFreshOrgWorkerMaterializationPlan({
        bundle: input.bundle,
        verifiedSnapshot,
        ...(liveJournal || action === "reconcile"
          ? {}
          : {
              existingProject: {
                configBytes: await readOptional(
                  statePaths.configTarget,
                ),
                lockBytes: await readOptional(statePaths.lockTarget),
              },
            }),
      });
      if (action === "reconcile") {
        await assertReconcileOwnership({
          projectRoot: input.projectRoot,
          bundleDigest,
          plan,
        });
      }

      if (priorReceipt) {
        const projection = await exactReadBack({
          projectRoot: input.projectRoot,
          plan,
          verifiedSnapshot,
        });
        const expectedRecord = buildRecord({
          bundle: input.bundle,
          bundleDigest,
          plan,
          projection,
          receiptId: priorReceipt.receiptId,
        });
        let record = await loadOrgWorkerMaterializationRecord(
          input.projectRoot,
        );
        if (
          priorReceipt.outcome !== "verified" ||
          (record &&
            JSON.stringify(record) !== JSON.stringify(expectedRecord))
        ) {
          drift();
        }
        if (liveJournal) {
          if (
            !phaseAtLeast(liveJournal, "read_back_verified") ||
            phaseAtLeast(liveJournal, "completed")
          ) {
            drift();
          }
          let recoveryJournal = liveJournal;
          recoveryJournal = await advance(
            recoveryJournal,
            "receipt_persisted",
            input,
            request,
          );
          if (!record) {
            await writeOrgWorkerMaterializationRecord(
              input.projectRoot,
              expectedRecord,
            );
            record = expectedRecord;
          }
          await markOrgWorkerMaterializationRecordDurable({
            projectRoot: input.projectRoot,
            operationId: input.operationId,
            requestDigest: request,
            clock: input.clock,
          });
          await completeOrgWorkerMaterializationJournal({
            projectRoot: input.projectRoot,
            operationId: input.operationId,
            requestDigest: request,
            clock: input.clock,
          });
        } else if (
          !record ||
          record.lastVerifiedReceiptId !== priorReceipt.receiptId
        ) {
          drift();
        }
        return {
          applied: true,
          replayed: true,
          plan,
          receipt: priorReceipt,
        };
      }
      if (
        liveJournal &&
        phaseAtLeast(liveJournal, "receipt_persisted")
      ) {
        drift();
      }

      let journal = await beginOrgWorkerMaterializationJournal({
        projectRoot: input.projectRoot,
        operationId: input.operationId,
        requestDigest: request,
        clock: input.clock,
      });
      journal = await advance(
        journal,
        "artifacts_verified",
        input,
        request,
      );

      await commitProjectState(input.projectRoot, {
        configBytes: plan.configBytes,
        lockBytes: plan.lockBytes,
      });
      journal = await advance(
        journal,
        "project_state_committed",
        input,
        request,
      );

      await populateVerifiedVendor(
        input.projectRoot,
        plan,
        verifiedSnapshot,
      );
      await input.checkpoint?.("before-sync");
      const runSync =
        input.dependencies?.syncRepository ?? syncRepository;
      await runSync({
        repoRoot: input.repoRoot,
        agentsDir: input.agentsDir,
        homeDir: input.homeDir,
        cwd: input.projectRoot,
        strict: true,
        force: action === "reconcile",
        organizationInstructionConsent: {
          workerId: input.bundle.workerId,
          artifactPinRefsByCard: Object.fromEntries(
            input.bundle.artifactPins.map((pin) => [
              pin.name,
              pin.artifactId,
            ]),
          ),
          evidence: plan.effectiveExternalConsentEvidence,
        },
      });
      journal = await advance(
        journal,
        "projection_applied",
        input,
        request,
      );
      await input.checkpoint?.("after-sync");

      const projection = await exactReadBack({
        projectRoot: input.projectRoot,
        plan,
        verifiedSnapshot,
      });
      journal = await advance(
        journal,
        "read_back_verified",
        input,
        request,
      );

      const receipt: WorkerMaterializationReceiptV1 = {
        receiptVersion: "worker-materialization-receipt@1",
        receiptId: input.receiptIdFactory(input.operationId),
        operationId: input.operationId,
        action,
        outcome: "verified",
        sourceBundle: {
          digest: bundleDigest,
          workerId: input.bundle.workerId,
          sourceBlueprint: { ...input.bundle.sourceBlueprint },
        },
        consumer: {
          name: "darwinian",
          version: DRWN_VERSION,
          compatibilityProfile:
            "drwn-org-worker-materialization@1",
        },
        artifactVerification: {
          verifiedPinRefs: input.bundle.artifactPins
            .map(({ artifactId }) => artifactId)
            .sort(),
          snapshotDigest,
        },
        projectState: {
          configDigest: digest(plan.configBytes),
          lockDigest: digest(plan.lockBytes),
          orderedRootNames: plan.lock.workerRoots.map(
            ({ name }) => name,
          ),
          activeWorker: plan.config.activeWorker,
        },
        instructionProjection: {
          state: projection.instructionId ? "current" : "absent",
          ...(projection.instructionId
            ? {
                instructionId: projection.instructionId,
                contentDigest: projection.contentDigest!,
                ownershipHash: projection.ownershipHash!,
              }
            : {}),
          adapterState: projection.adapterState,
        },
        verifiedConsentIds: verifiedInstructionConsents
          .map(({ consentId }) => consentId)
          .sort(),
        checks: [
          { code: "ARTIFACT_BYTES", result: "passed" },
          { code: "PROJECTION_OWNERSHIP", result: "passed" },
          { code: "PROJECT_STATE", result: "passed" },
          { code: "VENDOR_CONTENT", result: "passed" },
        ],
        observedAt: input.clock(),
      };
      await persistWorkerMaterializationReceipt(
        input.projectRoot,
        receipt,
      );
      await input.checkpoint?.("after-receipt");
      journal = await advance(
        journal,
        "receipt_persisted",
        input,
        request,
      );

      await writeOrgWorkerMaterializationRecord(
        input.projectRoot,
        buildRecord({
          bundle: input.bundle,
          bundleDigest,
          plan,
          projection,
          receiptId: receipt.receiptId,
        }),
      );
      await input.checkpoint?.("after-record");
      await markOrgWorkerMaterializationRecordDurable({
        projectRoot: input.projectRoot,
        operationId: input.operationId,
        requestDigest: request,
        clock: input.clock,
      });
      await completeOrgWorkerMaterializationJournal({
        projectRoot: input.projectRoot,
        operationId: input.operationId,
        requestDigest: request,
        clock: input.clock,
      });

      return {
        applied: true,
        replayed: false,
        plan,
        receipt,
      };
    },
  );
}

export async function reconcileOrgWorkerProject(
  input: Omit<MaterializeOrgWorkerProjectOptions, "action">,
): Promise<MaterializeOrgWorkerProjectResult> {
  return materializeOrgWorkerProject({
    ...input,
    action: "reconcile",
  });
}

export interface RemoveOrgWorkerProjectResult
  extends MaterializeOrgWorkerProjectResult {}

function deriveRemovedProjectState(input: {
  plan: OrgWorkerMaterializationPlan;
  record: OrgWorkerMaterializationRecordV1;
  configBytes: string;
  lockBytes: string;
}) {
  let config;
  let lock;
  try {
    config = validateProjectConfig(JSON.parse(input.configBytes));
    lock = validateCardLockfile(JSON.parse(input.lockBytes));
  } catch {
    drift();
  }
  if (
    config.workers.length !== lock.workerRoots.length ||
    config.workers.some(
      (requested, index) =>
        requested !== lock.workerRoots[index]?.requested,
    )
  ) {
    drift();
  }
  const cardsByName = new Map(
    lock.cards.map((card) => [card.name, card]),
  );
  const ownedRoots = new Set(
    input.plan.lock.workerRoots.map(({ name }) => name),
  );
  const presentOwnedRoots = [...ownedRoots].filter((name) =>
    lock.workerRoots.some((root) => root.name === name),
  );
  if (
    presentOwnedRoots.length !== 0 &&
    presentOwnedRoots.length !== ownedRoots.size
  ) {
    drift();
  }
  const beforeRemoval = presentOwnedRoots.length === ownedRoots.size;
  for (const binding of input.record.artifactBindings) {
    const card = cardsByName.get(binding.cardName);
    if (!card) {
      if (beforeRemoval) drift();
      continue;
    }
    if (
      card.version !== binding.version ||
      card.integrity !== binding.integrity ||
      card.treeSha !== binding.treeSha ||
      card.git?.commit !== binding.gitCommit
    ) {
      drift();
    }
  }
  const workerRoots = lock.workerRoots.filter(
    ({ name }) => !ownedRoots.has(name),
  );
  const retainedCardNames = new Set(
    workerRoots.flatMap((root) => [root.name, ...root.members]),
  );
  const cards = lock.cards.filter((card) =>
    retainedCardNames.has(card.name),
  );
  const activeWorker =
    config.activeWorker && ownedRoots.has(config.activeWorker)
      ? null
      : config.activeWorker;
  const nextConfig = validateProjectConfig({
    ...config,
    workers: workerRoots.map(({ requested }) => requested),
    activeWorker,
  });
  const configBytes = `${JSON.stringify(nextConfig, null, 2)}\n`;
  const lockBytes = serializeCardLock({ workerRoots, cards });
  return {
    config: nextConfig,
    lock: JSON.parse(lockBytes) as typeof lock,
    configBytes,
    lockBytes,
    removedCardNames: new Set(
      input.record.artifactBindings
        .map(({ cardName }) => cardName)
        .filter((name) => !retainedCardNames.has(name)),
    ),
    retainedCardNames,
    beforeRemoval,
  };
}

async function loadPriorReceiptForRecord(
  projectRoot: string,
  record: OrgWorkerMaterializationRecordV1,
) {
  try {
    return parseWorkerMaterializationReceipt(
      JSON.parse(
        await readFile(
          resolveWorkerMaterializationReceiptPath(
            projectRoot,
            record.lastVerifiedReceiptId,
          ),
          "utf8",
        ),
      ),
    );
  } catch {
    drift();
  }
}

async function verifyOwnedVendorTreesBeforeRemoval(input: {
  projectRoot: string;
  verifiedSnapshot: VerifiedWorkerArtifactSnapshotV1;
  retainedCardNames: ReadonlySet<string>;
  allowRemovedOwnedTrees: boolean;
}) {
  for (const artifact of input.verifiedSnapshot.verifiedArtifacts) {
    const vendorDir = resolveProjectVendorTree(
      input.projectRoot,
      artifact.name,
      artifact.treeSha,
    );
    if (!existsSync(vendorDir)) {
      if (
        input.retainedCardNames.has(artifact.name) ||
        !input.allowRemovedOwnedTrees
      ) {
        drift();
      }
      continue;
    }
    const sidecar = await loadVendorManifestSidecar(
      resolveVendorManifestSidecarPath(
        input.projectRoot,
        artifact.name,
        artifact.treeSha,
      ),
    );
    if (
      !sidecar ||
      !validateSidecarSelfConsistency(sidecar, {
        projectRoot: input.projectRoot,
        vendorDir,
      }).ok ||
      sidecar.card !== artifact.name ||
      sidecar.treeSha !== artifact.treeSha ||
      sidecar.integrity !==
        artifact.integrity.replace(/^sha256:/, "sha256-")
    ) {
      drift();
    }
    const [integrity, rawTree, gitTreeSha] = await Promise.all([
      verifyVendorTreeAgainstLock(
        vendorDir,
        artifact.integrity.replace(/^sha256:/, "sha256-"),
      ),
      computeWorkerArtifactTreeDigest(vendorDir),
      computeWorkerArtifactGitTreeSha(vendorDir),
    ]);
    if (
      !integrity.ok ||
      rawTree.digest !== artifact.contentTreeDigest ||
      gitTreeSha !== artifact.treeSha
    ) {
      drift();
    }
  }
}

function buildRemovedRecord(input: {
  record: OrgWorkerMaterializationRecordV1;
  removed: ReturnType<typeof deriveRemovedProjectState>;
  receiptId: string;
}): OrgWorkerMaterializationRecordV1 {
  return {
    ...input.record,
    materializationState: "removed",
    projectState: {
      configDigest: digest(input.removed.configBytes),
      lockDigest: digest(input.removed.lockBytes),
      orderedRootNames: input.removed.lock.workerRoots.map(
        ({ name }) => name,
      ),
      activeWorker: input.removed.config.activeWorker,
    },
    instructionConsentEvidence: [],
    projection: {
      instructionId: null,
      contentDigest: null,
      ownershipHash: null,
      adapterState: "absent",
    },
    lastVerifiedReceiptId: input.receiptId,
  };
}

export async function removeOrgWorkerProject(
  input: Omit<MaterializeOrgWorkerProjectOptions, "action">,
): Promise<RemoveOrgWorkerProjectResult> {
  if (!/^[A-Za-z0-9@._:+-]{1,160}$/.test(input.operationId)) {
    throw new DrwnError(
      "ORG_WORKER_OPERATION_ID_INVALID",
      "Org Worker operation ID is malformed or unsupported",
    );
  }
  // Enforce the compatibility floor directly at the entrypoint (same rationale
  // as materializeOrgWorkerProject): the A06/A07 contract must not depend on the
  // snapshot verifier continuing to call assertOrgWorkerCompatibility.
  assertOrgWorkerCompatibility({ bundle: input.bundle });
  const verifiedSnapshot = await verifyWorkerArtifactSnapshot({
    bundle: input.bundle,
    snapshot: input.snapshot,
    packetRoot: input.packetRoot,
  });
  if (
    input.bundle.contributionConsents.some(
      ({ contributionKind }) => contributionKind === "hooks",
    )
  ) {
    throw new DrwnError(
      "ORG_WORKER_HOOK_CONSENT_UNSUPPORTED",
      "Org Worker hook consent cannot be materialized until hook projection evidence is supported",
    );
  }
  const verifiedInstructionConsents =
    verifyOrgWorkerBundleInstructions(
      input.bundle,
      verifiedSnapshot.verifiedArtifacts.map((artifact) => ({
        card: {
          name: artifact.name,
          requested: artifact.requestedRef,
          version: artifact.version,
          path: artifact.contentRoot,
          integrity: artifact.integrity.replace(
            /^sha256:/,
            "sha256-",
          ),
          treeSha: artifact.treeSha,
          manifest: artifact.manifest,
          skills: artifact.manifest.skills?.include ?? [],
          hooks: artifact.manifest.hooks?.include ?? [],
          registry: null,
          origin: "git" as const,
          git: { commit: artifact.gitCommit },
        },
        contentRoot: artifact.contentRoot,
      })),
    );
  const bundleDigest = computeOrgWorkerBundleDigest(input.bundle);
  const snapshotDigest = computeWorkerArtifactSnapshotDigest(
    input.snapshot,
  );
  const request = requestDigest({
    bundleDigest,
    snapshotDigest,
    action: "remove",
  });
  const plan = deriveFreshOrgWorkerMaterializationPlan({
    bundle: input.bundle,
    verifiedSnapshot,
  });
  if (input.dryRun || input.noWrite) {
    return { applied: false, replayed: false, plan };
  }

  try {
    return await withOrderedProjectOwnerLock(
      join(
        input.projectRoot,
        ".agents",
        "drwn",
        ".org-worker-materialization.lock",
      ),
      async () => {
      const liveJournal =
        await loadOrgWorkerMaterializationJournal(input.projectRoot);
      if (
        liveJournal &&
        (liveJournal.operationId !== input.operationId ||
          liveJournal.requestDigest !== request)
      ) {
        throw new DrwnError(
          liveJournal.operationId !== input.operationId
            ? "ORG_WORKER_OPERATION_IN_PROGRESS"
            : "ORG_WORKER_OPERATION_ID_CONFLICT",
          "Another or conflicting Org Worker operation is in progress",
        );
      }
      const prior =
        await findWorkerMaterializationReceiptByOperation(
          input.projectRoot,
          input.operationId,
        );
      if (prior) {
        assertSameRequest(prior, {
          bundleDigest,
          snapshotDigest,
          action: "remove",
        });
        const record = await loadOrgWorkerMaterializationRecord(
          input.projectRoot,
        );
        if (!record || prior.outcome !== "removed") {
          drift();
        }
        const paths = transactionPaths(input.projectRoot);
        const [configBytes, lockBytes] = await Promise.all([
          readOptional(paths.configTarget),
          readOptional(paths.lockTarget),
        ]);
        if (
          !configBytes ||
          !lockBytes ||
          (record.materializationState === "removed" &&
            (digest(configBytes) !== record.projectState.configDigest ||
              digest(lockBytes) !== record.projectState.lockDigest))
        ) {
          drift();
        }
        const removed = deriveRemovedProjectState({
          plan,
          record,
          configBytes,
          lockBytes,
        });
        for (const artifact of verifiedSnapshot.verifiedArtifacts) {
          if (
            removed.removedCardNames.has(artifact.name) &&
            existsSync(
              resolveProjectVendorTree(
                input.projectRoot,
                artifact.name,
                artifact.treeSha,
              ),
            )
          ) {
            drift();
          }
        }
        const replayAgentsPath = join(input.projectRoot, "AGENTS.md");
        if (existsSync(replayAgentsPath)) {
          const block = parseManagedBlock(
            new Uint8Array(await readFile(replayAgentsPath)),
            INSTRUCTION_BLOCK_MARKERS,
          );
          if (
            block.state === "malformed" ||
            (block.state === "present" &&
              plan.lock.workerRoots.some(({ name }) =>
                new TextDecoder()
                  .decode(block.block)
                  .includes(`Instruction-ID: worker:${name}\n`),
              ))
          ) {
            drift();
          }
        }
        const replayWriteRecord = loadWriteRecord(
          resolveProjectWriteRecordPath(input.projectRoot),
          "project",
        );
        const replayAdapter = replayWriteRecord?.managedPaths.find(
          (entry) =>
            entry.path === ".claude/CLAUDE.md" &&
            entry.surface === "instructions",
        );
        if (
          (prior.instructionProjection.adapterState === "owned") !==
          Boolean(replayAdapter)
        ) {
          drift();
        }
        if (replayAdapter) {
          verifyManagedPath(input.projectRoot, replayAdapter);
        }
        if (liveJournal) {
          if (!phaseAtLeast(liveJournal, "read_back_verified")) {
            drift();
          }
          const expectedRecord = buildRemovedRecord({
            record,
            removed,
            receiptId: prior.receiptId,
          });
          if (
            record.materializationState !== "removed" ||
            record.lastVerifiedReceiptId !== prior.receiptId
          ) {
            await writeOrgWorkerMaterializationRecord(
              input.projectRoot,
              expectedRecord,
            );
          } else if (
            JSON.stringify(record) !== JSON.stringify(expectedRecord)
          ) {
            drift();
          }
          let recoveryJournal = liveJournal;
          recoveryJournal = await advance(
            recoveryJournal,
            "receipt_persisted",
            input,
            request,
          );
          await markOrgWorkerMaterializationRecordDurable({
            projectRoot: input.projectRoot,
            operationId: input.operationId,
            requestDigest: request,
            clock: input.clock,
          });
          await completeOrgWorkerMaterializationJournal({
            projectRoot: input.projectRoot,
            operationId: input.operationId,
            requestDigest: request,
            clock: input.clock,
          });
        } else if (
          record.materializationState !== "removed" ||
          record.lastVerifiedReceiptId !== prior.receiptId
        ) {
          drift();
        }
        return { applied: true, replayed: true, plan, receipt: prior };
      }

      const record = await loadOrgWorkerMaterializationRecord(
        input.projectRoot,
      );
      if (
        !record ||
        record.materializationState === "removed" ||
        record.sourceBundle.digest !== bundleDigest
      ) {
        drift();
      }
      const priorReceipt = await loadPriorReceiptForRecord(
        input.projectRoot,
        record,
      );
      if (
        priorReceipt.sourceBundle.digest !== bundleDigest ||
        priorReceipt.outcome !== "verified"
      ) {
        drift();
      }
      const paths = transactionPaths(input.projectRoot);
      const [currentConfigBytes, currentLockBytes] =
        await Promise.all([
          readOptional(paths.configTarget),
          readOptional(paths.lockTarget),
        ]);
      if (!currentConfigBytes || !currentLockBytes) drift();
      const removed = deriveRemovedProjectState({
        plan,
        record,
        configBytes: currentConfigBytes,
        lockBytes: currentLockBytes,
      });
      await verifyOwnedVendorTreesBeforeRemoval({
        projectRoot: input.projectRoot,
        verifiedSnapshot,
        retainedCardNames: removed.retainedCardNames,
        allowRemovedOwnedTrees: !removed.beforeRemoval,
      });

      try {
        await syncRepository({
          repoRoot: input.repoRoot,
          agentsDir: input.agentsDir,
          homeDir: input.homeDir,
          cwd: input.projectRoot,
          dryRun: true,
          strict: true,
          organizationInstructionConsent: {
            workerId: input.bundle.workerId,
            artifactPinRefsByCard: Object.fromEntries(
              input.bundle.artifactPins.map((pin) => [
                pin.name,
                pin.artifactId,
              ]),
            ),
            evidence: plan.effectiveExternalConsentEvidence,
          },
        });
      } catch {
        throw new DrwnError(
          "ORG_WORKER_REMOVAL_OWNERSHIP_DRIFT",
          "Org Worker removal ownership evidence does not match local state",
        );
      }

      let journal = await beginOrgWorkerMaterializationJournal({
        projectRoot: input.projectRoot,
        operationId: input.operationId,
        requestDigest: request,
        clock: input.clock,
      });
      journal = await advance(
        journal,
        "artifacts_verified",
        input,
        request,
      );
      await commitProjectState(input.projectRoot, {
        configBytes: removed.configBytes,
        lockBytes: removed.lockBytes,
      });
      journal = await advance(
        journal,
        "project_state_committed",
        input,
        request,
      );
      await input.checkpoint?.("before-sync");
      await syncRepository({
        repoRoot: input.repoRoot,
        agentsDir: input.agentsDir,
        homeDir: input.homeDir,
        cwd: input.projectRoot,
        strict: true,
        organizationInstructionConsent: {
          workerId: input.bundle.workerId,
          artifactPinRefsByCard: {},
          evidence: [],
        },
      });
      journal = await advance(
        journal,
        "projection_applied",
        input,
        request,
      );
      await input.checkpoint?.("after-sync");

      const [readConfigBytes, readLockBytes] = await Promise.all([
        readOptional(paths.configTarget),
        readOptional(paths.lockTarget),
      ]);
      if (
        readConfigBytes !== removed.configBytes ||
        readLockBytes !== removed.lockBytes
      ) {
        drift();
      }
      for (const artifact of verifiedSnapshot.verifiedArtifacts) {
        if (
          removed.removedCardNames.has(artifact.name) &&
          existsSync(
            resolveProjectVendorTree(
              input.projectRoot,
              artifact.name,
              artifact.treeSha,
            ),
          )
        ) {
          drift();
        }
      }
      const agentsPath = join(input.projectRoot, "AGENTS.md");
      if (existsSync(agentsPath)) {
        const block = parseManagedBlock(
          new Uint8Array(await readFile(agentsPath)),
          INSTRUCTION_BLOCK_MARKERS,
        );
        if (block.state === "malformed") drift();
        if (
          block.state === "present" &&
          record.projectState.orderedRootNames.some((name) =>
            new TextDecoder()
              .decode(block.block)
              .includes(`Instruction-ID: worker:${name}\n`),
          )
        ) {
          drift();
        }
      }
      const postRemovalWriteRecord = loadWriteRecord(
        resolveProjectWriteRecordPath(input.projectRoot),
        "project",
      );
      if (!postRemovalWriteRecord) drift();
      const postRemovalAdapter = postRemovalWriteRecord.managedPaths.find(
        (entry) =>
          entry.path === ".claude/CLAUDE.md" &&
          entry.surface === "instructions",
      );
      if (postRemovalAdapter) {
        verifyManagedPath(input.projectRoot, postRemovalAdapter);
      }
      const postRemovalAdapterState = postRemovalAdapter
        ? "owned"
        : "absent";
      journal = await advance(
        journal,
        "read_back_verified",
        input,
        request,
      );

      const receipt: WorkerMaterializationReceiptV1 = {
        receiptVersion: "worker-materialization-receipt@1",
        receiptId: input.receiptIdFactory(input.operationId),
        operationId: input.operationId,
        action: "remove",
        outcome: "removed",
        sourceBundle: {
          digest: bundleDigest,
          workerId: input.bundle.workerId,
          sourceBlueprint: { ...input.bundle.sourceBlueprint },
        },
        consumer: {
          name: "darwinian",
          version: DRWN_VERSION,
          compatibilityProfile:
            "drwn-org-worker-materialization@1",
        },
        artifactVerification: {
          verifiedPinRefs: input.bundle.artifactPins
            .map(({ artifactId }) => artifactId)
            .sort(),
          snapshotDigest,
        },
        projectState: {
          configDigest: digest(removed.configBytes),
          lockDigest: digest(removed.lockBytes),
          orderedRootNames: removed.lock.workerRoots.map(
            ({ name }) => name,
          ),
          activeWorker: removed.config.activeWorker,
        },
        instructionProjection: {
          state: "removed",
          adapterState: postRemovalAdapterState,
        },
        verifiedConsentIds: verifiedInstructionConsents
          .map(({ consentId }) => consentId)
          .sort(),
        checks: [
          { code: "ARTIFACT_BYTES", result: "passed" },
          { code: "PROJECTION_OWNERSHIP", result: "passed" },
          { code: "PROJECT_STATE", result: "passed" },
          { code: "VENDOR_CONTENT", result: "passed" },
        ],
        priorReceiptDigest:
          computeWorkerMaterializationReceiptDigest(priorReceipt),
        observedAt: input.clock(),
      };
      await persistWorkerMaterializationReceipt(
        input.projectRoot,
        receipt,
      );
      await input.checkpoint?.("after-receipt");
      journal = await advance(
        journal,
        "receipt_persisted",
        input,
        request,
      );
      await writeOrgWorkerMaterializationRecord(
        input.projectRoot,
        buildRemovedRecord({
          record,
          removed,
          receiptId: receipt.receiptId,
        }),
      );
      await input.checkpoint?.("after-record");
      await markOrgWorkerMaterializationRecordDurable({
        projectRoot: input.projectRoot,
        operationId: input.operationId,
        requestDigest: request,
        clock: input.clock,
      });
      await completeOrgWorkerMaterializationJournal({
        projectRoot: input.projectRoot,
        operationId: input.operationId,
        requestDigest: request,
        clock: input.clock,
      });
      return {
        applied: true,
        replayed: false,
        plan,
        receipt,
      };
      },
    );
  } catch (error) {
    if (!(error instanceof DrwnError)) {
      throw error;
    }
    if (error.code !== "ORG_WORKER_MATERIALIZATION_DRIFT") {
      throw error;
    }
    throw new DrwnError(
      "ORG_WORKER_REMOVAL_OWNERSHIP_DRIFT",
      "Org Worker removal ownership evidence does not match local state",
    );
  }
}
