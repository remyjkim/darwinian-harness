// ABOUTME: Implements report-only Worker launch-context pruning with an explicit execution gate.
// ABOUTME: Requires an age filter and refuses drifted or foreign generated content.

import { Option } from "clipanion";
import { BaseCommand } from "../../base";
import { DrwnError } from "../../../core/errors";
import { renderJson } from "../../../core/output";
import { resolveProjectRootFromConfigPath } from "../../../core/project";
import { parseWorkerLaunchPruneDuration, pruneProjectWorkerLaunchContexts } from "../../../core/worker-launch-context/prune";

export class WorkerLaunchContextPruneCommand extends BaseCommand {
  static override paths = [["worker", "launch-context", "prune"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Report or remove age-filtered owned Worker launch contexts.",
    details: `
      Default mode is report-only. --execute authorizes removal and requires an
      explicit --older-than duration such as 7d, 12h, or 0s. Every candidate is
      reverified immediately before a contained rename and removal. Drifted,
      corrupt, foreign, and symlinked content is always retained.

      Darwinian Worker cannot identify contexts used by live Herdr agents.
    `,
    examples: [
      ["Preview contexts older than seven days", "drwn worker launch-context prune --older-than 7d"],
      ["Remove every verified context regardless of age", "drwn worker launch-context prune --older-than 0s --execute --json"],
    ],
  });
  olderThan = Option.String("--older-than", { description: "Age filter: integer followed by s, m, h, or d." });
  executeRemoval = Option.Boolean("--execute", false, { description: "Execute the displayed owned removals." });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON." });

  async execute(): Promise<number> {
    try {
      if (!this.context.projectConfigPath) throw new DrwnError("PROJECT_NOT_INITIALIZED", "Run inside an initialized project");
      if (this.executeRemoval && !this.olderThan) {
        throw new DrwnError("LAUNCH_PRUNE_AGE_REQUIRED", "--execute requires an explicit --older-than duration");
      }
      const olderThanMs = this.olderThan ? parseWorkerLaunchPruneDuration(this.olderThan) : Number.MAX_SAFE_INTEGER;
      const report = await pruneProjectWorkerLaunchContexts({
        projectRoot: resolveProjectRootFromConfigPath(this.context.projectConfigPath),
        olderThanMs,
        execute: this.executeRemoval,
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
      });
      if (this.json) this.context.stdout.write(renderJson(report));
      else {
        this.context.stdout.write(`${report.candidates} Worker launch context candidate(s); ${report.removed.length} removed.\n`);
        for (const warning of report.warnings) this.context.stderr.write(`Warning: ${warning}\n`);
      }
      return 0;
    } catch (error) {
      const normalized = error instanceof DrwnError
        ? error
        : new DrwnError("LAUNCH_PRUNE_FAILED", "Worker launch-context pruning failed");
      if (this.json) this.context.stdout.write(renderJson(normalized.toJSON()));
      else this.context.stderr.write(`${normalized.code}: ${normalized.message}\n`);
      return 1;
    }
  }
}
