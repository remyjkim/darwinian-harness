// ABOUTME: Bootstraps supported project Worker graphs from project lock V1.
// ABOUTME: Fetches missing Git-backed Cards and optionally writes downstream agent state.

import { randomUUID } from "node:crypto";
import { Option, UsageError } from "clipanion";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ensureCardPresentFromLock } from "../core/card-install";
import { serializeCardLock, validateCardLockfile } from "../core/card-lock";
import { pMap, resolveFetchConcurrency } from "../core/concurrency";
import { selectProjectWorker } from "../core/effective-state";
import { DrwnError } from "../core/errors";
import {
  parseOrgWorkerBundleV1,
} from "../core/org-worker-bundle-v1";
import {
  parseWorkerArtifactSnapshotV1,
} from "../core/org-worker-artifact-snapshot";
import {
  materializeOrgWorkerProject,
  reconcileOrgWorkerProject,
  removeOrgWorkerProject,
} from "../core/org-worker-materializer";
import { renderJson, renderSyncResult } from "../core/output";
import { validateProjectConfig } from "../core/project";
import { mutateProjectState, readProjectStateSnapshot } from "../core/project-state-transaction";
import { syncRepository } from "../core/sync";
import { BaseCommand } from "./base";
import { requireProjectRoot } from "./card/project-command";

export class InstallCommand extends BaseCommand {
  static override paths = [["install"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Fetch missing cards from card.lock and write project state.",
    details: `
      Reads the supported .agents/drwn/card.lock, ensures every locked Card is present in the
      local Git-backed store, updates extracted paths when needed, then writes
      the effective project state unless --no-write is passed.

      A complete immutable Org Worker handoff instead requires --frozen,
      --org-worker-bundle, --worker-artifact-snapshot, and --operation-id.
      Use --dry-run/--no-write to validate without success evidence,
      --reconcile for ownership-bounded repair, or --remove for owned cleanup.
    `,
    examples: [
      ["Bootstrap after cloning a project", "drwn install"],
      ["Fetch Cards without writing downstream files", "drwn install --no-write"],
      ["Fail if cloning, fetching, or lockfile updates would be required", "drwn install --frozen"],
      [
        "Materialize an immutable Org Worker handoff",
        "drwn install --frozen --org-worker-bundle ./packet/bundle.json --worker-artifact-snapshot ./packet/snapshot.json --operation-id operation:provision:0001",
      ],
      [
        "Repair only prior materialization-owned drift",
        "drwn install --reconcile --frozen --org-worker-bundle ./packet/bundle.json --worker-artifact-snapshot ./packet/snapshot.json --operation-id operation:reconcile:0001",
      ],
    ],
  });

  frozen = Option.Boolean("--frozen", false, {
    description: "Fail instead of cloning, fetching, or changing card.lock.",
  });

  noWrite = Option.Boolean("--no-write", false, {
    description: "Fetch and verify cards without writing downstream files.",
  });

  orgWorkerBundle = Option.String("--org-worker-bundle", {
    description:
      "Apply an immutable OrgWorkerBundleV1 from a complete frozen handoff.",
  });

  workerArtifactSnapshot = Option.String("--worker-artifact-snapshot", {
    description:
      "Verify directory-backed Worker artifacts from the snapshot file's parent.",
  });

  operationId = Option.String("--operation-id", {
    description:
      "Use an explicit idempotency identity for Org Worker materialization.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description:
      "Verify and plan Org Worker materialization without writing any state.",
  });

  reconcile = Option.Boolean("--reconcile", false, {
    description:
      "Repair only record-owned Org Worker state, then verify every postcondition.",
  });

  remove = Option.Boolean("--remove", false, {
    description:
      "Remove only Org Worker state proven owned by the prior materialization record.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const orgHandoffRequested = Boolean(
      this.orgWorkerBundle ||
        this.workerArtifactSnapshot ||
        this.operationId ||
        this.reconcile ||
        this.remove,
    );
    if (orgHandoffRequested) {
      if (this.reconcile && this.remove) {
        throw new UsageError(
          "--reconcile and --remove are mutually exclusive.",
        );
      }
      if (
        !this.orgWorkerBundle ||
        !this.workerArtifactSnapshot ||
        !this.operationId
      ) {
        throw new UsageError(
          "Org Worker materialization requires --org-worker-bundle, --worker-artifact-snapshot, and --operation-id together.",
        );
      }
      if (!this.frozen) {
        throw new UsageError(
          "Org Worker materialization requires --frozen.",
        );
      }
      const bundlePath = resolve(this.context.cwd, this.orgWorkerBundle);
      const snapshotPath = resolve(
        this.context.cwd,
        this.workerArtifactSnapshot,
      );
      let bundle;
      let snapshot;
      try {
        bundle = parseOrgWorkerBundleV1(
          JSON.parse(await readFile(bundlePath, "utf8")),
        );
      } catch (error) {
        if (error instanceof DrwnError) {
          this.context.stderr.write(
            `${error.code}: ${error.message}\n`,
          );
          return 1;
        }
        throw new DrwnError(
          "ORG_WORKER_BUNDLE_INVALID",
          "OrgWorkerBundleV1 is malformed or cannot be read",
          undefined,
          error,
        );
      }
      try {
        snapshot = parseWorkerArtifactSnapshotV1(
          JSON.parse(await readFile(snapshotPath, "utf8")),
        );
      } catch (error) {
        if (error instanceof DrwnError) {
          this.context.stderr.write(
            `${error.code}: ${error.message}\n`,
          );
          return 1;
        }
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_SNAPSHOT_INVALID",
          "Worker artifact snapshot is malformed or cannot be read",
          undefined,
          error,
        );
      }
      let result;
      try {
        const apply = this.remove
          ? removeOrgWorkerProject
          : this.reconcile
            ? reconcileOrgWorkerProject
            : materializeOrgWorkerProject;
        result = await apply({
          projectRoot: this.context.cwd,
          bundle,
          snapshot,
          packetRoot: dirname(snapshotPath),
          operationId: this.operationId,
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          homeDir: this.context.homeDir,
          dryRun: this.dryRun,
          noWrite: this.noWrite,
          clock: () => new Date().toISOString(),
          receiptIdFactory: () =>
            `worker-materialization-${randomUUID()}`,
        });
      } catch (error) {
        if (!(error instanceof DrwnError)) throw error;
        this.context.stderr.write(`${error.code}: ${error.message}\n`);
        return 1;
      }
      const payload = {
        ok: true,
        cards: result.plan.lock.cards.length,
        applied: result.applied,
        replayed: result.replayed,
        action:
          result.receipt?.action ??
          (this.remove
            ? "remove"
            : this.reconcile
              ? "reconcile"
              : "materialize"),
        ...(result.receipt
          ? { outcome: result.receipt.outcome }
          : {}),
        ...(result.receipt
          ? { receiptId: result.receipt.receiptId }
          : {}),
      };
      const completedVerb =
        payload.action === "remove"
          ? "Removed"
          : payload.action === "reconcile"
            ? "Reconciled"
            : "Materialized";
      this.context.stdout.write(
        this.json
          ? renderJson(payload)
          : result.applied
            ? `${completedVerb} ${payload.cards} verified Card(s).\n`
            : `Verified ${payload.action} plan for ${payload.cards} Card(s); no changes applied.\n`,
      );
      return 0;
    }
    if (this.dryRun) {
      throw new UsageError(
        "--dry-run is supported only for Org Worker materialization.",
      );
    }
    const projectRoot = requireProjectRoot(this);
    const initial = await readProjectStateSnapshot(projectRoot);
    if (!initial.lockBytes) {
      throw new UsageError("No card.lock found. Did you mean `drwn apply`?");
    }
    if (!initial.configBytes) throw new UsageError("No project config found. Run `drwn init` first.");

    let lock;
    try {
      const config = validateProjectConfig(JSON.parse(initial.configBytes), `${projectRoot}/.agents/drwn/config.json`);
      lock = validateCardLockfile(JSON.parse(initial.lockBytes), `${projectRoot}/.agents/drwn/card.lock`);
      selectProjectWorker({ projectConfig: config, committedLock: lock, configLocal: null, localLock: null });
    } catch (error) {
      const normalized = error instanceof DrwnError
        ? error
        : new DrwnError("PROJECT_STATE_INVALID", "Project config or lock is malformed JSON", undefined, error);
      this.context.stderr.write(`${normalized.code}: ${normalized.message}\n`);
      return 1;
    }

    const errors: Array<{ card: string; message: string }> = [];
    let changed = false;
    const concurrency = resolveFetchConcurrency();
    // pMap accumulates errors inside the worker; we use an in-closure errors list
    // so the install summary reports every failed card, not just the first one.
    await pMap(lock.cards, concurrency, async (entry) => {
      try {
        const result = await ensureCardPresentFromLock(this.context.agentsDir, entry, this.frozen, { projectRoot });
        if (result.changed) changed = true;
      } catch (error) {
        errors.push({ card: entry.name, message: error instanceof Error ? error.message : String(error) });
      }
    });

    if (errors.length > 0) {
      if (this.json) {
        this.context.stdout.write(renderJson({ ok: false, errors }));
      } else {
        this.context.stderr.write(errors.map((error) => `${error.card}: ${error.message}`).join("\n") + "\n");
      }
      return 1;
    }

    if (changed) {
      const nextLockBytes = serializeCardLock(lock);
      await mutateProjectState(projectRoot, async (current) => {
        if (current.configBytes !== initial.configBytes || current.lockBytes !== initial.lockBytes) {
          throw new DrwnError(
            "PROJECT_STATE_CHANGED",
            "Project config or lock changed while install was hydrating Cards; retry install",
          );
        }
        return {
          bytes: { configBytes: initial.configBytes!, lockBytes: nextLockBytes },
          value: undefined,
        };
      });
    }

    if (this.noWrite) {
      const payload = { ok: true, cards: lock.cards.length, applied: false, lockfileChanged: changed };
      this.context.stdout.write(this.json ? renderJson(payload) : `Installed ${lock.cards.length} card(s).\n`);
      return 0;
    }

    const syncResult = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
    });
    if (this.json) {
      this.context.stdout.write(renderJson({ ok: true, cards: lock.cards.length, applied: true, lockfileChanged: changed, sync: syncResult }));
    } else {
      this.context.stdout.write(renderSyncResult(syncResult));
    }
    return 0;
  }
}
