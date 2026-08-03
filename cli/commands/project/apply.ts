// ABOUTME: Implements canonical `drwn apply <refs...>` for replacing project Worker roots.
// ABOUTME: Requires explicit singular selection when replacement would otherwise be ambiguous.

import { Option } from "clipanion";
import { applyProjectWorkerRoots } from "../../core/worker-project";
import { applyMachineWorkerRoots } from "../../core/worker-machine";
import { loadCardLock } from "../../core/card-lock";
import { buildApplySummaries } from "../../core/card-apply-summary";
import { BaseCommand } from "../base";
import {
  renderMachineWorkerMutation,
  renderWorkerMutation,
  requireProjectRoot,
  runChainedWrite,
} from "../card/project-command";

export class ProjectApplyCommand extends BaseCommand {
  static override paths = [["apply"]];
  static override usage = BaseCommand.Usage({
    category: "Project",
    description: "Replace project Worker roots, or machine Blueprint roots with --root.",
    details: `
      Resolves the complete replacement root graph before atomically committing
      config and lock. Multiple alternative roots require --active <root> or
      --none; they never become an implicit active stack.
    `,
    examples: [
      ["Apply and select one root", "drwn apply @team/operator@^1.0.0"],
      ["Keep alternatives and select one", "drwn apply @team/a@1.0.0 @team/b@1.0.0 --active @team/a"],
    ],
  });
  specs = Option.Rest();
  root = Option.Boolean("--root", false, { description: "Mutate machine Worker Blueprint roots." });
  active = Option.String("--active");
  none = Option.Boolean("--none", false);
  write = Option.Boolean("--write", false);
  dryRun = Option.Boolean("--dry-run", false);
  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false);
  acceptSuccessor = Option.Boolean("--accept-successor", false);

  async execute() {
    try {
      if (this.specs.length === 0 && !this.none) {
        this.context.stderr.write("drwn apply requires at least one Worker ref, or --none to clear roots.\n");
        return 1;
      }
      if (this.root) {
        const result = await applyMachineWorkerRoots(this.context.agentsDir, this.specs, {
          active: this.active,
          none: this.none,
          allowUntrustedSource: this.allowUntrustedSource,
          acceptSuccessor: this.acceptSuccessor,
          repoRoot: this.context.repoRoot,
          cwd: this.context.cwd,
          dryRun: this.dryRun,
        });
        this.context.stdout.write(renderMachineWorkerMutation(result));
        return this.write && !this.dryRun ? runChainedWrite(this, { machine: true }) : 0;
      }

      const projectRoot = requireProjectRoot(this);
      const previous = await loadCardLock(projectRoot);
      const result = await applyProjectWorkerRoots(projectRoot, this.context.agentsDir, this.specs, {
        active: this.active,
        none: this.none,
        allowUntrustedSource: this.allowUntrustedSource,
        acceptSuccessor: this.acceptSuccessor,
        repoRoot: this.context.repoRoot,
        cwd: this.context.cwd,
        dryRun: this.dryRun,
      });
      this.context.stdout.write(renderWorkerMutation(result));
      const summaries = buildApplySummaries(result.locked, previous?.cards ?? []);
      if (summaries.length) this.context.stdout.write(`${summaries.join("\n\n")}\n`);
      return this.write && !this.dryRun ? runChainedWrite(this) : 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
