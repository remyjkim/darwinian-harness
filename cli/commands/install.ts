// ABOUTME: Bootstraps supported project Worker graphs from project lock V1.
// ABOUTME: Fetches missing Git-backed Cards and optionally writes downstream agent state.

import { Option, UsageError } from "clipanion";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureCardPresentFromLock } from "../core/card-install";
import { serializeCardLock, validateCardLockfile } from "../core/card-lock";
import { pMap, resolveFetchConcurrency } from "../core/concurrency";
import { selectProjectWorker } from "../core/effective-state";
import { DrwnError } from "../core/errors";
import { writeAtomically } from "../core/fs";
import {
  parseOrgWorkerBundleV1,
  verifyFrozenOrgWorkerBundleInstall,
  type OrgWorkerBundleV1,
} from "../core/org-worker-bundle-v1";
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
    `,
    examples: [
      ["Bootstrap after cloning a project", "drwn install"],
      ["Fetch Cards without writing downstream files", "drwn install --no-write"],
      ["Fail if cloning, fetching, or lockfile updates would be required", "drwn install --frozen"],
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
      "Verify an immutable OrgWorkerBundleV1 against the frozen project lock.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    if (this.orgWorkerBundle && !this.frozen) {
      throw new UsageError(
        "OrgWorkerBundleV1 installation requires --frozen.",
      );
    }
    let bundle: OrgWorkerBundleV1 | null = null;
    if (this.orgWorkerBundle) {
      try {
        bundle = parseOrgWorkerBundleV1(
          JSON.parse(await readFile(this.orgWorkerBundle, "utf8")),
        );
      } catch (error) {
        throw new DrwnError(
          "ORG_WORKER_BUNDLE_INVALID",
          "OrgWorkerBundleV1 is malformed or cannot be read",
          undefined,
          error,
        );
      }
    }
    const initial = await readProjectStateSnapshot(projectRoot);
    if (!initial.lockBytes) {
      throw new UsageError("No card.lock found. Did you mean `drwn apply`?");
    }
    if (!initial.configBytes) throw new UsageError("No project config found. Run `drwn init` first.");

    let lock;
    let activeWorker: string | null = null;
    try {
      const config = validateProjectConfig(JSON.parse(initial.configBytes), `${projectRoot}/.agents/drwn/config.json`);
      lock = validateCardLockfile(JSON.parse(initial.lockBytes), `${projectRoot}/.agents/drwn/card.lock`);
      selectProjectWorker({ projectConfig: config, committedLock: lock, configLocal: null, localLock: null });
      activeWorker = config.activeWorker;
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

    if (bundle) {
      if (!activeWorker) {
        throw new DrwnError(
          "ORG_WORKER_BUNDLE_ACTIVE_WORKER_REQUIRED",
          "OrgWorkerBundleV1 installation requires a selected project Worker",
        );
      }
      const receipt = verifyFrozenOrgWorkerBundleInstall({
        bundle,
        activeWorker,
        resolvedCards: lock.cards.map((card) => ({
          card,
          contentRoot: card.path,
        })),
      });
      await writeAtomically(
        join(
          projectRoot,
          ".agents",
          "drwn",
          "receipts",
          "org-worker-bundle-install.json",
        ),
        `${JSON.stringify(receipt, null, 2)}\n`,
      );
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
