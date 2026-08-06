// ABOUTME: Owns the V1-deploy-payload → V2-project translation for drwn worker materialize:
// ABOUTME: pure config/lock derivations now; validation, store seeding, and orchestration follow.

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as createArchive, extract } from "./archive";
import { ensureCardPresentFromLock } from "./card-install";
import { serializeCardLock, type CardLockEntry, type ProjectLockV1 } from "./card-lock";
import { DrwnError } from "./errors";
import { syncRepository } from "./sync";
import type { ProjectConfig } from "./types";
import {
  createStoreExportForLock,
  WORKER_DEPLOY_CONTRACT_VERSION,
  type WorkerDeployPayload,
} from "./worker-deploy";

function invalidPayload(detail: string): never {
  throw new DrwnError("WORKER_MATERIALIZE_PAYLOAD_INVALID", `Invalid materialize payload: ${detail}`);
}

/**
 * Gate the payload before any filesystem effect: exact contract version, the one supported
 * materialization mode, and the store-export digest. Forward payload versions must fail
 * loudly here — silent tolerance is how the V1↔V2 bridge broke in production.
 *
 * When external store bytes are supplied (the `--store-export` lane; the payload may then
 * carry an empty inline base64), the digest check runs against those bytes — the payload's
 * declared sha256/byteLength stay the single source of truth for both lanes.
 */
export function validateMaterializePayload(
  raw: unknown,
  options: { storeExportBytes?: Buffer } = {},
): WorkerDeployPayload {
  if (typeof raw !== "object" || raw === null) invalidPayload("expected an object");
  const payload = raw as Partial<WorkerDeployPayload>;
  if (payload.contractVersion !== WORKER_DEPLOY_CONTRACT_VERSION) {
    invalidPayload(`contractVersion ${String(payload.contractVersion)} is not supported (expected ${WORKER_DEPLOY_CONTRACT_VERSION})`);
  }
  if (payload.materialization !== "lockfile-store-export") {
    invalidPayload(`materialization ${String(payload.materialization)} is not supported`);
  }
  if (!payload.entrypoint?.name || !payload.entrypoint.requested) invalidPayload("entrypoint is incomplete");
  if (!payload.lockfile || !Array.isArray(payload.lockfile.cards)) invalidPayload("lockfile is incomplete");
  const storeExport = payload.storeExport;
  if (!storeExport || typeof storeExport.bytesBase64 !== "string") invalidPayload("storeExport is incomplete");
  const bytes = options.storeExportBytes ?? Buffer.from(storeExport.bytesBase64, "base64");
  if (bytes.byteLength !== storeExport.byteLength) {
    invalidPayload(`storeExport byteLength ${storeExport.byteLength} does not match the supplied bytes (${bytes.byteLength})`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== storeExport.sha256) {
    invalidPayload("storeExport sha256 does not match the supplied bytes");
  }
  return payload as WorkerDeployPayload;
}

/**
 * T1: the V2 project config comes entirely from the payload entrypoint. The legacy
 * `payload.config` field ({version, cards}) is ignored by design — it is redundant with
 * the entrypoint plus the lockfile, and its shape predates the V2 project contract.
 */
export function deriveMaterializeConfig(payload: WorkerDeployPayload): ProjectConfig {
  return {
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [payload.entrypoint.requested],
    activeWorker: payload.entrypoint.name,
  };
}

/**
 * T2: wrap the payload lockfile into a valid `drwn.project-lock`. Closure order is part of
 * the payload contract: cards[0] is the entrypoint root, cards[1..] are members in
 * composition order. Card paths arrive store-relative and are rewritten under the target
 * agents dir — locks with paths absolute to a different machine are the portability class
 * this command exists to end.
 */
export function deriveMaterializeLock(payload: WorkerDeployPayload, agentsDir: string): ProjectLockV1 {
  const cards: CardLockEntry[] = payload.lockfile.cards.map((card) => ({
    ...card,
    path: join(agentsDir, card.path),
  }));
  return {
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: payload.lockfile.store,
    workerRoots: [
      {
        name: payload.entrypoint.name,
        requested: payload.entrypoint.requested,
        kind: payload.entrypoint.kind,
        members: payload.lockfile.cards.slice(1).map((card) => card.name),
      },
    ],
    cards,
  };
}

export interface MaterializeWorkerOptions {
  payload: WorkerDeployPayload;
  projectRoot: string;
  agentsDir: string;
  homeDir: string;
  /** The packaged drwn checkout (registry/config.json lives here), as resolved by the CLI context. */
  repoRoot: string;
  /** External store bytes (e.g. an R2-staged archive); defaults to the payload's inline base64. */
  storeExportBytes?: Buffer;
  /** Emit the minimal project snapshot (config + lock only — generated output is disposable). */
  emitProjectTar?: string;
  /** Re-archive the seeded store for the caller's boot contract. */
  emitStoreTar?: string;
}

export interface EmittedArtifact {
  path: string;
  sha256: string;
  byteLength: number;
}

export interface MaterializeWorkerResult {
  cards: number;
  changes: string[];
  warnings: string[];
  emitted: {
    projectTar?: EmittedArtifact;
    storeTar?: EmittedArtifact;
  };
}

async function emittedArtifact(path: string): Promise<EmittedArtifact> {
  const bytes = await readFile(path);
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
  };
}

/**
 * The full V1-payload → V2-project materialization: seed the store, stage the derived
 * config and lock, hydrate cards frozen from the lock, and project with the same sync
 * pipeline drwn install composes. Single-shot on clean roots by contract.
 */
export async function materializeWorkerPayload(options: MaterializeWorkerOptions): Promise<MaterializeWorkerResult> {
  const { payload, projectRoot, agentsDir, homeDir, repoRoot } = options;
  const storeBytes = options.storeExportBytes ?? Buffer.from(payload.storeExport.bytesBase64, "base64");

  await mkdir(agentsDir, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-materialize-"));
  try {
    const tarPath = join(tempDir, "store-seed.tar");
    await writeFile(tarPath, storeBytes);
    await extract(tarPath, agentsDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  const drwnDir = join(projectRoot, ".agents", "drwn");
  await mkdir(drwnDir, { recursive: true });
  await writeFile(join(drwnDir, "config.json"), `${JSON.stringify(deriveMaterializeConfig(payload), null, 2)}\n`);
  const lock = deriveMaterializeLock(payload, agentsDir);
  await writeFile(join(drwnDir, "card.lock"), serializeCardLock(lock));

  for (const entry of lock.cards) {
    await ensureCardPresentFromLock(agentsDir, entry, true, { projectRoot });
  }

  const sync = await syncRepository({ repoRoot, agentsDir, homeDir, cwd: projectRoot });

  const emitted: MaterializeWorkerResult["emitted"] = {};
  if (options.emitProjectTar) {
    await createArchive(options.emitProjectTar, {
      cwd: join(projectRoot, ".agents"),
      entries: ["drwn/config.json", "drwn/card.lock"],
      gzip: false,
    });
    emitted.projectTar = await emittedArtifact(options.emitProjectTar);
  }
  if (options.emitStoreTar) {
    await createStoreExportForLock(agentsDir, lock.cards, options.emitStoreTar);
    emitted.storeTar = await emittedArtifact(options.emitStoreTar);
  }

  return {
    cards: lock.cards.length,
    changes: sync.changes,
    warnings: sync.warnings,
    emitted,
  };
}
