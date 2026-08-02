// ABOUTME: Implements drwn up as outdated fetch, card update, and write orchestration.
// ABOUTME: Re-vendors updated treeShas and prunes stale vendor trees via write reconcile.

import { Option } from "clipanion";
import { loadCardLock } from "../core/card-lock";
import { findOutdatedProjectCards, updateProjectCardLock } from "../core/card-project";
import * as git from "../core/git";
import { renderSyncResult } from "../core/output";
import { resolveCardBareRepoPath } from "../core/store-paths";
import { syncRepository } from "../core/sync";
import { findProjectConfig, resolveProjectRootFromConfigPath } from "../core/project";
import { BaseCommand } from "./base";

export class UpCommand extends BaseCommand {
  static override paths = [["up"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Update all project cards within their ranges and re-materialize.",
    details: `
      Fetches remotes when needed, refreshes card.lock within configured ranges,
      and runs drwn write to re-vendor updated treeShas.
    `,
    examples: [["Update project cards", "drwn up"]],
  });

  fetch = Option.Boolean("--fetch", true, { description: "Fetch git remotes before checking outdated cards." });
  dryRun = Option.Boolean("--dry-run", false, { description: "Preview without updating." });

  async execute() {
    const projectConfigPath = findProjectConfig(this.context.cwd);
    if (!projectConfigPath) {
      this.context.stderr.write("Run drwn up inside a project.\n");
      return 1;
    }
    const projectRoot = resolveProjectRootFromConfigPath(projectConfigPath);
    if (this.fetch) {
      const lock = await loadCardLock(projectRoot);
      for (const entry of lock?.cards ?? []) {
        if (!entry.git?.url) continue;
        const barePath = resolveCardBareRepoPath(this.context.agentsDir, entry.name);
        await git.fetch(barePath, "origin", ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"]);
      }
    }
    const outdated = await findOutdatedProjectCards(projectRoot, this.context.agentsDir, {
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    if (outdated.length === 0) {
      this.context.stdout.write("Nothing to update.\n");
      return 0;
    }
    if (this.dryRun) {
      this.context.stdout.write(`Would update: ${outdated.map((entry) => entry.name).join(", ")}\n`);
      return 0;
    }
    const lockResult = await updateProjectCardLock(projectRoot, this.context.agentsDir, {
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    if (lockResult.warnings?.length) {
      for (const warning of lockResult.warnings) {
        this.context.stdout.write(`${warning}\n`);
      }
    }
    const result = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
    });
    this.context.stdout.write(renderSyncResult(result));
    return 0;
  }
}
