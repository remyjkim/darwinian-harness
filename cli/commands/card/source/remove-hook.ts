// ABOUTME: Implements `drwn card source remove-hook` for editable card sources.
// ABOUTME: Removes hook policy modules and card.json hooks.include entries.

import { Option } from "clipanion";
import { removeCardSourceHook } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceRemoveHookCommand extends BaseCommand {
  static override paths = [["card", "source", "remove-hook"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove a hook policy from an editable card source.",
    details: `
      Removes a policy from card.json hooks.include and deletes the bundled
      hooks/<name>/ directory by default. Use --keep-files to undeclare the
      hook while preserving local policy work.
    `,
    examples: [
      ["Remove a hook policy", "drwn card source remove-hook @your-handle/backend audit-tool-calls"],
      ["Keep files while removing the manifest entry", "drwn card source remove-hook @your-handle/backend audit --keep-files"],
    ],
  });

  cardName = Option.String({ required: true });
  hookName = Option.String({ required: true });

  keepFiles = Option.Boolean("--keep-files", false, {
    description: "Keep the hook policy directory and remove only the manifest entry.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview source changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    let result;
    try {
      const source = await resolveCommandCardSource(this.context, { input: this.cardName });
      result = await removeCardSourceHook({
        sourceDir: source.sourceDir,
        hookName: this.hookName,
        keepFiles: this.keepFiles,
        dryRun: this.dryRun,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }
    this.context.stdout.write(`${this.dryRun ? "Would remove" : "Removed"} hook ${this.hookName} from ${this.cardName}\n`);
    return 0;
  }
}
