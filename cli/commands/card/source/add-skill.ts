// ABOUTME: Implements `drwn card source add-skill` for editable card sources.
// ABOUTME: Copies skill content into source bundles and updates card.json semantically.

import { Option } from "clipanion";
import { addCardSourceSkill } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceAddSkillCommand extends BaseCommand {
  static override paths = [["card", "source", "add-skill"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Copy a skill into an editable card source.",
    details: `
      Resolves a skill from an explicit --from path, repo-native skills, or the
      local reusable inventory, then copies it into the Card source under skills/
      and appends the name to card.json skills.include. Existing bundled copies
      require --replace.
    `,
    examples: [
      ["Add a repo skill", "drwn card source add-skill @your-handle/backend alpha"],
      ["Preview the source mutation", "drwn card source add-skill @your-handle/backend alpha --dry-run --json"],
    ],
  });

  cardName = Option.String({ required: true });
  skillName = Option.String({ required: true });

  from = Option.String("--from", {
    description: "Copy the skill from this SKILL.md file or skill directory instead of resolving by name.",
  });

  replace = Option.Boolean("--replace", false, {
    description: "Replace an existing bundled copy.",
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
      result = await addCardSourceSkill({
        agentsDir: this.context.agentsDir,
        repoRoot: this.context.repoRoot,
        homeDir: this.context.homeDir,
        sourceDir: source.sourceDir,
        skillName: this.skillName,
        from: this.from,
        replace: this.replace,
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
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} ${this.skillName} to ${this.cardName}\n`);
    return 0;
  }
}
