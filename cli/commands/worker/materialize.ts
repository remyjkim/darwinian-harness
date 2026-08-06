// ABOUTME: Implements drwn worker materialize: turns a V1 deploy payload into a runnable
// ABOUTME: V2 project — validate, seed the store, stage config/lock, install frozen, write.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { DrwnError } from "../../core/errors";
import { materializeWorkerPayload, validateMaterializePayload } from "../../core/worker-materialize";

export class WorkerMaterializeCommand extends BaseCommand {
  static override paths = [["worker", "materialize"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Materialize a V1 deploy payload into a runnable V2 project.",
    details: `
      Validates the payload (contract version, materialization mode, store-export
      digest), seeds the card store, stages the derived project config and lock,
      installs cards frozen from the lock, and projects with the write pipeline.

      Store bytes come from the payload's inline base64 unless --store-export
      supplies an external archive; the payload's declared sha256/byteLength are
      verified against whichever source is used. Optional snapshot emission
      produces the minimal project tar (config + lock only) and a store re-archive.
    `,
    examples: [
      [
        "Materialize a deploy payload into a project",
        "drwn worker materialize --payload payload.json --project-root /srv/mind",
      ],
      [
        "External store bytes with snapshot emission",
        "drwn worker materialize --payload payload.json --project-root /srv/mind --store-export store.tar --emit-project-tar project.tar --json",
      ],
    ],
  });

  payload = Option.String("--payload", {
    required: true,
    description: "Path to the deploy payload JSON.",
  });

  projectRoot = Option.String("--project-root", {
    required: true,
    description: "The project to stage and materialize (created if absent).",
  });

  agentsDir = Option.String("--agents-dir", {
    description: "Store root to seed into; defaults to the resolved AGENTS_DIR.",
  });

  storeExport = Option.String("--store-export", {
    description: "External store archive; takes precedence over the payload's inline base64.",
  });

  emitStoreTar = Option.String("--emit-store-tar", {
    description: "Re-archive the seeded store to this path.",
  });

  emitProjectTar = Option.String("--emit-project-tar", {
    description: "Emit the minimal project snapshot (config + lock only) to this path.",
  });

  json = Option.Boolean("--json", false, {
    description: "Report the machine-readable result on stdout.",
  });

  async execute(): Promise<number> {
    try {
      const raw = JSON.parse(readFileSync(this.payload, "utf8"));
      const storeExportBytes = this.storeExport ? readFileSync(this.storeExport) : undefined;
      const payload = validateMaterializePayload(raw, { storeExportBytes });
      const projectRoot = resolve(this.projectRoot);
      const result = await materializeWorkerPayload({
        payload,
        projectRoot,
        agentsDir: this.agentsDir ? resolve(this.agentsDir) : this.context.agentsDir,
        homeDir: this.context.homeDir,
        repoRoot: this.context.repoRoot,
        storeExportBytes,
        emitProjectTar: this.emitProjectTar ? resolve(this.emitProjectTar) : undefined,
        emitStoreTar: this.emitStoreTar ? resolve(this.emitStoreTar) : undefined,
      });
      for (const warning of result.warnings) {
        this.context.stderr.write(`Warning: ${warning}\n`);
      }
      if (this.json) {
        this.context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        this.context.stdout.write(`Materialized ${result.cards} card(s) into ${projectRoot}\n`);
      }
      return 0;
    } catch (error) {
      const message = error instanceof DrwnError ? `${error.code}: ${error.message}` : (error as Error).message;
      this.context.stderr.write(`${message}\n`);
      return 1;
    }
  }
}
