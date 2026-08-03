// ABOUTME: Implements `drwn card source remove-persona` for editable card sources.
// ABOUTME: Removes persona declarations and optionally their bundled files.

import { Option } from "clipanion";
import { removeCardSourcePersona } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceRemovePersonaCommand extends BaseCommand {
  static override paths = [["card", "source", "remove-persona"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove persona content from an editable card source.",
    details: `
      Removes an entry from card.json persona.include and deletes the bundled
      persona/<entry>/ directory by default. Use --keep-files to preserve files.
    `,
    examples: [
      ["Remove persona content", "drwn card source remove-persona @your-handle/mind voice"],
      ["Keep files while removing the manifest entry", "drwn card source remove-persona @your-handle/mind voice --keep-files"],
    ],
  });

  cardName = Option.String({ required: true });
  entryName = Option.String({ required: true });

  keepFiles = Option.Boolean("--keep-files", false, {
    description: "Keep the persona directory and remove only the manifest entry.",
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
      result = await removeCardSourcePersona({
        sourceDir: source.sourceDir,
        entryName: this.entryName,
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
    this.context.stdout.write(`${this.dryRun ? "Would remove" : "Removed"} persona ${this.entryName} from ${this.cardName}\n`);
    return 0;
  }
}
