// ABOUTME: Implements deterministic dry-run and atomic prepare for one installed Worker root.
// ABOUTME: Emits strict JSON for orchestrators while keeping target argv opaque.

import { Option } from "clipanion";
import { BaseCommand } from "../../base";
import { DrwnError } from "../../../core/errors";
import { renderJson } from "../../../core/output";
import { resolveProjectRootFromConfigPath } from "../../../core/project";
import { parseWorkerLaunchPrepareResult } from "../../../core/worker-launch-context/contracts";
import {
  planProjectWorkerLaunchContext,
  prepareProjectWorkerLaunchContext,
} from "../../../core/worker-launch-context/service";

export class WorkerLaunchContextPrepareCommand extends BaseCommand {
  static override paths = [["worker", "launch-context", "prepare"]];
  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Prepare target-native additions for one installed Worker root.",
    details: `
      Resolves an exact effective installed root, treats the active Worker as the
      shared project base, subtracts identical capabilities, and rejects
      divergent identities. --dry-run computes the complete deterministic plan
      without target execution or writes. Normal mode probes the target and
      atomically publishes or reuses a verified content-addressed context.
    `,
    examples: [
      ["Preview a Codex context", "drwn worker launch-context prepare @team/reviewer --target codex --dry-run --json"],
      ["Prepare Claude with one optional MCP", "drwn worker launch-context prepare @team/reviewer --target claude --enable-mcp context7 --json"],
    ],
  });

  root = Option.String({ required: true });
  target = Option.String("--target", { required: true, description: "Target client: claude or codex." });
  enableMcp = Option.Array("--enable-mcp", [], { description: "Enable one optional MCP declared by the assigned closure; repeatable." });
  strict = Option.Boolean("--strict", false, { description: "Fail when selected hook or instruction consent is missing." });
  dryRun = Option.Boolean("--dry-run", false, { description: "Return the deterministic no-write plan." });
  json = Option.Boolean("--json", false, { description: "Emit one machine-readable JSON document." });

  async execute(): Promise<number> {
    try {
      if (this.target !== "claude" && this.target !== "codex") {
        throw new DrwnError("LAUNCH_TARGET_UNSUPPORTED", `Unsupported Worker launch target: ${this.target}`);
      }
      if (!this.context.projectConfigPath) {
        throw new DrwnError("PROJECT_NOT_INITIALIZED", "Run Worker launch-context prepare inside an initialized project");
      }
      const projectRoot = resolveProjectRootFromConfigPath(this.context.projectConfigPath);
      const options = {
        projectRoot,
        assignedRoot: this.root,
        target: this.target,
        enabledOptionalMcp: this.enableMcp,
        strict: this.strict,
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
      } as const;
      if (this.dryRun) {
        const result = await planProjectWorkerLaunchContext(options);
        if (this.json) this.context.stdout.write(renderJson(result.plan));
        else this.context.stdout.write(`Planned ${result.plan.target} context ${result.plan.plannedContextId} for ${result.plan.assignedRoot.name}\n`);
        return 0;
      }
      const result = await prepareProjectWorkerLaunchContext(options);
      const response = parseWorkerLaunchPrepareResult({
        schema: "drwn.worker-launch-prepare-result",
        schemaVersion: 1,
        reused: result.reused,
        context: result.context,
      });
      if (this.json) this.context.stdout.write(renderJson(response));
      else this.context.stdout.write(`${result.reused ? "Reused" : "Prepared"} ${result.context.target} context ${result.context.contextId} for ${result.context.assignedRoot.name}\n`);
      return 0;
    } catch (error) {
      const normalized = error instanceof DrwnError
        ? error
        : new DrwnError("LAUNCH_PREPARE_FAILED", "Worker launch-context preparation failed");
      if (this.json) this.context.stdout.write(renderJson(normalized.toJSON()));
      else this.context.stderr.write(`${normalized.code}: ${normalized.message}\n`);
      return 1;
    }
  }
}
