// ABOUTME: Implements `drwn card source list` for editable local card sources.
// ABOUTME: Keeps source inventory distinct from published card versions.

import { Option } from "clipanion";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";

export class CardSourceListCommand extends BaseCommand {
  static override paths = [["card", "source", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Explain how to locate editable Card source repositories.",
    details: `
      Editable Card sources are ordinary repositories and are no longer stored
      in a machine-wide source directory. Inspect configured catalog checkouts
      or pass an explicit source path to source commands.
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
