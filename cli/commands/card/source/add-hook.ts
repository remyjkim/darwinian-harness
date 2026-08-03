// ABOUTME: Implements `drwn card source add-hook` for editable card sources.
// ABOUTME: Scaffolds hook policy modules and updates card.json hooks.include.

import { Option } from "clipanion";
import { addCardSourceHook } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceAddHookCommand extends BaseCommand {
  static override paths = [["card", "source", "add-hook"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Scaffold a hook policy in an editable card source.",
    details: `
      Creates hooks/<name>/policy.ts with an observer policy template and
      appends the policy name to card.json hooks.include. New hook stubs are
      observers by default so fresh scaffolds cannot fail closed.
    `,
    examples: [
      ["Add a hook policy", "drwn card source add-hook @your-handle/backend audit-tool-calls"],
      ["Preview the hook mutation", "drwn card source add-hook @your-handle/backend audit --dry-run --json"],
    ],
  });

  cardName = Option.String({ required: true });
  hookName = Option.String({ required: true });

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
      result = await addCardSourceHook({
        sourceDir: source.sourceDir,
        hookName: this.hookName,
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
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} hook ${this.hookName} to ${this.cardName}\n`);
    return 0;
  }
}
