// ABOUTME: Builds the CLI-to-deploy-api worker deploy payload.
// ABOUTME: Sends portable lockfile/config/content bytes so server materialization can run frozen.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { relative, join } from "node:path";
import { tmpdir } from "node:os";
import { create as createArchive } from "./archive";
import {
  loadCardLock,
  type CardLockEntry,
  type GitLockInfo,
  type WorkerRootLockEntry,
} from "./card-lock";
import { minimumDrwnVersionForManifests } from "./mind-capability";
import { parseCardRef, type ResolveCardOptions } from "./card-store";
import { DrwnError } from "./errors";
import { readProjectConfigForWrite } from "./project-writes";
import { resolveCardBareRepoPath, resolveExtractedPath } from "./store-paths";
import { resolveWorkerGraph } from "./worker-graph";

export const WORKER_DEPLOY_CONTRACT_VERSION = 1;
export const DEFAULT_STORE_EXPORT_LIMIT_BYTES = 25 * 1024 * 1024;

export type WorkerDeployMaterialization = "lockfile-store-export";

export interface WorkerDeployStoreExport {
  kind: "drwn-store-export-tar";
  compression: "none";
  encoding: "base64";
  sha256: string;
  byteLength: number;
  bytesBase64: string;
}

export interface WorkerDeployGovernance {
  composedFrom: string[];
  tools?: unknown;
  permissions?: unknown;
  evals?: unknown;
  escalation?: unknown;
  contextMounts?: unknown;
  identity?: unknown;
}

export interface WorkerDeployRemoteConfig {
  version: 1;
  cards: string[];
}

export interface WorkerDeployPayload {
  contractVersion: typeof WORKER_DEPLOY_CONTRACT_VERSION;
  materialization: WorkerDeployMaterialization;
  entrypoint: {
    requested: string;
    name: string;
    kind: "card" | "blueprint";
  };
  lockfile: {
    lockfileVersion: 5;
    store: { minDrwnVersion: string };
    cards: CardLockEntry[];
  };
  config: WorkerDeployRemoteConfig;
  governance: WorkerDeployGovernance | null;
  storeExport: WorkerDeployStoreExport;
}

export interface BuildWorkerDeployPayloadOptions {
  agentsDir: string;
  cardRef: string;
  projectRoot?: string | null;
  resolveOptions?: ResolveCardOptions;
  maxStoreExportBytes?: number;
}

function posixRelative(from: string, to: string) {
  return relative(from, to).replace(/\\/g, "/");
}

function portableGit(git: GitLockInfo | undefined): GitLockInfo | undefined {
  if (!git) {
    return undefined;
  }
  return {
    ...(git.url ? { url: git.url } : {}),
    ...(git.ref ? { ref: git.ref } : {}),
    commit: git.commit,
  };
}

function portableCardEntry(card: CardLockEntry): CardLockEntry {
  if (card.origin === "file" || card.origin === "npm") {
    throw new DrwnError(
      "WORKER_DEPLOY_UNSUPPORTED_CARD_ORIGIN",
      `worker deploy requires store/git cards; ${card.name} has origin ${card.origin}`,
    );
  }
  if (!card.treeSha) {
    throw new DrwnError("WORKER_DEPLOY_MISSING_TREE_SHA", `worker deploy requires treeSha for ${card.name}`);
  }
  if (!card.git?.commit) {
    throw new DrwnError("WORKER_DEPLOY_MISSING_COMMIT", `worker deploy requires git.commit for ${card.name}`);
  }

  return {
    name: card.name,
    requested: card.requested,
    version: card.version,
    path: `drwn/extracted/${card.treeSha}`,
    integrity: card.integrity,
    treeSha: card.treeSha,
    manifest: card.manifest,
    skills: [...card.skills],
    hooks: [...card.hooks],
    ...(card.hookConsent ? { hookConsent: card.hookConsent } : {}),
    ...(card.instructionConsent ? { instructionConsent: card.instructionConsent } : {}),
    registry: null,
    origin: card.origin,
    git: portableGit(card.git),
  };
}

function governanceFromEntry(card: CardLockEntry): WorkerDeployGovernance | null {
  if (card.manifest.kind !== "blueprint") {
    return null;
  }
  const manifest = card.manifest;
  return {
    composedFrom: manifest.composedFrom ?? [],
    ...(manifest.tools ? { tools: manifest.tools } : {}),
    ...(manifest.permissions ? { permissions: manifest.permissions } : {}),
    ...(manifest.evals ? { evals: manifest.evals } : {}),
    ...(manifest.escalation ? { escalation: manifest.escalation } : {}),
    ...(manifest.contextMounts ? { contextMounts: manifest.contextMounts } : {}),
    ...(manifest.identity ? { identity: manifest.identity } : {}),
  };
}

function deployRemoteConfig(cardRef: string): WorkerDeployRemoteConfig {
  return { version: 1, cards: [cardRef] };
}

interface DeployClosure {
  cards: CardLockEntry[];
  requested: string;
  minDrwnVersion: string;
}

function orderedClosure(root: WorkerRootLockEntry, cards: CardLockEntry[]): CardLockEntry[] {
  const byName = new Map(cards.map((card) => [card.name, card]));
  return [root.name, ...root.members].map((name) => {
    const card = byName.get(name);
    if (!card) {
      throw new DrwnError(
        "WORKER_DEPLOY_CLOSURE_INCOMPLETE",
        `Worker deploy closure for ${root.name} is missing locked Card ${name}`,
      );
    }
    return card;
  });
}

async function resolveDeployClosure(options: BuildWorkerDeployPayloadOptions): Promise<DeployClosure> {
  if (!options.projectRoot) {
    const graph = await resolveWorkerGraph(options.agentsDir, [options.cardRef], options.resolveOptions);
    const root = graph.roots[0];
    if (!root) {
      throw new DrwnError("WORKER_DEPLOY_CARD_NOT_FOUND", `could not resolve deploy card ${options.cardRef}`);
    }
    return {
      cards: orderedClosure(root, graph.cards),
      requested: options.cardRef,
      minDrwnVersion: minimumDrwnVersionForManifests(graph.cards.map((card) => card.manifest)),
    };
  }

  const config = await readProjectConfigForWrite(options.projectRoot);
  const lock = await loadCardLock(options.projectRoot);
  if (!lock) {
    throw new DrwnError("WORKER_DEPLOY_PROJECT_LOCK_REQUIRED", "Worker deploy requires a valid project card.lock");
  }
  if (config.activeWorker === null) {
    throw new DrwnError("WORKER_DEPLOY_ACTIVE_ROOT_REQUIRED", "Worker deploy requires one selected project Worker");
  }

  const requestedName = parseCardRef(options.cardRef).name;
  const memberOf = lock.workerRoots.find((root) => root.members.includes(requestedName));
  if (memberOf) {
    throw new DrwnError(
      "WORKER_DEPLOY_MEMBER_NOT_ROOT",
      `${requestedName} is a member of Worker ${memberOf.name}; deploy the selected Worker root instead`,
    );
  }
  const requestedRoot = lock.workerRoots.find((root) => root.name === requestedName);
  if (!requestedRoot) {
    throw new DrwnError(
      "WORKER_DEPLOY_ROOT_NOT_INSTALLED",
      `${requestedName} is not an installed Worker root in this project`,
    );
  }
  if (requestedRoot.name !== config.activeWorker) {
    throw new DrwnError(
      "WORKER_DEPLOY_ROOT_NOT_ACTIVE",
      `${requestedRoot.name} is not the selected Worker; select it with drwn use before deploying`,
    );
  }

  const selectedRoot = lock.workerRoots.find((root) => root.name === config.activeWorker);
  if (!selectedRoot) {
    throw new DrwnError(
      "WORKER_DEPLOY_ACTIVE_ROOT_NOT_LOCKED",
      `Selected Worker ${config.activeWorker} is missing from the project lock`,
    );
  }
  return {
    cards: orderedClosure(selectedRoot, lock.cards),
    requested: selectedRoot.requested,
    minDrwnVersion: lock.store.minDrwnVersion,
  };
}

function storeExportEntries(agentsDir: string, cards: CardLockEntry[]): string[] {
  const entries = new Set<string>(["drwn/store.json"]);
  for (const card of cards) {
    if (!card.treeSha) {
      throw new DrwnError("WORKER_DEPLOY_MISSING_TREE_SHA", `worker deploy requires treeSha for ${card.name}`);
    }
    const bareRepo = resolveCardBareRepoPath(agentsDir, card.name);
    if (!existsSync(bareRepo)) {
      throw new DrwnError("WORKER_DEPLOY_MISSING_BARE_REPO", `worker deploy requires local bare repo for ${card.name}`);
    }
    const extracted = resolveExtractedPath(agentsDir, card.treeSha);
    if (!existsSync(extracted)) {
      throw new DrwnError("WORKER_DEPLOY_MISSING_EXTRACTED_TREE", `worker deploy requires extracted tree for ${card.name}`);
    }
    entries.add(posixRelative(agentsDir, bareRepo));
    entries.add(posixRelative(agentsDir, extracted));
  }
  return [...entries].sort();
}

export async function createStoreExportForLock(
  agentsDir: string,
  cards: CardLockEntry[],
  outPath: string,
): Promise<string> {
  await createArchive(outPath, {
    cwd: agentsDir,
    entries: storeExportEntries(agentsDir, cards),
    gzip: false,
  });
  return outPath;
}

async function buildStoreExport(agentsDir: string, cards: CardLockEntry[], maxBytes: number): Promise<WorkerDeployStoreExport> {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-worker-deploy-"));
  const tarPath = join(tempDir, "store.tar");
  try {
    await createStoreExportForLock(agentsDir, cards, tarPath);
    const bytes = await readFile(tarPath);
    if (bytes.byteLength > maxBytes) {
      throw new DrwnError(
        "WORKER_DEPLOY_STORE_EXPORT_TOO_LARGE",
        `worker deploy store export is ${bytes.byteLength} bytes; limit is ${maxBytes} bytes`,
      );
    }
    return {
      kind: "drwn-store-export-tar",
      compression: "none",
      encoding: "base64",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString("base64"),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function buildWorkerDeployPayload(options: BuildWorkerDeployPayloadOptions): Promise<WorkerDeployPayload> {
  const closure = await resolveDeployClosure(options);
  const top = closure.cards[0]!;

  const portableCards = closure.cards.map(portableCardEntry);
  return {
    contractVersion: WORKER_DEPLOY_CONTRACT_VERSION,
    materialization: "lockfile-store-export",
    entrypoint: {
      requested: closure.requested,
      name: top.name,
      kind: top.manifest.kind === "blueprint" ? "blueprint" : "card",
    },
    lockfile: {
      lockfileVersion: 5,
      store: { minDrwnVersion: closure.minDrwnVersion },
      cards: portableCards,
    },
    config: deployRemoteConfig(closure.requested),
    governance: governanceFromEntry(top),
    storeExport: await buildStoreExport(
      options.agentsDir,
      closure.cards,
      options.maxStoreExportBytes ?? DEFAULT_STORE_EXPORT_LIMIT_BYTES,
    ),
  };
}
