// ABOUTME: Implements `drwn worker new` to scaffold a Worker Blueprint source (a kind:"blueprint" card).
// ABOUTME: A blueprint composes member cards plus governance; author it, then compose and publish.

import { Option } from "clipanion";
import { createCardSource, normalizeCardName } from "../../core/card-store";
import { BaseCommand } from "../base";
import { loadUserPreferences, mutateUserPreferences } from "../../core/user-preferences";
import { expandHomePath } from "../../core/paths";
import { join, resolve } from "node:path";

export class WorkerNewCommand extends BaseCommand {
  static override paths = [["worker", "new"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: 'Create an editable Worker Blueprint source (a kind:"blueprint" card).',
    details: `
      Scaffolds a Blueprint source repository beneath the current directory or
      an explicit --into collection. Add member Cards with 'drwn worker compose',
      then ship it with 'drwn worker publish'.
    `,
    examples: [["Create a blueprint", "drwn worker new @your-handle/frontend-eng"]],
  });

  name = Option.String({ required: true });

  scope = Option.String("--scope", {
    description: "Scope to apply to an unscoped name (e.g. @your-handle).",
  });
  into = Option.String("--into", { description: "Parent directory for the new Worker source repository." });

  noGit = Option.Boolean("--no-git", false, {
    description: "Do not initialize a git repository in the new source directory.",
  });

  async execute() {
    try {
      const preferences = await loadUserPreferences(this.context.agentsDir);
      const scope = this.scope ?? preferences.defaultAuthorScope;
      const fullName = normalizeCardName(this.name, scope);
      const parentDir = resolve(this.context.cwd, expandHomePath(this.into ?? ".", this.context.homeDir));
      const sourceDir = join(parentDir, fullName.split("/").at(-1)!);
      const created = await createCardSource({
        sourceDir,
        name: this.name,
        scope,
        noGit: this.noGit,
        kind: "blueprint",
      });
      if (scope && preferences.defaultAuthorScope !== scope) {
        await mutateUserPreferences(this.context.agentsDir, (current) => ({
          preferences: { ...current, defaultAuthorScope: scope },
          value: undefined,
        }));
      }
      this.context.stdout.write(`Created blueprint source ${created.name}: ${created.sourceDir}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
