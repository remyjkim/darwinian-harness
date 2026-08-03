// ABOUTME: Implements `drwn card source list` for editable local card sources.
// ABOUTME: Keeps source inventory distinct from published card versions.

import { Option } from "clipanion";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceListCommand extends BaseCommand {
  static override paths = [["card", "source", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "List editable card sources under ~/.agents/drwn/sources.",
    details: `
      Lists local source directories used by card authors before publishing.
      This command is read-only; published card versions remain under
      ~/.agents/drwn/cards and are listed with drwn card list.
    `,
    examples: [
      ["List editable sources", "drwn card source list"],
      ["List editable sources as JSON", "drwn card source list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const message = "card source list is deprecated: editable sources are ordinary repositories; inspect configured catalogCheckouts or pass a source path to card source show/doctor.";
    if (this.json) {
      this.context.stdout.write(renderJson({ deprecated: true, message }));
      return 1;
    }
    this.context.stderr.write(`${message}\n`);
    return 1;
  }
}
