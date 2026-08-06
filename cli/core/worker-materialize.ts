// ABOUTME: Owns the V1-deploy-payload → V2-project translation for drwn worker materialize:
// ABOUTME: pure config/lock derivations now; validation, store seeding, and orchestration follow.

import { join } from "node:path";
import type { CardLockEntry, ProjectLockV1 } from "./card-lock";
import type { ProjectConfig } from "./types";
import type { WorkerDeployPayload } from "./worker-deploy";

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
