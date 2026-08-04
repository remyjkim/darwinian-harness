// ABOUTME: Computes report-only diagnostics for skill symlinks, MCP drift, and generated file expectations.
// ABOUTME: Shared by `drwn doctor` and `drwn status` to keep reporting logic centralized and testable.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluateVersionFloor, loadCardLock, type CardLockEntry, type VersionFloorStatus } from "./card-lock";
import type { AmbientCollision } from "./ambient-policy";
import { resolveSkillSource } from "./card-skill-resolver";
import { buildEffectiveState, selectedAmbientCollisions, type EffectiveState } from "./effective-state";
import {
  inspectAmbientCapabilities,
  inspectOpencodeSkillShadowing,
  type OpencodeSkillShadowingIssue,
} from "./ambient-capabilities";
import { loadConfig } from "./config";
import { canonicalJsonHash } from "./managed-fields";
import {
  mcpServerHashKey,
  hashClaudeManagedServers,
  hashCodexManagedServers,
  mergeCodexTomlText,
  renderJsonMcpConfig,
  renderMcpServerForTarget,
} from "./mcp";
import { mergeUserMcpLibrary, resolveMachineCapabilities } from "./defaults";
import { expandHomePath, resolveToolPaths } from "./paths";
import { resolveHomeDir } from "./home";
import { ALL_TARGET_NAMES, getTargetDescriptor } from "./targets";
import { loadRegistry } from "./registry";
import { loadMcpLibrary } from "./mcp-library";
import {
  buildSkillInventory,
  findStaleManagedEntries,
  isOpencodeProjectedScope,
  listRepoSkills,
} from "./skills";
import { lstatSafe } from "./fs";
import { resolveProjectRootFromConfigPath, summarizeProjectConfig, isServerToggle } from "./project";
import { loadEffectiveConfig } from "./user-config";
import { getExtension } from "./extensions/registry";
import {
  resolveCardsRoot,
  resolveGlobalWriteRecordPath,
  resolveStoreGeneratedDir,
  resolveStoreMcpServersDir,
  resolveStoreMetadataPath,
  resolveStoreRoot,
  resolveStoreSkillsRoot,
} from "./store-paths";
import { diffWriteRecord, hashManagedContent, loadWriteRecord, resolveProjectWriteRecordPath } from "./write-record";
import { isHookConsentValid } from "./hook-consent";
import {
  isInstructionConsentValid,
  resolveExplicitInstructionContribution,
} from "./instruction-contribution";
import { collectEffectiveCardServerDefinitions } from "./card-mcp";
import { DRWN_VERSION } from "./version";
import type { CanonicalConfig, RegistryServer } from "./types";
import {
  collectMachineProjectionConflicts,
  planMachineManagedPaths,
  planRepositoryProjection,
  type MachineProjectionConflict,
} from "./sync";
import { readMachineConfig } from "./card-store";
import { DrwnError } from "./errors";
import { parseManagedBlock } from "./managed-block";
import {
  CLAUDE_ADAPTER_BLOCK_MARKERS,
  INSTRUCTION_BLOCK_MARKERS,
} from "./sync-instructions";
import { instructionCompositionForState } from "./sync-project-instructions";
import {
  loadOrgWorkerMaterializationRecord,
  type OrgWorkerMaterializationRecordV1,
} from "./org-worker-materialization-record";
import { loadOrgWorkerMaterializationJournal } from "./org-worker-materialization-journal";
import {
  computeWorkerMaterializationReceiptDigest,
  parseWorkerMaterializationReceipt,
  resolveWorkerMaterializationReceiptPath,
  resolveWorkerMaterializationReceiptsRoot,
  type WorkerMaterializationReceiptV1,
} from "./worker-materialization-receipt";
import { transactionPaths } from "./project-state-transaction";
import { resolveProjectVendorTree } from "./vendor";
import {
  loadVendorManifestSidecar,
  resolveVendorManifestSidecarPath,
  validateSidecarSelfConsistency,
  verifyVendorTreeAgainstLock,
} from "./vendor-manifest";
import { computeWorkerArtifactGitTreeSha } from "./org-worker-artifact-snapshot";

export interface PlatformCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorReport {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  machineProjectionConflicts: string[];
  machineCapabilityIssues: string[];
  missingGeneratedFiles: string[];
  hookIssues: string[];
  projectConfigIssues: string[];
  surfaceNotes: string[];
  platformChecks: PlatformCheck[];
  ambientMcpCollisions: AmbientCollision[];
  cards?: DiagnosticsSections["cards"];
  store?: DiagnosticsSections["store"];
  writeRecord?: DiagnosticsSections["writeRecord"];
}

export interface DiagnosticsSections {
  machine: {
    repoRoot: string;
    agentsDir: string;
    homeDir: string;
  };
  project?: {
    configPath: string;
    root: string;
    cardCount: number;
  };
  store: {
    path: string;
    initialized: boolean;
    schemaVersion: number | null;
    cardCount: number;
    legacySourceCount: number;
    skillBundleCount: number;
    mcpServerCount: number;
  };
  writeRecord: {
    path: string;
    present: boolean;
    corrupt: boolean;
    managedPathCount: number;
    lastWriteAt?: string;
    lastWriteHarnessVersion?: string;
  };
  skills: {
    inventoryCount: number;
    activeCount: number;
    projectIncludes: string[];
    projectExcludes: string[];
    cardIncludes: Array<{ card: string; skill: string }>;
  };
  mcp: {
    activeServerCount: number;
    projectServers: string[];
    cardServers: Array<{ card: string; server: string }>;
  };
  extensions: {
    projectExtensions: string[];
  };
  cards: {
    configuredRefs: string[];
    lockedVersions: string[];
    warnings: string[];
  };
  versionFloor: VersionFloorStatus;
  targets: {
    enabled: string[];
    projectOverrides: string[];
  };
}

export interface ProjectStatusItem {
  id: string;
  sourceKind: "worker-root" | "card" | "project-overlay" | "local-overlay";
  sourceId: string;
  sourcePath: string;
  target: string;
  health: "installed" | "active" | "declared";
}

export interface ProjectStatusV1 {
  schema: "drwn.project-status";
  schemaVersion: 1;
  installedWorkers: ProjectStatusItem[];
  activeWorker: string | null;
  activeCards: ProjectStatusItem[];
  selectionSource: "project" | "local" | "machine";
  localOverrides: {
    activeWorker: string | null;
    cardReplacements: string[];
    localOnlyRoots: string[];
    sourceOverrides: string[];
  };
  projectOverlays: {
    skills: ProjectStatusItem[];
    mcp: ProjectStatusItem[];
    extensions: ProjectStatusItem[];
    targets: ProjectStatusItem[];
    hookControls: ProjectStatusItem[];
  };
  declaredCapabilities: {
    skills: ProjectStatusItem[];
    mcp: ProjectStatusItem[];
    hooks: ProjectStatusItem[];
  };
  ambientCapabilities: {
    observations: Awaited<ReturnType<typeof inspectAmbientCapabilities>>;
    collisions: AmbientCollision[];
    opencodeSkillShadowing: OpencodeSkillShadowingIssue[];
    enforcement: "target-native";
  };
  projection: { current: boolean; issues: string[] };
  instructionDelivery: {
    state: "absent" | "current" | "drifted" | "blocked";
    instructionId?: string;
    contentDigest?: string;
    ownershipHash?: string;
    consentEvidence: Array<{
      card: string;
      kind: "local_card_consent" | "org_worker_bundle_consent";
      evidenceId: string;
    }>;
    adapter: "absent" | "owned" | "foreign-valid" | "foreign-missing" | "drifted";
    issues: Array<{
      code:
        | "INSTRUCTIONS_BLOCK_MALFORMED"
        | "INSTRUCTIONS_CONTENT_STALE"
        | "INSTRUCTIONS_OWNERSHIP_DRIFT"
        | "INSTRUCTIONS_ID_STALE"
        | "INSTRUCTIONS_CONSENT_REQUIRED"
        | "INSTRUCTIONS_ORG_CONSENT_INVALID"
        | "CLAUDE_ADAPTER_MISSING"
        | "CLAUDE_ADAPTER_DRIFT";
      severity: "error" | "warning" | "advisory";
    }>;
  };
  orgWorkerMaterialization?: OrgWorkerMaterializationStatus;
}

export type OrgWorkerMaterializationIssueCode =
  | "ORG_WORKER_OPERATION_INCOMPLETE"
  | "ORG_WORKER_EVIDENCE_MALFORMED"
  | "ORG_WORKER_EVIDENCE_ORPHANED"
  | "ORG_WORKER_EVIDENCE_MISSING"
  | "ORG_WORKER_PROJECT_STATE_DRIFT"
  | "ORG_WORKER_RECEIPT_MISMATCH"
  | "ORG_WORKER_ARTIFACT_DRIFT"
  | "ORG_WORKER_PROJECTION_DRIFT"
  | "ORG_WORKER_REMOVAL_DRIFT";

export interface OrgWorkerMaterializationStatus {
  state:
    | "absent"
    | "compatible"
    | "current"
    | "drifted"
    | "blocked"
    | "removed"
    | "unknown";
  bundleDigest?: string;
  workerId?: string;
  blueprintDigest?: string;
  lastVerifiedReceiptId?: string;
  instructionConsentSource?: "local" | "organization" | "mixed";
  issues: Array<{
    code: OrgWorkerMaterializationIssueCode;
    severity: "error" | "warning" | "advisory";
  }>;
}

export interface MachineStatusCapability {
  id: string;
  provenance: "worker";
  cardName: string;
  cardVersion: string;
  source: "worker";
  status: "resolved" | "unavailable";
}

export interface MachineStatusV2 {
  schema: "drwn.machine-status";
  schemaVersion: 2;
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  enabledTargets: string[];
  config: { schema: "drwn.machine"; schemaVersion: 2 };
  selection: {
    activeWorker: string | null;
    installedRoots: Array<{
      name: string;
      requested: string;
      kind: "blueprint";
      members: string[];
      selected: boolean;
    }>;
    activeClosure: Array<{
      name: string;
      requested: string;
      version: string;
      integrity: string;
      treeSha?: string;
      origin: string;
      consent: { hooks: boolean; instructions: boolean };
    }>;
  };
  capabilities: {
    skills: MachineStatusCapability[];
    mcpServers: MachineStatusCapability[];
    counts: {
      resolvedSkills: number;
      missingSkills: number;
      resolvedMcpServers: number;
      missingMcpServers: number;
    };
  };
  projection: {
    healthy: boolean;
    current: boolean;
    recordPresent: boolean;
    conflicts: MachineProjectionConflict[];
    issues: string[];
  };
  inventory: { skillCount: number; mcpServerCount: number };
}

function materializationIdentity(
  record: OrgWorkerMaterializationRecordV1,
): Pick<
  OrgWorkerMaterializationStatus,
  | "bundleDigest"
  | "workerId"
  | "blueprintDigest"
  | "lastVerifiedReceiptId"
> {
  return {
    bundleDigest: record.sourceBundle.digest,
    workerId: record.sourceBundle.workerId,
    blueprintDigest: record.sourceBundle.blueprintDigest,
    lastVerifiedReceiptId: record.lastVerifiedReceiptId,
  };
}

function digestBytes(bytes: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const MAX_DIAGNOSTIC_RECEIPT_BYTES = 65_536;
const MAX_DIAGNOSTIC_RECEIPTS = 1_024;

async function readDiagnosticReceipt(
  projectRoot: string,
  receiptId: string,
) {
  const path = resolveWorkerMaterializationReceiptPath(
    projectRoot,
    receiptId,
  );
  const stats = await lstat(path);
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    stats.size > MAX_DIAGNOSTIC_RECEIPT_BYTES
  ) {
    throw new Error("invalid receipt evidence");
  }
  const receipt = parseWorkerMaterializationReceipt(
    JSON.parse(await readFile(path, "utf8")),
  );
  if (receipt.receiptId !== receiptId) {
    throw new Error("receipt identity mismatch");
  }
  return receipt;
}

/**
 * Classifies only durable evidence in the project checkout. It deliberately
 * performs no remote lookup and returns bounded codes rather than local paths
 * or evidence content.
 */
export async function inspectOrgWorkerMaterialization(
  projectRoot: string,
): Promise<OrgWorkerMaterializationStatus> {
  let record: OrgWorkerMaterializationRecordV1 | null = null;
  try {
    record = await loadOrgWorkerMaterializationRecord(projectRoot);
  } catch {
    return {
      state: "unknown",
      issues: [
        {
          code: "ORG_WORKER_EVIDENCE_MALFORMED",
          severity: "error",
        },
      ],
    };
  }

  let journal;
  try {
    journal = await loadOrgWorkerMaterializationJournal(projectRoot);
  } catch {
    return {
      state: "unknown",
      ...(record ? materializationIdentity(record) : {}),
      issues: [
        {
          code: "ORG_WORKER_EVIDENCE_MALFORMED",
          severity: "error",
        },
      ],
    };
  }
  if (journal) {
    return {
      state: "blocked",
      ...(record ? materializationIdentity(record) : {}),
      issues: [
        {
          code: "ORG_WORKER_OPERATION_INCOMPLETE",
          severity: "error",
        },
      ],
    };
  }

  if (!record) {
    const receiptsRoot =
      resolveWorkerMaterializationReceiptsRoot(projectRoot);
    try {
      if (
        existsSync(receiptsRoot) &&
        readdirSync(receiptsRoot).length > 0
      ) {
        return {
          state: "unknown",
          issues: [
            {
              code: "ORG_WORKER_EVIDENCE_ORPHANED",
              severity: "error",
            },
          ],
        };
      }
    } catch {
      return {
        state: "unknown",
        issues: [
          {
            code: "ORG_WORKER_EVIDENCE_MALFORMED",
            severity: "error",
          },
        ],
      };
    }
    return { state: "absent", issues: [] };
  }

  const issues: OrgWorkerMaterializationStatus["issues"] = [];
  let hasMissingEvidence = false;
  const add = (
    code: OrgWorkerMaterializationIssueCode,
    kind: "missing" | "mismatch" = "mismatch",
  ) => {
    if (!issues.some((issue) => issue.code === code)) {
      issues.push({ code, severity: "error" });
    }
    if (kind === "missing") hasMissingEvidence = true;
  };

  const paths = transactionPaths(projectRoot);
  let configBytes: string | null = null;
  let lockBytes: string | null = null;
  try {
    [configBytes, lockBytes] = await Promise.all([
      readFile(paths.configTarget, "utf8"),
      readFile(paths.lockTarget, "utf8"),
    ]);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      add("ORG_WORKER_EVIDENCE_MISSING", "missing");
    } else {
      add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
    }
  }
  if (
    configBytes !== null &&
    lockBytes !== null &&
    (digestBytes(configBytes) !== record.projectState.configDigest ||
      digestBytes(lockBytes) !== record.projectState.lockDigest)
  ) {
    add("ORG_WORKER_PROJECT_STATE_DRIFT");
  }

  let lock: Awaited<ReturnType<typeof loadCardLock>> = null;
  if (lockBytes !== null) {
    try {
      lock = await loadCardLock(projectRoot);
    } catch {
      add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
    }
  }

  let receipt;
  let priorVerifiedReceipt:
    | WorkerMaterializationReceiptV1
    | undefined;
  try {
    receipt = await readDiagnosticReceipt(
      projectRoot,
      record.lastVerifiedReceiptId,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      add("ORG_WORKER_EVIDENCE_MISSING", "missing");
    } else {
      add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
    }
  }
  if (receipt) {
    const removed = record.materializationState === "removed";
    const verifiedPins = record.artifactBindings.map(
      ({ artifactPinRef }) => artifactPinRef,
    );
    const activeConsentIds = record.instructionConsentEvidence.map(
      ({ consentId }) => consentId,
    );
    const expectedAction = removed
      ? "remove"
      : (["materialize", "reconcile"] as const).includes(
            receipt.action as "materialize" | "reconcile",
          )
        ? receipt.action
        : null;
    const projectionMatches = removed
      ? receipt.instructionProjection.state === "removed" &&
        receipt.instructionProjection.adapterState ===
          record.projection.adapterState
      : receipt.instructionProjection.state ===
          (record.projection.instructionId ? "current" : "absent") &&
        receipt.instructionProjection.instructionId ===
          (record.projection.instructionId ?? undefined) &&
        receipt.instructionProjection.contentDigest ===
          (record.projection.contentDigest ?? undefined) &&
        receipt.instructionProjection.ownershipHash ===
          (record.projection.ownershipHash ?? undefined) &&
        receipt.instructionProjection.adapterState ===
          record.projection.adapterState;
    if (
      receipt.receiptId !== record.lastVerifiedReceiptId ||
      expectedAction === null ||
      receipt.action !== expectedAction ||
      receipt.outcome !== (removed ? "removed" : "verified") ||
      receipt.sourceBundle.digest !== record.sourceBundle.digest ||
      receipt.sourceBundle.workerId !== record.sourceBundle.workerId ||
      receipt.sourceBundle.sourceBlueprint.id !==
        record.sourceBundle.blueprintId ||
      receipt.sourceBundle.sourceBlueprint.revision !==
        record.sourceBundle.blueprintRevision ||
      receipt.sourceBundle.sourceBlueprint.digest !==
        record.sourceBundle.blueprintDigest ||
      receipt.projectState.configDigest !==
        record.projectState.configDigest ||
      receipt.projectState.lockDigest !==
        record.projectState.lockDigest ||
      !sameStrings(
        receipt.projectState.orderedRootNames,
        record.projectState.orderedRootNames,
      ) ||
      receipt.projectState.activeWorker !==
        record.projectState.activeWorker ||
      !sameStrings(
        receipt.artifactVerification.verifiedPinRefs,
        verifiedPins,
      ) ||
      (!removed &&
        !sameStrings(receipt.verifiedConsentIds, activeConsentIds)) ||
      !projectionMatches
    ) {
      add("ORG_WORKER_RECEIPT_MISMATCH");
    }

    if (removed) {
      if (!receipt.priorReceiptDigest) {
        add("ORG_WORKER_RECEIPT_MISMATCH");
      } else {
        try {
          const receiptRoot =
            resolveWorkerMaterializationReceiptsRoot(projectRoot);
          const entries = readdirSync(receiptRoot, {
            withFileTypes: true,
          });
          if (
            entries.length > MAX_DIAGNOSTIC_RECEIPTS ||
            entries.some(
              (entry) =>
                !entry.isFile() ||
                entry.isSymbolicLink() ||
                !/^[A-Za-z0-9._-]+\.json$/.test(entry.name),
            )
          ) {
            add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
          } else {
            const priorMatches = [];
            for (const entry of entries) {
              if (
                entry.name === `${record.lastVerifiedReceiptId}.json`
              ) {
                continue;
              }
              const candidateId = entry.name.slice(0, -5);
              const candidatePath = join(receiptRoot, entry.name);
              const candidateStats = await lstat(candidatePath);
              if (
                candidateStats.isSymbolicLink() ||
                !candidateStats.isFile() ||
                candidateStats.size >
                  MAX_DIAGNOSTIC_RECEIPT_BYTES
              ) {
                throw new Error("invalid receipt evidence");
              }
              const candidate = await readDiagnosticReceipt(
                projectRoot,
                candidateId,
              );
              if (
                computeWorkerMaterializationReceiptDigest(candidate) ===
                receipt.priorReceiptDigest
              ) {
                priorMatches.push(candidate);
              }
            }
            const prior = priorMatches[0];
            if (priorMatches.length === 0) {
              add("ORG_WORKER_EVIDENCE_MISSING", "missing");
            } else if (
              priorMatches.length !== 1 ||
              !prior ||
              prior.outcome !== "verified" ||
              (prior.action !== "materialize" &&
                prior.action !== "reconcile") ||
              prior.sourceBundle.digest !==
                record.sourceBundle.digest ||
              prior.sourceBundle.workerId !==
                record.sourceBundle.workerId ||
              prior.sourceBundle.sourceBlueprint.id !==
                record.sourceBundle.blueprintId ||
              prior.sourceBundle.sourceBlueprint.revision !==
                record.sourceBundle.blueprintRevision ||
              prior.sourceBundle.sourceBlueprint.digest !==
                record.sourceBundle.blueprintDigest ||
              !sameStrings(
                prior.artifactVerification.verifiedPinRefs,
                verifiedPins,
              ) ||
              !sameStrings(
                receipt.verifiedConsentIds,
                prior.verifiedConsentIds,
              )
            ) {
              add("ORG_WORKER_RECEIPT_MISMATCH");
            } else {
              priorVerifiedReceipt = prior;
            }
          }
        } catch {
          add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
        }
      }
    }
  }

  if (lock) {
    const cardsByName = new Map(
      lock.cards.map((card) => [card.name, card]),
    );
    for (const binding of record.artifactBindings) {
      const card = cardsByName.get(binding.cardName);
      const vendorDir = resolveProjectVendorTree(
        projectRoot,
        binding.cardName,
        binding.treeSha,
      );
      if (record.materializationState === "removed" && !card) {
        if (
          existsSync(vendorDir) ||
          existsSync(
            resolveVendorManifestSidecarPath(
              projectRoot,
              binding.cardName,
              binding.treeSha,
            ),
          )
        ) {
          add("ORG_WORKER_REMOVAL_DRIFT");
        }
        continue;
      }
      if (
        !card ||
        card.version !== binding.version ||
        card.integrity !== binding.integrity ||
        card.treeSha !== binding.treeSha ||
        card.git?.commit !== binding.gitCommit
      ) {
        add(
          record.materializationState === "removed"
            ? "ORG_WORKER_REMOVAL_DRIFT"
            : "ORG_WORKER_PROJECT_STATE_DRIFT",
        );
        continue;
      }
      if (!existsSync(vendorDir)) {
        add("ORG_WORKER_EVIDENCE_MISSING", "missing");
        continue;
      }
      try {
        const verified = await verifyVendorTreeAgainstLock(
          vendorDir,
          binding.integrity,
        );
        if (!verified.ok) {
          add("ORG_WORKER_ARTIFACT_DRIFT");
          continue;
        }
        if (
          (await computeWorkerArtifactGitTreeSha(vendorDir)) !==
          binding.treeSha
        ) {
          add("ORG_WORKER_ARTIFACT_DRIFT");
        }
        const sidecar = await loadVendorManifestSidecar(
          resolveVendorManifestSidecarPath(
            projectRoot,
            binding.cardName,
            binding.treeSha,
          ),
        );
        if (!sidecar) {
          add("ORG_WORKER_EVIDENCE_MISSING", "missing");
        } else if (
          sidecar.card !== binding.cardName ||
          sidecar.treeSha !== binding.treeSha ||
          sidecar.integrity !== binding.integrity ||
          !validateSidecarSelfConsistency(sidecar, {
            projectRoot,
            vendorDir,
          }).ok
        ) {
          add("ORG_WORKER_ARTIFACT_DRIFT");
        }
      } catch {
        add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
      }
    }
  }

  if (record.materializationState === "removed") {
    const instructionsPath = join(projectRoot, "AGENTS.md");
    if (existsSync(instructionsPath)) {
      try {
        const block = parseManagedBlock(
          new Uint8Array(await readFile(instructionsPath)),
          INSTRUCTION_BLOCK_MARKERS,
        );
        if (block.state === "malformed") {
          add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
        } else if (
          block.state === "present" &&
          (
            priorVerifiedReceipt?.projectState.orderedRootNames ??
            record.artifactBindings.map(({ cardName }) => cardName)
          ).some((rootName) =>
            new TextDecoder()
              .decode(block.block)
              .includes(`Instruction-ID: worker:${rootName}\n`),
          )
        ) {
          add("ORG_WORKER_REMOVAL_DRIFT");
        }
      } catch {
        add("ORG_WORKER_EVIDENCE_MALFORMED", "missing");
      }
    }
  }

  const hasLocalConsent = Boolean(
    lock?.cards.some((card) => card.instructionConsent),
  );
  const hasOrgConsent =
    record.materializationState !== "removed" &&
    record.instructionConsentEvidence.length > 0;
  const instructionConsentSource =
    hasLocalConsent && hasOrgConsent
      ? "mixed"
      : hasOrgConsent
        ? "organization"
        : hasLocalConsent
          ? "local"
          : undefined;

  return {
    state:
      issues.length === 0
        ? record.materializationState === "removed"
          ? "removed"
          : "current"
        : hasMissingEvidence
          ? "unknown"
          : "drifted",
    ...materializationIdentity(record),
    ...(instructionConsentSource
      ? { instructionConsentSource }
      : {}),
    issues,
  };
}

export async function buildEffectiveStateForDiagnostics(
  options: Parameters<typeof buildEffectiveState>[0],
) {
  try {
    return await buildEffectiveState(options);
  } catch (error) {
    if (
      !(error instanceof DrwnError) ||
      error.code !== "ORG_WORKER_MATERIALIZATION_DRIFT"
    ) {
      throw error;
    }
    return buildEffectiveState({
      ...options,
      organizationInstructionConsent: {
        workerId: "diagnostics",
        artifactPinRefsByCard: {},
        evidence: [],
      },
    });
  }
}

export async function buildMachineStatusV2(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
): Promise<MachineStatusV2> {
  const [machine, repoConfig, skillInventory, userMcpLibrary] = await Promise.all([
    readMachineConfig(agentsDir),
    loadConfig(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
    loadMcpLibrary(agentsDir),
  ]);
  const { config: effectiveConfig } = await loadEffectiveConfig(repoConfig, agentsDir);
  const issues: string[] = [];
  const lock = machine.capabilities.workerLock;
  const selectedRoot = machine.capabilities.activeWorker === null
    ? null
    : lock?.workerRoots.find((root) => root.name === machine.capabilities.activeWorker) ?? null;
  const cardsByName = new Map((lock?.cards ?? []).map((card) => [card.name, card]));
  const activeCards = selectedRoot
    ? [selectedRoot.name, ...selectedRoot.members].flatMap((name) => {
        const card = cardsByName.get(name);
        return card ? [card] : [];
      })
    : [];
  let resolved: Awaited<ReturnType<typeof resolveMachineCapabilities>> | null = null;
  try {
    resolved = await resolveMachineCapabilities({ repoRoot, agentsDir });
  } catch (error) {
    if (!(error instanceof DrwnError)) throw error;
    issues.push(`${error.code}: ${error.message}`);
  }

  const status = resolved ? "resolved" as const : "unavailable" as const;
  const skills: MachineStatusCapability[] = resolved
    ? resolved.skills.map((skill) => ({
        id: skill.id,
        provenance: "worker",
        cardName: skill.cardName,
        cardVersion: skill.cardVersion,
        source: "worker",
        status,
      }))
    : activeCards.flatMap((card) => card.skills.map((id) => ({
        id,
        provenance: "worker" as const,
        cardName: card.name,
        cardVersion: card.version,
        source: "worker" as const,
        status,
      })));
  const mcpServers: MachineStatusCapability[] = resolved
    ? resolved.mcpServers.map((server) => ({
        id: server.id,
        provenance: "worker",
        cardName: server.cardName,
        cardVersion: server.cardVersion,
        source: "worker",
        status,
      }))
    : collectEffectiveCardServerDefinitions(activeCards).map((definition) => ({
        id: definition.serverName,
        provenance: "worker" as const,
        cardName: definition.cardName,
        cardVersion: definition.cardVersion,
        source: "worker" as const,
        status,
      }));

  const consentByCard = new Map(activeCards.map((card) => {
    const hooks = isHookConsentValid(card);
    let instructions = card.manifest.instructions === undefined;
    if (!instructions) {
      const contentRoot = resolved?.contentRootsByCard[card.name];
      if (contentRoot) {
        try {
          const contribution = resolveExplicitInstructionContribution(card, contentRoot);
          instructions = contribution !== null && isInstructionConsentValid(card, contribution);
        } catch {
          instructions = false;
        }
      }
    }
    if (!hooks) issues.push(`${card.name} hook consent is missing or stale`);
    if (!instructions) issues.push(`${card.name} instruction consent is missing or stale`);
    return [card.name, { hooks, instructions }] as const;
  }));

  const machineRecordPath = resolveGlobalWriteRecordPath(agentsDir);
  let record = null;
  try {
    record = loadWriteRecord(machineRecordPath, "machine");
  } catch (error) {
    if (!(error instanceof DrwnError)) throw error;
    issues.push(`${error.code}: ${error.message}`);
  }
  let conflicts: MachineProjectionConflict[] = [];
  let current = false;
  if (issues.length === 0) {
    const state = await buildEffectiveState({
      repoRoot,
      agentsDir,
      homeDir,
      dryRun: true,
      forceMachineScope: true,
      scope: "machine",
    });
    conflicts = collectMachineProjectionConflicts(state, record);
    const difference = diffWriteRecord(record, planMachineManagedPaths(state));
    current = conflicts.length === 0 && difference.toAdd.length === 0 && difference.toRemove.length === 0;
  }

  const counts = {
    resolvedSkills: skills.filter((entry) => entry.status === "resolved").length,
    missingSkills: skills.filter((entry) => entry.status === "unavailable").length,
    resolvedMcpServers: mcpServers.filter((entry) => entry.status === "resolved").length,
    missingMcpServers: mcpServers.filter((entry) => entry.status === "unavailable").length,
  };
  return {
    schema: "drwn.machine-status",
    schemaVersion: 2,
    repoRoot,
    agentsDir,
    homeDir,
    enabledTargets: Object.entries(effectiveConfig.targets).filter(([, target]) => target.enabled).map(([id]) => id),
    config: { schema: machine.schema, schemaVersion: machine.schemaVersion },
    selection: {
      activeWorker: machine.capabilities.activeWorker,
      installedRoots: (lock?.workerRoots ?? []).map((root) => ({
        name: root.name,
        requested: root.requested,
        kind: "blueprint",
        members: [...root.members],
        selected: root.name === machine.capabilities.activeWorker,
      })),
      activeClosure: activeCards.map((card) => ({
        name: card.name,
        requested: card.requested,
        version: card.version,
        integrity: card.integrity,
        ...(card.treeSha ? { treeSha: card.treeSha } : {}),
        origin: card.origin,
        consent: consentByCard.get(card.name) ?? { hooks: false, instructions: false },
      })),
    },
    capabilities: { skills, mcpServers, counts },
    projection: {
      healthy: issues.length === 0 && conflicts.length === 0,
      current,
      recordPresent: existsSync(machineRecordPath),
      conflicts,
      issues,
    },
    inventory: { skillCount: skillInventory.length, mcpServerCount: Object.keys(userMcpLibrary.servers).length },
  };
}

function projectItem(
  id: string,
  sourceKind: ProjectStatusItem["sourceKind"],
  sourceId: string,
  sourcePath: string,
  target: string,
  health: ProjectStatusItem["health"] = "declared",
): ProjectStatusItem {
  return { id, sourceKind, sourceId, sourcePath, target, health };
}

function inspectInstructionDelivery(
  state: EffectiveState,
): ProjectStatusV1["instructionDelivery"] {
  const issues: ProjectStatusV1["instructionDelivery"]["issues"] = [];
  const composition = instructionCompositionForState(state);
  for (const excluded of composition.excluded) {
    issues.push({
      code:
        excluded.expectedEvidenceKind === "org_worker_bundle_consent"
          ? "INSTRUCTIONS_ORG_CONSENT_INVALID"
          : "INSTRUCTIONS_CONSENT_REQUIRED",
      severity: "error",
    });
  }
  let record: ReturnType<typeof loadWriteRecord> = null;
  try {
    record = loadWriteRecord(state.recordPath, "project");
  } catch (error) {
    if (!(error instanceof DrwnError) || error.code !== "WRITE_RECORD_INVALID") {
      throw error;
    }
  }
  const instructionEntry = record?.managedPaths.find(
    (entry) => entry.surface === "instructions" && entry.path === "AGENTS.md",
  );
  const expectedOwnership =
    instructionEntry?.kind === "managed-fields"
      ? instructionEntry.fieldHashes["drwn:instructions"]
      : undefined;
  const agentsPath = join(state.projectRoot!, "AGENTS.md");
  const agentsBytes = existsSync(agentsPath)
    ? new Uint8Array(readFileSync(agentsPath))
    : new Uint8Array();
  const parsed = parseManagedBlock(agentsBytes, INSTRUCTION_BLOCK_MARKERS);
  let ownershipHash: string | undefined;
  let instructionId: string | undefined;
  let stateValue: ProjectStatusV1["instructionDelivery"]["state"] = "absent";
  if (parsed.state === "malformed") {
    issues.push({ code: "INSTRUCTIONS_BLOCK_MALFORMED", severity: "error" });
    stateValue = "blocked";
  } else if (parsed.state === "present") {
    ownershipHash = hashManagedContent(parsed.block);
    const blockText = new TextDecoder().decode(parsed.block);
    instructionId = blockText.match(/^Instruction-ID:\s*(.+)$/m)?.[1];
    const expectedId = `worker:${state.workerSelection?.selectedRoot?.name ?? "none"}`;
    if (instructionId !== expectedId) {
      issues.push({ code: "INSTRUCTIONS_ID_STALE", severity: "error" });
    }
    if (!expectedOwnership || ownershipHash !== expectedOwnership) {
      issues.push({ code: "INSTRUCTIONS_OWNERSHIP_DRIFT", severity: "error" });
    }
    if (
      composition.contentDigest &&
      !blockText.includes(`Content-Digest: ${composition.contentDigest}`)
    ) {
      issues.push({ code: "INSTRUCTIONS_CONTENT_STALE", severity: "error" });
    }
    stateValue = issues.some((issue) => issue.severity === "error")
      ? "drifted"
      : "current";
  } else if (composition.bytes) {
    issues.push({ code: "INSTRUCTIONS_CONTENT_STALE", severity: "error" });
    stateValue = "drifted";
  }

  const adapterPath = join(state.projectRoot!, ".claude", "CLAUDE.md");
  let adapter: ProjectStatusV1["instructionDelivery"]["adapter"] = "absent";
  if (existsSync(adapterPath)) {
    const bytes = new Uint8Array(readFileSync(adapterPath));
    const text = new TextDecoder().decode(bytes);
    const adapterEntry = record?.managedPaths.find(
      (entry) =>
        entry.surface === "instructions" &&
        entry.path === ".claude/CLAUDE.md",
    );
    const adapterBlock = parseManagedBlock(bytes, CLAUDE_ADAPTER_BLOCK_MARKERS);
    if (adapterBlock.state === "malformed") {
      adapter = "drifted";
      issues.push({ code: "CLAUDE_ADAPTER_DRIFT", severity: "warning" });
    } else if (
      adapterEntry?.kind === "managed-content" &&
      hashManagedContent(bytes) === adapterEntry.contentHash
    ) {
      adapter = "owned";
    } else if (
      adapterEntry?.kind === "managed-fields" &&
      adapterBlock.state === "present" &&
      hashManagedContent(adapterBlock.block) ===
        adapterEntry.fieldHashes["drwn:claude-adapter"]
    ) {
      adapter = "owned";
    } else if (/^\s*@\.\.\/AGENTS\.md\s*$/m.test(text)) {
      adapter = "foreign-valid";
    } else if (adapterEntry) {
      adapter = "drifted";
      issues.push({ code: "CLAUDE_ADAPTER_DRIFT", severity: "warning" });
    } else {
      adapter = "foreign-missing";
      if (composition.bytes) {
        issues.push({ code: "CLAUDE_ADAPTER_MISSING", severity: "advisory" });
      }
    }
  } else if (composition.bytes) {
    issues.push({ code: "CLAUDE_ADAPTER_MISSING", severity: "advisory" });
  }

  return {
    state: stateValue,
    ...(instructionId ? { instructionId } : {}),
    ...(composition.contentDigest
      ? { contentDigest: composition.contentDigest }
      : {}),
    ...(ownershipHash ? { ownershipHash } : {}),
    consentEvidence: composition.included.map((item) => ({
      card: item.card,
      kind: item.evidenceKind,
      evidenceId: item.evidenceId,
    })),
    adapter,
    issues,
  };
}

// Restricts the shadowing inspector to the opencode-projected subset: only skills whose
// resolved scope reaches the dedicated dir can be shadowed inside OpenCode sessions.
async function opencodeProjectedSkillIds(
  state: Pick<EffectiveState, "lockedCards" | "contentRootsByCard" | "machineCapabilities">,
  options: { repoRoot: string; agentsDir: string },
  skillIds: string[],
) {
  const machineSources = Object.fromEntries(
    (state.machineCapabilities?.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const projected: string[] = [];
  for (const id of [...new Set(skillIds)]) {
    const source = await resolveSkillSource(
      id,
      state.lockedCards,
      options.repoRoot,
      options.agentsDir,
      state.contentRootsByCard,
      machineSources,
    );
    if (source.layer === "missing") {
      continue;
    }
    const scope = source.layer === "card" ? "shared" : source.scope;
    if (isOpencodeProjectedScope(scope)) {
      projected.push(id);
    }
  }
  return projected;
}

export async function buildProjectStatusV1(options: {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  projectConfigPath?: string | null;
}): Promise<ProjectStatusV1 | null> {
  if (!options.projectConfigPath) return null;
  const projectRoot = resolveProjectRootFromConfigPath(options.projectConfigPath);
  const orgWorkerMaterialization =
    await inspectOrgWorkerMaterialization(projectRoot);
  const state = await buildEffectiveStateForDiagnostics({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    cwd: projectRoot,
  });
  if (!state.projectConfig || !state.workerSelection) return null;
  const configPath = state.projectConfigPath!;
  const cardByName = new Map(state.lockedCards.map((card) => [card.name, card]));
  const installedWorkers = state.workerSelection.installedRoots.map((root) => {
    const card = cardByName.get(root.name);
    const sourceKind = state.cardLanes[root.name] === "localOverlay" ? "local-overlay" : "worker-root";
    return projectItem(root.name, sourceKind, root.requested, card?.path ?? configPath, "project", "installed");
  });
  const activeCards = state.activeCards.map((card) => {
    const sourceKind = state.cardLanes[card.name] === "localOverlay" ? "local-overlay" : "card";
    return projectItem(
      card.name,
      sourceKind,
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "project",
      "active",
    );
  });
  const overlayItem = (id: string, target: string) => projectItem(id, "project-overlay", id, configPath, target);
  const projectOverlays = {
    skills: [
      ...(state.projectConfig.skills?.include ?? []).map((id) => overlayItem(id, "skills:include")),
      ...(state.projectConfig.skills?.exclude ?? []).map((id) => overlayItem(id, "skills:exclude")),
    ],
    mcp: Object.keys(state.projectConfig.mcpServers ?? {}).sort().map((id) => overlayItem(id, "mcp")),
    extensions: Object.keys(state.projectConfig.extensions ?? {}).sort().map((id) => overlayItem(id, "extension")),
    targets: Object.keys(state.projectConfig.targets ?? {}).sort().map((id) => overlayItem(id, "target")),
    hookControls: Object.keys(state.projectConfig.hooks ?? {}).sort().map((id) => overlayItem(id, "hooks")),
  };
  const skillItems = state.activeCards.flatMap((card) =>
    card.skills.map((id) => projectItem(
      id,
      "card",
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "skills",
      "active",
    )),
  );
  for (const id of state.projectConfig.skills?.include ?? []) {
    if (!skillItems.some((entry) => entry.id === id)) skillItems.push(overlayItem(id, "skills"));
  }
  const mcpItems = state.cardServerDefinitions
    .filter((definition) => Object.hasOwn(state.activeServers, definition.serverName))
    .map((definition) => {
      const card = cardByName.get(definition.cardName);
      return projectItem(
        definition.serverName,
        "card",
        `${definition.cardName}@${definition.cardVersion}`,
        card ? (state.contentRootsByCard[card.name] ?? card.path) : configPath,
        "mcp",
        "active",
      );
    });
  for (const id of Object.keys(state.projectConfig.mcpServers ?? {})) {
    if (Object.hasOwn(state.activeServers, id) && !mcpItems.some((entry) => entry.id === id)) {
      mcpItems.push(overlayItem(id, "mcp"));
    }
  }
  const hookItems = state.activeCards.flatMap((card) =>
    card.hooks.map((id) => projectItem(
      id,
      "card",
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "hooks",
      "active",
    )),
  );
  const ambient = await inspectAmbientCapabilities({
    config: state.repoConfig,
    homeDir: options.homeDir,
    declaredSkillIds: skillItems.map((entry) => entry.id),
    declaredMcpIds: mcpItems.map((entry) => entry.id),
  });
  const opencodeSkillShadowing = state.effectiveConfig.targets.opencode?.enabled
    ? await inspectOpencodeSkillShadowing({
        projectRoot,
        homeDir: options.homeDir,
        agentsDir: options.agentsDir,
        projectedSkillIds: await opencodeProjectedSkillIds(state, options, skillItems.map((entry) => entry.id)),
      })
    : [];
  let projection: { current: boolean; issues: string[] };
  try {
    projection = await planRepositoryProjection({
      repoRoot: options.repoRoot,
      agentsDir: options.agentsDir,
      homeDir: options.homeDir,
      cwd: projectRoot,
    });
  } catch (error) {
    if (
      !(error instanceof DrwnError) ||
      error.code !== "ORG_WORKER_MATERIALIZATION_DRIFT"
    ) {
      throw error;
    }
    projection = {
      current: false,
      issues: ["ORG_WORKER_MATERIALIZATION_DRIFT"],
    };
  }
  const instructionDelivery = inspectInstructionDelivery(state);
  if (
    orgWorkerMaterialization.state === "current" &&
    (instructionDelivery.state === "drifted" ||
      instructionDelivery.state === "blocked" ||
      (orgWorkerMaterialization.instructionConsentSource !== undefined &&
        instructionDelivery.state !== "current"))
  ) {
    orgWorkerMaterialization.state = "drifted";
    if (
      !orgWorkerMaterialization.issues.some(
        ({ code }) => code === "ORG_WORKER_PROJECTION_DRIFT",
      )
    ) {
      orgWorkerMaterialization.issues.push({
        code: "ORG_WORKER_PROJECTION_DRIFT",
        severity: "error",
      });
    }
  }
  return {
    schema: "drwn.project-status",
    schemaVersion: 1,
    installedWorkers,
    activeWorker: state.workerSelection.activeWorker,
    activeCards,
    selectionSource: state.workerSelection.selectionSource,
    localOverrides: { ...state.workerSelection.localOverrides },
    projectOverlays,
    declaredCapabilities: { skills: skillItems, mcp: mcpItems, hooks: hookItems },
    ambientCapabilities: {
      observations: ambient,
      collisions: state.ambientCollisions,
      opencodeSkillShadowing,
      enforcement: "target-native",
    },
    projection: { current: projection.current, issues: projection.issues },
    instructionDelivery,
    orgWorkerMaterialization,
  };
}

export async function buildStatusReport(repoRoot: string, agentsDir: string, homeDir: string, projectConfigPath?: string | null) {
  const machineStatus = await buildMachineStatusV2(repoRoot, agentsDir, homeDir);
  let projectSummary: ReturnType<typeof summarizeProjectConfig> | undefined;

  if (projectConfigPath) {
    const state = await buildEffectiveStateForDiagnostics({
      repoRoot,
      agentsDir,
      homeDir,
      cwd: resolveProjectRootFromConfigPath(projectConfigPath),
    });
    projectSummary = state.projectConfig ? summarizeProjectConfig(state.projectConfig) : undefined;
  }

  return {
    ...machineStatus,
    project: projectSummary && projectConfigPath
      ? {
          configPath: projectConfigPath,
          ...projectSummary,
        }
      : undefined,
  };
}

function readWriteRecordStatus(
  path: string,
  scope: "project" | "machine",
): DiagnosticsSections["writeRecord"] {
  const present = existsSync(path);
  let record = null;
  let corrupt = false;
  try {
    record = loadWriteRecord(path, scope);
  } catch (error) {
    if (!(error instanceof DrwnError) || error.code !== "WRITE_RECORD_INVALID") throw error;
    corrupt = true;
  }
  return {
    path,
    present,
    corrupt,
    managedPathCount: record?.managedPaths.length ?? 0,
    lastWriteAt: record?.lastWriteAt,
    lastWriteHarnessVersion: record?.lastWriteHarnessVersion,
  };
}

function currentStateStatus(agentsDir: string): DiagnosticsSections["store"] {
  const metadataPath = resolveStoreMetadataPath(agentsDir);
  const countMarkedDirectories = (root: string, marker: string) => {
    if (!existsSync(root)) return 0;
    let count = 0;
    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      if (entries.some((entry) => entry.name === marker && (entry.isFile() || entry.isSymbolicLink()))) {
        count += 1;
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
      }
    };
    walk(root);
    return count;
  };
  const countJsonRecords = (root: string) => existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("."))
        .length
    : 0;
  let schemaVersion: number | null = null;
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { schemaVersion?: unknown };
    schemaVersion = typeof metadata.schemaVersion === "number" ? metadata.schemaVersion : null;
  }
  return {
    path: resolveStoreRoot(agentsDir),
    initialized: existsSync(metadataPath),
    schemaVersion,
    cardCount: countMarkedDirectories(resolveCardsRoot(agentsDir), "HEAD"),
    legacySourceCount: countMarkedDirectories(join(resolveStoreRoot(agentsDir), "sources"), "card.json"),
    skillBundleCount: countMarkedDirectories(resolveStoreSkillsRoot(agentsDir), "current"),
    mcpServerCount: countJsonRecords(resolveStoreMcpServersDir(agentsDir)),
  };
}

export async function buildDiagnosticsSections(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DiagnosticsSections> {
  const [repoConfig, repoSkills, store, machineStatus] = await Promise.all([
    loadConfig(repoRoot),
    listRepoSkills(repoRoot),
    currentStateStatus(agentsDir),
    buildMachineStatusV2(repoRoot, agentsDir, homeDir),
  ]);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const projectState = projectConfigPath
    ? await buildEffectiveStateForDiagnostics({
        repoRoot,
        agentsDir,
        homeDir,
        cwd: resolveProjectRootFromConfigPath(projectConfigPath),
      })
    : null;
  const projectRoot = projectState?.projectRoot ?? null;
  const projectConfig = projectState?.projectConfig ?? null;
  const cardLocks = projectState?.activeCards ?? [];
  const effectiveConfig = projectState?.effectiveConfig ?? loadedConfig.config;
  const activeServers = projectState?.activeServers ?? {};
  const lock = projectRoot ? await loadCardLock(projectRoot) : null;
  const writeRecordPath = projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(agentsDir);

  const cardIncludes = projectState
    ? cardLocks.flatMap((card) =>
        (card.manifest.skills?.include ?? []).map((skill) => ({ card: `${card.name}@${card.version}`, skill })),
      )
    : machineStatus.capabilities.skills.map((skill) => ({
        card: `${skill.cardName}@${skill.cardVersion}`,
        skill: skill.id,
      }));
  const cardServers = projectState
    ? cardLocks.flatMap((card) =>
        Object.keys(card.manifest.servers ?? {}).map((server) => ({ card: `${card.name}@${card.version}`, server })),
      )
    : machineStatus.capabilities.mcpServers.map((server) => ({
        card: `${server.cardName}@${server.cardVersion}`,
        server: server.id,
      }));

  return {
    machine: { repoRoot, agentsDir, homeDir },
    project: projectConfigPath && projectRoot && projectConfig
      ? { configPath: projectConfigPath, root: projectRoot, cardCount: projectConfig.workers.length }
      : undefined,
    store,
    writeRecord: readWriteRecordStatus(writeRecordPath, projectRoot ? "project" : "machine"),
    skills: {
      inventoryCount: repoSkills.length,
      activeCount: projectState
        ? new Set(stateSkillNames(projectState)).size
        : machineStatus.capabilities.counts.resolvedSkills,
      projectIncludes: projectConfig?.skills?.include ?? [],
      projectExcludes: projectConfig?.skills?.exclude ?? [],
      cardIncludes,
    },
    mcp: {
      activeServerCount: projectState
        ? Object.keys(activeServers).length
        : machineStatus.capabilities.counts.resolvedMcpServers,
      projectServers: Object.keys(projectConfig?.mcpServers ?? {}),
      cardServers,
    },
    extensions: {
      projectExtensions: Object.keys(projectConfig?.extensions ?? {}),
    },
    cards: {
      configuredRefs: projectState
        ? projectConfig?.workers ?? []
        : machineStatus.selection.installedRoots.map((root) => root.requested),
      lockedVersions: projectState
        ? (lock?.cards ?? []).map((card) => `${card.name}@${card.version}`)
        : machineStatus.selection.activeClosure.map((card) => `${card.name}@${card.version}`),
      warnings: [],
    },
    versionFloor: evaluateVersionFloor(lock?.store?.minDrwnVersion),
    targets: {
      enabled: Object.entries(effectiveConfig.targets)
        .filter(([, target]) => target.enabled)
        .map(([name]) => name),
      projectOverrides: Object.entries(projectConfig?.targets ?? {}).map(([name, override]) =>
        `${name} ${override.enabled ? "enabled" : "disabled"}`,
      ),
    },
  };
}

function stateSkillNames(state: Pick<EffectiveState, "skillSelection">) {
  return state.skillSelection?.include ?? [];
}

export interface WhyAnswer {
  ok: boolean;
  message: string;
}

type WhyMatch = { kind: "skill" | "server" | "extension" | "target" | "card"; name: string; message: string };

function splitWhyQuery(query: string) {
  const match = query.match(/^(skill|server|extension|target|card):(.+)$/);
  return match ? { kind: match[1] as WhyMatch["kind"], name: match[2] ?? "" } : { kind: null, name: query };
}

function formatAmbiguous(name: string, matches: WhyMatch[]) {
  return `ambiguous: ${name} matched ${matches.map((match) => `${match.kind}:${match.name}`).join(", ")}\n`;
}

async function collectWhyMatches(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath: string | null | undefined,
  name: string,
) {
  const matches: WhyMatch[] = [];
  const [repoConfig, registry, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const userMcpLibrary = await loadMcpLibrary(agentsDir);
  const baseRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const projectState = projectConfigPath
    ? await buildEffectiveState({
        repoRoot,
        agentsDir,
        homeDir,
        cwd: resolveProjectRootFromConfigPath(projectConfigPath),
      })
    : null;
  const projectConfig = projectState?.projectConfig ?? null;
  const cardLocks = projectState?.activeCards ?? [];
  const effectiveConfig = projectState?.effectiveConfig ?? loadedConfig.config;
  const effectiveRegistry = projectState?.effectiveRegistry ?? baseRegistry;
  const machineStatus = projectState ? null : await buildMachineStatusV2(repoRoot, agentsDir, homeDir);
  const activeServerNames = new Set(
    projectState
      ? Object.keys(projectState.activeServers)
      : machineStatus?.capabilities.mcpServers.filter((server) => server.status === "resolved").map((server) => server.id),
  );

  const cardSkill = cardLocks.find((card) => card.manifest.skills?.include?.includes(name));
  const projectSkill = projectConfig?.skills?.include?.includes(name);
  const machineSkill = machineStatus?.capabilities.skills.find((skill) => skill.id === name);
  const inventorySkill = skillInventory.find((skill) => skill.name === name);
  if (cardSkill || projectSkill || machineSkill || inventorySkill) {
    const source = cardSkill
      ? `card ${cardSkill.name}@${cardSkill.version}`
      : projectSkill
        ? "project config"
        : machineSkill
          ? `machine Worker Card ${machineSkill.cardName}@${machineSkill.cardVersion}`
          : "repo or installed skill inventory";
    const state = cardSkill || projectSkill || (machineSkill?.status === "resolved") ? "active" : "available";
    matches.push({ kind: "skill", name, message: `skill:${name} is ${state} from ${source}.\n` });
  }

  const cardServer = cardLocks.find((card) => Object.hasOwn(card.manifest.servers ?? {}, name));
  const projectServer = projectConfig?.mcpServers && Object.hasOwn(projectConfig.mcpServers, name);
  const machineServer = machineStatus?.capabilities.mcpServers.find((server) => server.id === name);
  const registryServer = effectiveRegistry.servers[name];
  if (cardServer || projectServer || machineServer || registryServer) {
    const active = activeServerNames.has(name);
    const source = cardServer
      ? `card ${cardServer.name}@${cardServer.version}`
      : projectServer
        ? "project config"
        : machineServer
          ? `machine Worker Card ${machineServer.cardName}@${machineServer.cardVersion}`
          : "registry or standalone machine inventory";
    matches.push({ kind: "server", name, message: `server:${name} is ${active ? "active" : "available"} from ${source}.\n` });
  }

  if ((projectConfig?.extensions && Object.hasOwn(projectConfig.extensions, name)) || getExtension(name)) {
    const source = projectConfig?.extensions && Object.hasOwn(projectConfig.extensions, name) ? "project config" : "extension registry";
    matches.push({ kind: "extension", name, message: `extension:${name} is known from ${source}.\n` });
  }

  if (name === "claude" || name === "codex" || name === "cursor" || name === "opencode") {
    const override = projectConfig?.targets?.[name];
    const enabled = effectiveConfig.targets[name].enabled;
    matches.push({
      kind: "target",
      name,
      message: `target:${name} is ${enabled ? "enabled" : "disabled"}${override ? " by project config" : " by machine config"}.\n`,
    });
  }

  const projectCard = cardLocks.find((entry) => entry.name === name || `${entry.name}@${entry.version}` === name);
  if (projectCard) {
    matches.push({
      kind: "card",
      name: projectCard.name,
      message: `card:${projectCard.name} is locked at ${projectCard.version} from ${projectCard.requested}.\n`,
    });
  } else if (machineStatus) {
    const machineRoot = machineStatus.selection.installedRoots.find(
      (entry) => entry.name === name || entry.requested === name,
    );
    const machineCard = machineStatus.selection.activeClosure.find(
      (entry) => entry.name === name || `${entry.name}@${entry.version}` === name,
    );
    if (machineRoot) {
      const rootCard = machineStatus.selection.activeClosure.find(
        (entry) => entry.name === machineRoot.name,
      );
      const identity = rootCard
        ? `${machineRoot.name}@${rootCard.version}`
        : machineRoot.requested;
      const state = machineRoot.selected ? "active" : "installed inactive";
      matches.push({
        kind: "card",
        name: machineRoot.name,
        message: `card:${machineRoot.name} is the ${state} machine Worker root ${identity} from ${machineRoot.requested}.\n`,
      });
    } else if (machineCard) {
      matches.push({
        kind: "card",
        name: machineCard.name,
        message: `card:${machineCard.name} is active as machine Worker Card ${machineCard.name}@${machineCard.version} from ${machineCard.requested}.\n`,
      });
    }
  }

  return matches;
}

export async function explainStatus(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
) {
  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir, projectConfigPath);
  return [
    "Machine",
    `- repo: ${sections.machine.repoRoot}`,
    `- agents: ${sections.machine.agentsDir}`,
    "Store",
    `- path: ${sections.store.path}`,
    `- schema: ${sections.store.schemaVersion ?? "none"}`,
    "Cards",
    `- configured: ${sections.cards.configuredRefs.join(", ") || "none"}`,
    `- locked: ${sections.cards.lockedVersions.join(", ") || "none"}`,
    "Skills",
    `- project includes: ${sections.skills.projectIncludes.join(", ") || "none"}`,
    `- card includes: ${sections.skills.cardIncludes.map((entry) => `${entry.skill} from ${entry.card}`).join(", ") || "none"}`,
    "MCP",
    `- card servers: ${sections.mcp.cardServers.map((entry) => `${entry.server} from ${entry.card}`).join(", ") || "none"}`,
    "Targets",
    `- enabled: ${sections.targets.enabled.join(", ") || "none"}`,
    "Write record",
    `- ${sections.writeRecord.present ? `${sections.writeRecord.managedPathCount} managed paths` : "missing"}`,
  ].join("\n") + "\n";
}

export async function answerWhy(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath: string | null | undefined,
  query: string,
): Promise<WhyAnswer> {
  const parsed = splitWhyQuery(query);
  const matches = await collectWhyMatches(repoRoot, agentsDir, homeDir, projectConfigPath, parsed.name);
  const filtered = parsed.kind ? matches.filter((match) => match.kind === parsed.kind) : matches;
  if (filtered.length === 0) {
    return { ok: false, message: `not found: ${query}\n` };
  }
  if (!parsed.kind && filtered.length > 1) {
    return { ok: false, message: formatAmbiguous(parsed.name, filtered) };
  }
  return { ok: true, message: filtered[0]?.message ?? "" };
}

async function detectBrokenSymlinks(paths: string[]) {
  return paths.filter((pathValue) => lstatSafe(pathValue)?.isSymbolicLink() && !existsSync(pathValue));
}

async function detectStaleSkillSymlinks(
  repoRoot: string,
  agentsDir: string,
  toolRoot: string,
  skillOverrides?: { include?: string[]; exclude?: string[] },
  lockedCards: CardLockEntry[] = [],
) {
  const toolPaths = resolveToolPaths(toolRoot);
  const excluded = new Set(skillOverrides?.exclude ?? []);
  const resolvedSources = await Promise.all(
    (skillOverrides?.include ?? [])
      .filter((name) => !excluded.has(name))
      .map(async (name) => ({
        name,
        source: await resolveSkillSource(name, lockedCards, repoRoot, agentsDir),
      })),
  );
  const desiredClaude = new Set([
    ...resolvedSources
      .filter((entry) =>
        entry.source.layer === "card" ||
        (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "claude-only"))
      )
      .map((entry) => entry.name),
  ]);
  const desiredCodex = new Set([
    ...resolvedSources
      .filter((entry) =>
        entry.source.layer === "card" ||
        (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "codex-only"))
      )
      .map((entry) => entry.name),
  ]);

  return [
    ...(await findStaleManagedEntries(toolPaths.claudeSkills, desiredClaude)),
    ...(await findStaleManagedEntries(toolPaths.codexSkills, desiredCodex)),
  ];
}

export async function detectMcpDrift(
  config: CanonicalConfig,
  activeServers: Record<string, RegistryServer>,
  toolRoot: string,
) {
  const drifts: string[] = [];
  const toolPaths = resolveToolPaths(toolRoot);

  for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    const configPath = targetName === "claude"
      ? toolPaths.claudeMcp
      : targetName === "codex"
        ? toolPaths.codexConfig
        : targetName === "opencode"
          ? toolPaths.opencodeConfig
          : toolPaths.cursorMcp;

    if (targetName === "claude" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = renderJsonMcpConfig(activeServers);
      if (current !== expected) {
        drifts.push(`claude:${configPath}`);
      }
    }

    if (targetName === "codex" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeCodexTomlText(current, activeServers);
      const names = Object.keys(activeServers);
      const currentHashes = hashCodexManagedServers(current, names);
      const expectedHashes = hashCodexManagedServers(expected, names);
      if (names.some((name) => currentHashes[name] !== expectedHashes[name])) {
        drifts.push(`codex:${configPath}`);
      }
    }

    if (targetName === "opencode" && existsSync(configPath)) {
      const names = Object.keys(activeServers);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      } catch {
        drifts.push(`opencode:${configPath}`);
        parsed = {};
      }
      const rawServers = parsed.mcp;
      const currentServers = rawServers && typeof rawServers === "object" && !Array.isArray(rawServers)
        ? rawServers as Record<string, unknown>
        : {};
      const drifted = names.some((name) => {
        const currentValue = currentServers[name];
        if (currentValue === undefined) return true;
        return canonicalJsonHash(currentValue) !== canonicalJsonHash(renderMcpServerForTarget("opencode", activeServers[name]!));
      });
      if (drifted && !drifts.includes(`opencode:${configPath}`)) {
        drifts.push(`opencode:${configPath}`);
      }
    }

    if (targetName === "cursor" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const names = Object.keys(activeServers);
      const currentHashes = hashClaudeManagedServers(current, names);
      const drifted = names.some((name) => {
        const expected = canonicalJsonHash(renderMcpServerForTarget("cursor", activeServers[name]!));
        return currentHashes[mcpServerHashKey(name)] !== expected;
      });
      if (drifted) {
        drifts.push(`cursor:${configPath}`);
      }
    }
  }

  return drifts;
}

async function detectMissingGeneratedFiles(_config: CanonicalConfig, _generatedDir: string) {
  // Cursor MCP config is now written directly as managed content, so there is no
  // generated sidecar file that can go missing. Retained for output-shape stability.
  return [] as string[];
}

function detectHookIssues(cards: CardLockEntry[], generatedDir: string) {
  const issues: string[] = [];
  for (const card of cards) {
    if (card.hooks.length > 0 && !isHookConsentValid(card)) {
      issues.push(`Card ${card.name}@${card.version} has hooks without valid consent. Run drwn card trust ${card.name} --hooks.`);
    }
  }

  for (const pathValue of generatedComposerPaths(generatedDir)) {
    if (!existsSync(pathValue)) {
      continue;
    }
    const match = readFileSync(pathValue, "utf8").match(/drwn-version:\s*([^\s]+)/);
    if (match && match[1] !== DRWN_VERSION) {
      issues.push(`composer stale; rerun drwn write: ${pathValue}`);
    }
  }

  return issues;
}

function generatedComposerPaths(generatedDir: string) {
  const paths = [
    join(generatedDir, "hooks", "claude", "composer.mjs"),
    join(generatedDir, "hooks", "codex", "composer.mjs"),
    join(generatedDir, "hooks", "mastra", "composer.ts"),
  ];
  const workersDir = join(generatedDir, "workers");
  if (!existsSync(workersDir)) {
    return paths;
  }

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const pathValue = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(pathValue);
        continue;
      }
      if (entry.isFile() && (entry.name === "composer.mjs" || entry.name === "composer.ts")) {
        paths.push(pathValue);
      }
    }
  }

  walk(workersDir);
  return paths;
}

function buildSurfaceNotes(config: { targets: Record<string, { enabled: boolean }> }): string[] {
  const notes: string[] = [];
  for (const name of ALL_TARGET_NAMES) {
    const descriptor = getTargetDescriptor(name);
    if (config.targets[name]?.enabled && descriptor.surfaces.includes("cowork")) {
      notes.push(
        `The ${name} target also serves the Cowork surface; materialized skills, MCP servers, and hooks apply there too. ` +
          `Cowork runs in a workspace-trust VM, so review its trust and snapshot prompts.`,
      );
    }
  }
  return notes;
}

function isExecutableOnPath(command: string): boolean {
  const isWindows = process.platform === "win32";
  const exts = isWindows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(isWindows ? ";" : ":");
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, `${command}${ext}`))) {
        return true;
      }
    }
  }
  return false;
}

function buildPlatformChecks(): PlatformCheck[] {
  const home = resolveHomeDir(process.env);
  const nodeOnPath = isExecutableOnPath("node");
  return [
    { name: "home directory resolves to a non-empty path", ok: home.length > 0, detail: home || "(empty)" },
    {
      name: "node resolvable on PATH (for MCP servers that spawn node)",
      ok: nodeOnPath,
      detail: nodeOnPath ? undefined : "node not found on PATH",
    },
  ];
}

export async function buildDoctorReport(repoRoot: string, agentsDir: string, homeDir: string): Promise<DoctorReport> {
  const toolPaths = resolveToolPaths(homeDir);
  const generatedDir = resolveStoreGeneratedDir(agentsDir);
  const [repoConfig, sections, machineStatus] = await Promise.all([
    loadConfig(repoRoot),
    buildDiagnosticsSections(repoRoot, agentsDir, homeDir),
    buildMachineStatusV2(repoRoot, agentsDir, homeDir),
  ]);
  const { config } = await loadEffectiveConfig(repoConfig, agentsDir);
  let machineRecord = null;
  try {
    machineRecord = loadWriteRecord(resolveGlobalWriteRecordPath(agentsDir), "machine");
  } catch (error) {
    if (!(error instanceof DrwnError) || error.code !== "WRITE_RECORD_INVALID") throw error;
  }
  let staleSkillSymlinks: string[] = [];
  if (machineStatus.projection.issues.length === 0) {
    const machineState = await buildEffectiveState({
      repoRoot,
      agentsDir,
      homeDir,
      dryRun: true,
      forceMachineScope: true,
      scope: "machine",
    });
    staleSkillSymlinks = diffWriteRecord(machineRecord, planMachineManagedPaths(machineState)).toRemove
      .filter((entry) => entry.kind === "managed-directory" && isMachineSkillPath(entry.path))
      .map((entry) => join(homeDir, entry.path))
      .filter((pathValue) => lstatSafe(pathValue) !== null);
  }
  const machineProjectionConflicts = machineStatus.projection.conflicts.map((conflict) => conflict.message);
  return {
    brokenSymlinks: await detectBrokenSymlinks([
      ...((existsSync(toolPaths.claudeSkills) ? Object.keys(readDirLinks(toolPaths.claudeSkills)) : []) as string[]).map((name) =>
        join(toolPaths.claudeSkills, name),
      ),
      ...((existsSync(toolPaths.codexSkills) ? Object.keys(readDirLinks(toolPaths.codexSkills)) : []) as string[]).map((name) =>
        join(toolPaths.codexSkills, name),
      ),
    ]),
    staleSkillSymlinks,
    mcpDrift: machineStatus.projection.conflicts
      .filter((conflict) => conflict.kind === "drift")
      .flatMap((conflict) => machineMcpDriftLabel(config, homeDir, conflict.path)),
    machineProjectionConflicts,
    machineCapabilityIssues: machineStatus.projection.issues,
    missingGeneratedFiles: await detectMissingGeneratedFiles(config, generatedDir),
    hookIssues: [],
    projectConfigIssues: [],
    surfaceNotes: buildSurfaceNotes(config),
    platformChecks: buildPlatformChecks(),
    ambientMcpCollisions: [],
    cards: sections.cards,
    store: sections.store,
    writeRecord: sections.writeRecord,
  };
}

function isMachineSkillPath(pathValue: string) {
  return pathValue.startsWith(".claude/skills/") || pathValue.startsWith(".codex/skills/");
}

function machineMcpDriftLabel(config: CanonicalConfig, homeDir: string, pathValue: string): string[] {
  return Object.entries(config.targets).flatMap(([target, targetConfig]) => {
    const configPath = expandHomePath(
      target === "claude" ? (targetConfig.userMcpPath ?? targetConfig.configPath) : targetConfig.configPath,
      homeDir,
    );
    return configPath === pathValue ? [`${target}:${pathValue}`] : [];
  });
}

export async function buildDoctorReportWithProject(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DoctorReport> {
  const report = await buildDoctorReport(repoRoot, agentsDir, homeDir);
  if (!projectConfigPath) {
    return report;
  }

  const [repoConfig, builtInRegistry, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const state = await buildEffectiveStateForDiagnostics({
    repoRoot,
    agentsDir,
    homeDir,
    cwd: resolveProjectRootFromConfigPath(projectConfigPath),
  });
  const projectRoot = state.projectRoot;
  const project = state.projectConfig;
  const projectWithCards = state.projectConfigWithCards;
  const cardLocks = state.activeCards;
  if (!project || !projectWithCards || !projectRoot) {
    return report;
  }
  const knownServerNames = new Set([
    ...Object.keys(builtInRegistry.servers),
    ...state.cardServerDefinitions.map((definition) => definition.serverName),
  ]);
  const availableSkillNames = new Set([
    ...skillInventory.map((skill) => skill.name),
    ...cardLocks.flatMap((card) => card.skills),
  ]);
  const issues: string[] = [];

  for (const [name, override] of Object.entries(project.mcpServers ?? {})) {
    if (isServerToggle(override)) {
      if (!knownServerNames.has(name)) {
        issues.push(`Unknown server reference: "${name}"`);
        continue;
      }
      const centrallyActive = false;
      if (centrallyActive === override.enabled) {
        issues.push(`Stale override: server "${name}" is already ${centrallyActive ? "enabled" : "disabled"} centrally`);
      }
    }
  }

  for (const name of [...(projectWithCards.skills?.include ?? []), ...(projectWithCards.skills?.exclude ?? [])]) {
    if (!availableSkillNames.has(name)) {
      issues.push(`Unknown skill reference: "${name}"`);
    }
  }

  for (const name of Object.keys(project.extensions ?? {})) {
    if (!getExtension(name)) {
      issues.push(`Unknown extension reference: "${name}"`);
    }
  }

  for (const [name, override] of Object.entries(project.targets ?? {})) {
    if (repoConfig.targets[name as keyof typeof repoConfig.targets]?.enabled === override.enabled) {
      issues.push(`Stale override: target "${name}" is already ${override.enabled ? "enabled" : "disabled"} centrally`);
    }
  }

  const generatedDir = join(projectRoot, ".agents", "drwn", "generated");
  const scopedReport = {
    ...report,
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, projectRoot, state.skillSelection, cardLocks),
    mcpDrift: await detectMcpDrift(
      state.effectiveConfig,
      state.activeServers,
      projectRoot,
    ),
    missingGeneratedFiles: await detectMissingGeneratedFiles(state.effectiveConfig, generatedDir),
    hookIssues: detectHookIssues(cardLocks, generatedDir),
    projectConfigIssues: [...report.projectConfigIssues, ...issues],
    ambientMcpCollisions: selectedAmbientCollisions(state),
  };
  try {
    const projection = await planRepositoryProjection({
      repoRoot,
      agentsDir,
      homeDir,
      cwd: projectRoot,
    });
    scopedReport.projectConfigIssues.push(...projection.issues);
  } catch (error) {
    if (
      !(error instanceof DrwnError) ||
      error.code !== "ORG_WORKER_MATERIALIZATION_DRIFT"
    ) {
      throw error;
    }
    scopedReport.projectConfigIssues.push(
      "ORG_WORKER_MATERIALIZATION_DRIFT",
    );
  }
  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir, projectConfigPath);
  return {
    ...scopedReport,
    cards: {
      ...sections.cards,
      warnings: [
        ...sections.cards.warnings,
        ...cardLocks.filter((card) => card.manifest.skills?.include?.some((skill) => !availableSkillNames.has(skill)))
          .map((card) => `Card ${card.name}@${card.version} references unavailable skills`),
      ],
    },
    store: sections.store,
    writeRecord: sections.writeRecord,
  };
}

function readDirLinks(dirPath: string) {
  const entries: Record<string, true> = {};
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      entries[entry.name] = true;
    }
  }
  return entries;
}
