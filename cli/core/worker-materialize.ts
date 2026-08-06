// ABOUTME: Owns the V1-deploy-payload → V2-project translation for drwn worker materialize:
// ABOUTME: pure config/lock derivations now; validation, store seeding, and orchestration follow.

import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CardLockEntry, ProjectLockV1 } from "./card-lock";
import { DrwnError } from "./errors";
import type { ProjectConfig } from "./types";
import { WORKER_DEPLOY_CONTRACT_VERSION, type WorkerDeployPayload } from "./worker-deploy";

function invalidPayload(detail: string): never {
  throw new DrwnError("WORKER_MATERIALIZE_PAYLOAD_INVALID", `Invalid materialize payload: ${detail}`);
}

/**
 * Gate the payload before any filesystem effect: exact contract version, the one supported
 * materialization mode, and the store-export digest. Forward payload versions must fail
 * loudly here — silent tolerance is how the V1↔V2 bridge broke in production.
 */
export function validateMaterializePayload(raw: unknown): WorkerDeployPayload {
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
  const bytes = Buffer.from(storeExport.bytesBase64, "base64");
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
