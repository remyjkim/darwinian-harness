// ABOUTME: Implements `drwn worker compose` to add/remove member cards on a Worker Blueprint.
// ABOUTME: Mutates the blueprint's composedFrom and re-validates the manifest.

import { Option } from "clipanion";
import { composeCardSourceBlueprint } from "../../core/card-source";
import { BaseCommand } from "../base";
import { resolveCommandCardSource } from "../card/source-input";

export class WorkerComposeCommand extends BaseCommand {
  static override paths = [["worker", "compose"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Add or remove member cards on a Worker Blueprint's composedFrom.",
    details: `
      Mutates the blueprint source's composedFrom list and re-validates the
      manifest. Only valid on a kind:"blueprint" card. Adds are idempotent and
      removes are no-ops when absent; publish the blueprint afterwards to ship it.
    `,
    examples: [
      ["Add a member card", "drwn worker compose @you/frontend-eng --add @you/react-builder@^1.0.0"],
      ["Remove a member card", "drwn worker compose @you/frontend-eng --remove @you/react-builder@^1.0.0"],
    ],
  });

  name = Option.String({ required: true });

  add = Option.Array("--add", { description: "Card ref to add to composedFrom." });

  remove = Option.Array("--remove", { description: "Card ref to remove from composedFrom." });

  async execute() {
    if ((this.add ?? []).length === 0 && (this.remove ?? []).length === 0) {
      this.context.stderr.write("Provide at least one --add or --remove.\n");
      return 1;
    }
    try {
      const source = await resolveCommandCardSource(this.context, { input: this.name });
      const result = await composeCardSourceBlueprint({
        sourceDir: source.sourceDir,
        add: this.add,
        remove: this.remove,
      });
      for (const change of result.changes) {
        const verb = change.newValue !== undefined ? "added" : "removed";
        this.context.stdout.write(`  ${verb} ${change.newValue ?? change.oldValue}\n`);
      }
      this.context.stdout.write(`Updated ${result.card} composedFrom.\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
