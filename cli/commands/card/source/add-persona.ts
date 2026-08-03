// ABOUTME: Implements `drwn card source add-persona` for editable card sources.
// ABOUTME: Scaffolds persona content and records explicit visibility metadata.

import { Option } from "clipanion";
import { addCardSourcePersona } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceAddPersonaCommand extends BaseCommand {
  static override paths = [["card", "source", "add-persona"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Scaffold persona content in an editable card source.",
    details: `
      Creates persona/<entry>/PERSONA.md and appends the entry to card.json
      persona.include with the required explicit visibility.
    `,
    examples: [
      ["Add persona content", "drwn card source add-persona @your-handle/mind voice --visibility internal"],
      ["Preview persona scaffolding", "drwn card source add-persona @your-handle/mind voice --visibility internal --dry-run --json"],
    ],
  });

  cardName = Option.String({ required: true });
  entryName = Option.String({ required: true });

  visibility = Option.String("--visibility", { required: true, description: "Visibility: private, internal, or public." });

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
      result = await addCardSourcePersona({
        sourceDir: source.sourceDir,
        entryName: this.entryName,
        visibility: this.visibility,
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
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} persona ${this.entryName} to ${this.cardName}\n`);
    return 0;
  }
}
