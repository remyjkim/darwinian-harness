// ABOUTME: Implements drwn card link for machine-local dev source overrides.
// ABOUTME: Writes overrides only into config.local.json, never committed config.

import { Option, UsageError } from "clipanion";
import { emptyConfigLocal, loadConfigLocal, writeConfigLocal, ensureCardLockLocalEntryFromSource } from "../../core/config-local";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardLinkCommand extends BaseCommand {
  static override paths = [["card", "link"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Link a card to a local source directory for dev iteration.",
    details: `
      Writes file: overrides into config.local.json only. Committed config.json
      and card.lock remain unchanged.
    `,
    examples: [
      ["Link one card", "drwn card link @me/operator file:/path/to/source"],
      ["Bulk link from sources root", "drwn card link --all-from /path/to/sources"],
    ],
  });

  card = Option.String({ required: false });
  source = Option.String({ required: false });
  allFrom = Option.String("--all-from", { description: "Bulk link every card source under a directory." });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const local = (await loadConfigLocal(projectRoot)) ?? emptyConfigLocal();
    local.sourceOverrides ??= {};

    if (this.allFrom) {
      const { readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      for (const scope of await readdir(this.allFrom, { withFileTypes: true })) {
        if (!scope.isDirectory() || !scope.name.startsWith("@")) continue;
        for (const card of await readdir(join(this.allFrom, scope.name), { withFileTypes: true })) {
          if (!card.isDirectory()) continue;
          const name = `${scope.name}/${card.name}`;
          const sourcePath = join(this.allFrom, scope.name, card.name);
          local.sourceOverrides[name] = `file:${sourcePath}`;
          await ensureCardLockLocalEntryFromSource(projectRoot, this.context.agentsDir, name, sourcePath);
        }
      }
    } else {
      if (!this.card || !this.source) {
        throw new UsageError("Provide <card> <file:dir> or --all-from <dir>.");
      }
      if (!this.source.startsWith("file:")) {
        throw new UsageError("Source must be a file: path.");
      }
      local.sourceOverrides[this.card] = this.source;
      const resolved = this.source.replace(/^file:/, "");
      await ensureCardLockLocalEntryFromSource(projectRoot, this.context.agentsDir, this.card, resolved);
    }

    await writeConfigLocal(projectRoot, local);
    this.context.stdout.write(`Linked override(s) written to config.local.json\n`);
    return 0;
  }
}
