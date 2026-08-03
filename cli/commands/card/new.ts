// ABOUTME: Implements `drwn card new` for creating editable local card sources.
// ABOUTME: Persists authoring scope so repeated card creation stays concise.

import { Option } from "clipanion";
import { createInterface } from "node:readline/promises";
import { captureProjectAsCard } from "../../core/card-capture";
import { createCapabilityCardFromDefaults } from "../../core/card-from-defaults";
import { isCardUnscopedName } from "../../core/card-manifest";
import { createCardSource } from "../../core/card-store";
import { normalizeCardName } from "../../core/card-store";
import { probeAuthoringScope, resolveScopeForCardNew } from "../../core/authoring-scope";
import { defaultProbeGh, defaultProbeGit } from "../../core/authoring-scope-probes";
import { BaseCommand } from "../base";
import { loadUserPreferences, mutateUserPreferences } from "../../core/user-preferences";
import { expandHomePath } from "../../core/paths";
import { join, resolve } from "node:path";

export class CardNewCommand extends BaseCommand {
  static override paths = [["card", "new"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Create an editable Card source repository.",
    details: `
      Creates a source directory with card.json, skills/, and mcp-servers/
      beneath the current directory or an explicit --into collection.
      Unscoped names require --scope or a saved authoring.scope in machine.json.
      By default the source directory is initialized as a git repository.
      Use --from-project to snapshot the current project's selected Worker
      closure and explicit overlays as a self-contained card source.
      Use --from-defaults to flatten the effective machine-safe skills and MCP
      definitions into a normal Card without machine profile identity or policy.
    `,
    examples: [
      ["Create a scoped card source", "drwn card new backend --scope @your-handle"],
      ["Create a fully-qualified card source", "drwn card new @your-handle/backend --no-git"],
      ["Capture the current project", "drwn card new @your-handle/project-harness --from-project ."],
      ["Capture machine capabilities", "drwn card new @your-handle/machine-capabilities --from-defaults"],
    ],
  });

  name = Option.String({ required: true });
  projectPath = Option.String({ required: false });

  fromProject = Option.Boolean("--from-project", false, {
    description: "Capture a project's effective harness into the new card source.",
  });

  fromDefaults = Option.Boolean("--from-defaults", false, {
    description: "Capture effective machine-safe capabilities into a Card source.",
  });

  scope = Option.String("--scope", {
    description: "Scope to apply to an unscoped card name (e.g., @your-handle). Auto-derived from gh / git config on first use.",
  });

  into = Option.String("--into", { description: "Parent directory for the new Card source repository." });

  noGit = Option.Boolean("--no-git", false, {
    description: "Do not initialize a git repository in the new source directory.",
  });

  async execute() {
    if (this.projectPath && !this.fromProject) {
      this.context.stderr.write("Project path is only valid with --from-project\n");
      return 1;
    }
    if (this.fromProject && this.fromDefaults) {
      this.context.stderr.write("Use either --from-project or --from-defaults, not both.\n");
      return 1;
    }
    const preferences = await loadUserPreferences(this.context.agentsDir);

    let scopeForCreate: string | undefined = this.scope ?? preferences.defaultAuthorScope;
    if (isCardUnscopedName(this.name) && !scopeForCreate) {
      const resolved = await resolveScopeForCardNew({
        explicit: this.scope,
        savedScope: preferences.defaultAuthorScope,
        isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
        probe: () => probeAuthoringScope({ runGh: defaultProbeGh, runGit: defaultProbeGit }),
        prompt: async (suggested) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          try {
            const answer = (
              await rl.question(`Use ${suggested} as your default card scope? [Y/n] `)
            )
              .trim()
              .toLowerCase();
            return answer === "" || answer === "y" || answer === "yes";
          } finally {
            rl.close();
          }
        },
      });

      if (resolved.kind === "error") {
        this.context.stderr.write(`${resolved.message}\n`);
        return 1;
      }
      scopeForCreate = resolved.scope;
    }
    const fullName = normalizeCardName(this.name, scopeForCreate);
    const authorScope = fullName.split("/")[0]!;
    const parentDir = resolve(this.context.cwd, expandHomePath(this.into ?? ".", this.context.homeDir));
    const sourceDir = join(parentDir, fullName.split("/").at(-1)!);

    if (this.fromDefaults) {
      let captured;
      try {
        captured = await createCapabilityCardFromDefaults({
          agentsDir: this.context.agentsDir,
          repoRoot: this.context.repoRoot,
          homeDir: this.context.homeDir,
          name: this.name,
          sourceDir,
          scope: scopeForCreate,
          noGit: this.noGit,
        });
      } catch (error) {
        this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
      }
      if (preferences.defaultAuthorScope !== authorScope) {
        await mutateUserPreferences(this.context.agentsDir, (current) => ({
          preferences: { ...current, defaultAuthorScope: authorScope },
          value: undefined,
        }));
      }
      this.context.stdout.write(`Created capability card ${captured.name}: ${captured.sourceDir}\n`);
      this.context.stdout.write(`Skills captured: ${captured.skillCount}\n`);
      this.context.stdout.write(`MCP servers captured: ${captured.serverCount}\n`);
      this.context.stdout.write(`Next: drwn card publish --from ${captured.sourceDir}\n`);
      return 0;
    }

    if (this.fromProject) {
      let captured;
      try {
        captured = await captureProjectAsCard({
          agentsDir: this.context.agentsDir,
          repoRoot: this.context.repoRoot,
          homeDir: this.context.homeDir,
          projectPath: this.projectPath ?? this.context.cwd,
          name: this.name,
          sourceDir,
          scope: scopeForCreate,
          noGit: this.noGit,
        });
      } catch (error) {
        this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
      }
      if (preferences.defaultAuthorScope !== authorScope) {
        await mutateUserPreferences(this.context.agentsDir, (current) => ({
          preferences: { ...current, defaultAuthorScope: authorScope },
          value: undefined,
        }));
      }
      this.context.stdout.write(`Captured card source ${captured.name}: ${captured.sourceDir}\n`);
      this.context.stdout.write(`Skills captured: ${captured.skillCount}\n`);
      this.context.stdout.write(`Hooks captured: ${captured.hookCount}\n`);
      this.context.stdout.write(`MCP servers captured: ${captured.serverCount}\n`);
      this.context.stdout.write(`Extensions captured: ${captured.extensionCount}\n`);
      this.context.stdout.write(`Targets captured: ${captured.targetCount}\n`);
      this.context.stdout.write(`Next: drwn card publish --from ${captured.sourceDir}\n`);
      return 0;
    }
    let source;
    try {
      source = await createCardSource({
        sourceDir,
        name: this.name,
        scope: scopeForCreate,
        noGit: this.noGit,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (preferences.defaultAuthorScope !== authorScope) {
      await mutateUserPreferences(this.context.agentsDir, (current) => ({
        preferences: { ...current, defaultAuthorScope: authorScope },
        value: undefined,
      }));
    }
    this.context.stdout.write(`Created card source ${source.name}: ${source.sourceDir}\n`);
    return 0;
  }
}
