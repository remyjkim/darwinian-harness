// ABOUTME: Implements removal of explicit hook or instruction consent for locked Cards.
// ABOUTME: Lets users stop selected materialization surfaces without removing the Card.

import { Option, UsageError } from "clipanion";
import { clearCardConsent } from "../../core/card-project";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardUntrustCommand extends BaseCommand {
  static override paths = [["card", "untrust"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove hook or instruction trust from a locked card.",
    details: `
      Clears selected consent from card.lock. The Card remains installed, but
      drwn write skips the selected contribution until consent is recorded again.
    `,
    examples: [["Untrust card hooks", "drwn card untrust @your-handle/backend --hooks"]],
  });

  spec = Option.String({ required: true });

  hooks = Option.Boolean("--hooks", false, {
    description: "Clear hook execution consent for this card.",
  });

  instructions = Option.Boolean("--instructions", false, {
    description: "Clear explicit instruction projection consent for this card.",
  });

  async execute() {
    if (!this.hooks && !this.instructions) {
      throw new UsageError("Specify --hooks and/or --instructions to clear consent.");
    }
    let result;
    try {
      result = await clearCardConsent(
        requireProjectRoot(this),
        this.context.agentsDir,
        this.spec,
        { hooks: this.hooks, instructions: this.instructions },
      );
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    const untrusted = [this.hooks ? "hooks" : null, this.instructions ? "instructions" : null]
      .filter(Boolean)
      .join(" and ");
    this.context.stdout.write(`Untrusted ${untrusted} for ${result.card.name}@${result.card.version}\nWrote ${result.lockPath}\n`);
    return 0;
  }
}
