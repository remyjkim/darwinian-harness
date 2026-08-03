// ABOUTME: Implements drwn projects for machine-wide project index operations.
// ABOUTME: Supports listing registered projects and bulk update across them.

import { Option } from "clipanion";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listRegisteredProjects, pruneStaleProjects, unregisterProject, updateAllRegisteredProjects } from "../core/project-registry";
import { renderJson } from "../core/output";
import { BaseCommand } from "./base";

export class ProjectsListCommand extends BaseCommand {
  static override paths = [["projects", "list"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "List projects registered in ~/.agents/drwn/projects.json.",
    details: `
      Shows project roots registered via drwn init or drwn use. The index is
      opt-in and widens store GC roots once present.
    `,
    examples: [["List registered projects", "drwn projects list"]],
  });

  async execute() {
    const projects = await listRegisteredProjects(this.context.agentsDir);
    if (projects.length === 0) {
      this.context.stdout.write("No registered projects.\n");
      return 0;
    }
    this.context.stdout.write(`${projects.join("\n")}\n`);
    return 0;
  }
}

export class ProjectsUpdateCommand extends BaseCommand {
  static override paths = [["projects", "update"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Run drwn up in each registered project.",
    details: `
      Iterates ~/.agents/drwn/projects.json and runs the same update flow as
      drwn up in each registered project root.
    `,
    examples: [["Update all registered projects", "drwn projects update --all"]],
  });

  all = Option.Boolean("--all", false, { description: "Update every registered project." });
  fetch = Option.Boolean("--fetch", true, { description: "Fetch git remotes before checking outdated cards." });
  dryRun = Option.Boolean("--dry-run", false, { description: "Preview without updating." });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    if (!this.all) {
      this.context.stderr.write("Use drwn projects update --all to refresh registered projects.\n");
      return 1;
    }
    const results = await updateAllRegisteredProjects({
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      repoRoot: this.context.repoRoot,
      fetch: this.fetch,
      dryRun: this.dryRun,
    });
    if (results.length === 0) {
      this.context.stdout.write(this.json ? renderJson({ projects: [] }) : "No registered projects.\n");
      return 0;
    }
    if (this.json) {
      this.context.stdout.write(renderJson({ projects: results }));
    } else {
      for (const entry of results) {
        this.context.stdout.write(`${entry.projectRoot}: ${entry.message}\n`);
      }
    }
    return 0;
  }
}

export class ProjectsUnregisterCommand extends BaseCommand {
  static override paths = [["projects", "unregister"]];
  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Remove one stale project root from the machine project registry.",
    details: `
      Removes exactly one normalized project root from projects.json. This is
      the repair path for a missing or unreadable registration that blocks a
      fail-closed machine inventory reference scan. It does not change files in
      the project itself.
    `,
    examples: [["Unregister a deleted checkout", "drwn projects unregister /work/old-project"]],
  });

  projectRoot = Option.String({ required: true });
  dryRun = Option.Boolean("--dry-run", false);
  json = Option.Boolean("--json", false);

  async execute() {
    const result = {
      ...(await unregisterProject(this.context.agentsDir, this.projectRoot, { dryRun: this.dryRun })),
      dryRun: this.dryRun,
    };
    this.context.stdout.write(this.json
      ? renderJson(result)
      : `${result.removed ? this.dryRun ? "Would unregister" : "Unregistered" : "Project was not registered"}: ${result.projectRoot}\n`);
    return 0;
  }
}

export class ProjectsPruneCommand extends BaseCommand {
  static override paths = [["projects", "prune"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Remove stale project roots from the machine project registry.",
    details: `
      Iterates ~/.agents/drwn/projects.json and removes entries whose
      .agents/drwn/config.json no longer exists. Use this to clean up
      registrations left behind by deleted or moved project checkouts.
    `,
    examples: [
      ["Preview stale entries", "drwn projects prune --dry-run"],
      ["Remove stale entries", "drwn projects prune"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, { description: "Preview without removing." });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    const result = await pruneStaleProjects(this.context.agentsDir, { dryRun: this.dryRun });
    const output = { ...result, dryRun: this.dryRun };
    if (this.json) {
      this.context.stdout.write(renderJson(output));
    } else if (result.pruned.length === 0) {
      this.context.stdout.write("No stale project registrations found.\n");
    } else {
      for (const projectRoot of result.pruned) {
        this.context.stdout.write(`${this.dryRun ? "Would remove" : "Removed"} stale: ${projectRoot}\n`);
      }
      this.context.stdout.write(`${this.dryRun ? "Would prune" : "Pruned"} ${result.pruned.length} stale registration(s); ${result.remaining} remaining.\n`);
    }
    return 0;
  }
}
