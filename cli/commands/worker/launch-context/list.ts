// ABOUTME: Lists bounded self-identifying Worker launch contexts and recomputed currentness.
// ABOUTME: Scans read-only without a mutable generated index or Herdr runtime dependency.

import { Option } from "clipanion";
import { BaseCommand } from "../../base";
import { DrwnError } from "../../../core/errors";
import { renderJson, renderTable } from "../../../core/output";
import { resolveProjectRootFromConfigPath } from "../../../core/project";
import { listProjectWorkerLaunchContexts } from "../../../core/worker-launch-context/diagnostics";

export class WorkerLaunchContextListCommand extends BaseCommand {
  static override paths = [["worker", "launch-context", "list"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "List and verify generated Worker launch contexts.",
    details: `
      Scans the bounded self-identifying context store, verifies manifest and
      receipt ownership, and recomputes currentness from the recorded root,
      target, optional MCP, and strictness inputs. This command is read-only and
      does not inspect live Herdr agents.
    `,
    examples: [
      ["List launch contexts", "drwn worker launch-context list"],
      ["Inspect strict JSON", "drwn worker launch-context list --json"],
    ],
  });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON." });

  async execute(): Promise<number> {
    try {
      if (!this.context.projectConfigPath) throw new DrwnError("PROJECT_NOT_INITIALIZED", "Run inside an initialized project");
      const projectRoot = resolveProjectRootFromConfigPath(this.context.projectConfigPath);
      const inventory = await listProjectWorkerLaunchContexts({
        projectRoot,
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
      });
      if (this.json) this.context.stdout.write(renderJson(inventory));
      else if (inventory.contexts.length === 0) this.context.stdout.write("No Worker launch contexts.\n");
      else this.context.stdout.write(renderTable(
        ["context", "target", "assigned_root", "state", "local"],
        inventory.contexts.map((item) => [item.contextId ?? "<foreign>", item.target ?? "unknown", item.assignedRoot ?? "unknown", item.state, String(item.localOnly ?? false)]),
      ));
      return 0;
    } catch (error) {
      const normalized = error instanceof DrwnError
        ? error
        : new DrwnError("LAUNCH_LIST_FAILED", "Worker launch-context inspection failed");
      if (this.json) this.context.stdout.write(renderJson(normalized.toJSON()));
      else this.context.stderr.write(`${normalized.code}: ${normalized.message}\n`);
      return 1;
    }
  }
}
