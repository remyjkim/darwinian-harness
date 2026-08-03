// ABOUTME: Implements `drwn card source sync` for upstream skill provenance sync.
// ABOUTME: Supports check-only mode and JSON output for automation.

import { Option } from "clipanion";
import { syncCardSource } from "../../../core/card-source-sync";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceSyncCommand extends BaseCommand {
  static override paths = [["card", "source", "sync"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Sync bundled skills from upstream git provenance refs.",
    details: `
      For each skills.upstream entry in the card source manifest, resolves the
      git ref, compares the upstream subpath to the local skills/<name>/ copy,
      and copies upstream content when not using --check.
    `,
    examples: [
      ["Check upstream sync status", "drwn card source sync @me/operator --check"],
      ["Sync upstream skills", "drwn card source sync @me/operator"],
    ],
  });

  name = Option.String({ required: true });

  check = Option.Boolean("--check", false, {
    description: "Compare without copying upstream content.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const source = await resolveCommandCardSource(this.context, { input: this.name });
    const result = await syncCardSource(this.context.agentsDir, source.sourceDir, { check: this.check });
    this.context.stdout.write(this.json ? renderJson(result) : renderSyncResult(result));
    return 0;
  }
}

function renderSyncResult(result: Awaited<ReturnType<typeof syncCardSource>>) {
  const lines = [
    `Synced: ${result.synced.join(", ") || "none"}`,
    `Stale: ${result.stale.join(", ") || "none"}`,
    `Moved: ${result.moved.join(", ") || "none"}`,
  ];
  return `${lines.join("\n")}\n`;
}
