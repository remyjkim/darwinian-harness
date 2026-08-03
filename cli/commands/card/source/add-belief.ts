// ABOUTME: Implements `drwn card source add-belief` for editable card sources.
// ABOUTME: Scaffolds belief content and records explicit visibility metadata.

import { Option } from "clipanion";
import { addCardSourceBelief } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceAddBeliefCommand extends BaseCommand {
  static override paths = [["card", "source", "add-belief"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Scaffold belief content in an editable card source.",
    details: `
      Creates beliefs/<entry>/BELIEF.md and appends the entry to card.json
      beliefs.include with the required explicit visibility.
    `,
    examples: [["Add belief content", "drwn card source add-belief @your-handle/mind engineering --visibility public"]],
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
      result = await addCardSourceBelief({
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
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} belief ${this.entryName} to ${this.cardName}\n`);
    return 0;
  }
}
