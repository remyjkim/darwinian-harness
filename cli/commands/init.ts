// ABOUTME: Implements the drwn init command for creating per-project config scaffolding.
// ABOUTME: Keeps project bootstrap simple while authoring drwn gitignore and vendor gitattributes hygiene.

import { Option } from "clipanion";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ensureDefaultCommunityCatalog, resolveDefaultCommunityCatalogUrl } from "../core/card-catalog";
import { loadConfig } from "../core/config";
import { ensureBeadsProjectExtensionConfig, normalizeBeadsTargets } from "../core/extensions/beads";
import { ensureParallelProjectExtensionConfig } from "../core/extensions/parallel";
import { resolveInitMode, resolveRecommendedWorkerChoice } from "../core/interactivity";
import { initializeMachineWorker } from "../core/machine-profiles";
import { ensureGitignoreEntries, ensureVendorGitattributes } from "../core/git-hygiene";
import { registerProject } from "../core/project-registry";
import { scaffoldProjectConfig } from "../core/project";
import { mutateUserPreferences } from "../core/user-preferences";
import { BaseCommand } from "./base";

export class InitCommand extends BaseCommand {
  static override paths = [["init"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Create per-project configuration. In a TTY this runs guided setup; prompt-free modes write a bare config and warn if .gitignore excludes .agents.",
    details: `
      Writes <project>/.agents/drwn/config.json.

      In a TTY, runs guided setup that can configure Parallel and Beads project
      options. Outside a TTY, use --non-interactive or --minimal to write the
      minimal supported project config. Warns if .gitignore appears to exclude
      .agents.

      Use --force to overwrite an existing config. Use --guided to force the
      interactive flow when stdin and stdout are TTYs.
    `,
    examples: [
      ["First-time setup in an interactive shell", "drwn init"],
      ["Minimal config without prompts", "drwn init --non-interactive"],
      ["Register a Card collection checkout", "drwn init --non-interactive --catalog-checkout ~/dev/darwinian-cards"],
      ["Re-run setup over an existing config", "drwn init --force --guided"],
    ],
  });

  force = Option.Boolean("--force", false, {
    description: "Overwrite an existing project config.",
  });

  guided = Option.Boolean("--guided", false, {
    description: "Force guided interactive project setup (the default in a TTY).",
  });

  nonInteractive = Option.Boolean("--non-interactive", false, {
    description: "Create minimal project config without prompts.",
  });

  minimal = Option.Boolean("--minimal", false, {
    description: "Alias for prompt-free minimal project config creation.",
  });

  noDefaultCatalogs = Option.Boolean("--no-default-catalogs", false, {
    description: "Skip pre-registering the default community card catalog.",
  });

  catalogCheckouts = Option.Array("--catalog-checkout", [], {
    description: "Register an ordinary Card collection checkout for name-based authoring.",
  });

  async execute() {
    const projectDir = process.cwd();
    const mode = resolveInitMode({
      guided: this.guided,
      minimal: this.minimal,
      nonInteractive: this.nonInteractive,
      stdinIsTTY: process.stdin.isTTY === true,
      stdoutIsTTY: process.stdout.isTTY === true,
    });
    if (mode.mode === "error") {
      throw new Error(mode.message ?? "Invalid init mode.");
    }
    const existingConfigPath = join(projectDir, ".agents", "drwn", "config.json");
    if (existsSync(existingConfigPath) && !this.force) {
      throw new Error(`Project config already exists: ${existingConfigPath}`);
    }

    if (this.catalogCheckouts.length > 0) {
      await this.registerCatalogCheckouts(this.catalogCheckouts);
    }

    const configPath = mode.mode === "guided"
      ? await this.executeGuided(projectDir)
      : await this.executeMinimal(projectDir);
    await ensureGitignoreEntries(projectDir);
    await ensureVendorGitattributes(projectDir);
    await registerProject(this.context.agentsDir, projectDir);
    const gitignorePath = join(projectDir, ".gitignore");
    const messages: string[] = [`Created project config: ${configPath}`];

    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, "utf8");
      if (gitignore.includes(".agents") && !gitignore.includes(".agents/drwn/config.local.json")) {
        messages.push("Warning: .gitignore appears to exclude .agents; this config may not be shared with collaborators.");
      }
    }

    if (!this.noDefaultCatalogs) {
      const packaged = await loadConfig(this.context.repoRoot);
      const url = resolveDefaultCommunityCatalogUrl(packaged);
      await ensureDefaultCommunityCatalog(this.context.agentsDir, url);
    }

    this.context.stdout.write(`${messages.join("\n")}\n`);
    return 0;
  }

  private async executeMinimal(projectDir: string) {
    await initializeMachineWorker({
      agentsDir: this.context.agentsDir,
      repoRoot: this.context.repoRoot,
      guided: false,
    });
    return scaffoldProjectConfig(projectDir, { force: this.force });
  }

  private async executeGuided(projectDir: string) {
    const rl = createInterface({ input, output });
    try {
      await initializeMachineWorker({
        agentsDir: this.context.agentsDir,
        repoRoot: this.context.repoRoot,
        guided: true,
        promptRecommended: async () => resolveRecommendedWorkerChoice(
          await rl.question("Use the Recommended Machine Defaults Worker Blueprint? [Y/n] "),
        ),
      });
      if (this.catalogCheckouts.length === 0) {
        const checkout = (await rl.question("Path to a Card collection checkout? (leave blank to skip) ")).trim();
        if (checkout) {
          await this.registerCatalogCheckouts([checkout]);
        }
      }
      const configPath = await scaffoldProjectConfig(projectDir, { force: this.force });
      const parallelAnswer = (await rl.question("Enable Parallel extension for this project? [y/N] ")).trim().toLowerCase();
      if (parallelAnswer === "y" || parallelAnswer === "yes") {
        const mcpAnswer = (await rl.question("Enable Parallel MCP too? [y/N] ")).trim().toLowerCase();
        ensureParallelProjectExtensionConfig({
          projectDir,
          skills: true,
          mcp: mcpAnswer === "y" || mcpAnswer === "yes",
        });
      }

      const beadsAnswer = (await rl.question("Enable Beads extension for this project? [y/N] ")).trim().toLowerCase();
      if (beadsAnswer === "y" || beadsAnswer === "yes") {
        const targetAnswer = (await rl.question("Beads targets? [codex,claude,cursor] ")).trim();
        const includeSkillAnswer = (await rl.question("Include beads-task-tracking skill? [y/N] ")).trim().toLowerCase();
        ensureBeadsProjectExtensionConfig(projectDir, {
          targets: normalizeBeadsTargets(targetAnswer || undefined),
          includeSkill: includeSkillAnswer === "y" || includeSkillAnswer === "yes",
        });
      }
      return configPath;
    } finally {
      rl.close();
    }
  }

  private async registerCatalogCheckouts(checkouts: string[]) {
    await mutateUserPreferences(this.context.agentsDir, (current) => ({
      preferences: {
        ...current,
        catalogCheckouts: [...new Set([...current.catalogCheckouts, ...checkouts])],
      },
      value: undefined,
    }));
  }
}
