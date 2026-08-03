// ABOUTME: Implements the `drwn status` command for a concise system overview of repo and derived state.
// ABOUTME: Provides both human-readable and JSON output for operators and automation.

import { Option } from "clipanion";
import { formatAmbientCollision } from "../core/ambient-policy";
import { answerWhy, buildDiagnosticsSections, buildProjectStatusV1, buildStatusReport, explainStatus } from "../core/diagnostics";
import { buildEffectiveState } from "../core/effective-state";
import { DrwnError } from "../core/errors";
import { resolveProjectRootFromConfigPath } from "../core/project";
import { renderJson, renderTable } from "../core/output";
import { BaseCommand } from "./base";

export class StatusCommand extends BaseCommand {
  static override paths = [["status"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Show the current repo, aggregation, target, and count status.",
    details: `
      Prints the resolved repo root, agents directory, home directory, enabled
      targets, and counts for skills and MCP servers. When run inside a project
      with .agents/drwn/config.json, includes project overlay counts and active
      extension overrides.

      This command is read-only.
    `,
    examples: [
      ["Quick status snapshot", "drwn status"],
      ["JSON for tooling", "drwn status --json"],
      ["Inspect machine state from inside a project", "drwn status --machine --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  machine = Option.Boolean("--machine", false, {
    description: "Ignore project config and report machine state.",
  });

  explain = Option.Boolean("--explain", false, {
    description: "Show provenance for cards, skills, MCP servers, targets, and write records.",
  });

  why = Option.String("--why", {
    description: "Explain why a skill, server, extension, target, or card is active.",
  });

  async execute() {
    try {
      return await this.executeStatus();
    } catch (error) {
      if (!(error instanceof DrwnError)) throw error;
      if (this.json) {
        this.context.stdout.write(renderJson(error.toJSON()));
      } else {
        this.context.stderr.write(`${error.code}: ${error.message}\n`);
      }
      return 1;
    }
  }

  private async executeStatus() {
    const projectConfigPath = this.machine ? undefined : this.context.projectConfigPath;
    if (this.why) {
      const answer = await answerWhy(
        this.context.repoRoot,
        this.context.agentsDir,
        this.context.homeDir,
        projectConfigPath,
        this.why,
      );
      if (!answer.ok) {
        this.context.stderr.write(answer.message);
        return 1;
      }
      this.context.stdout.write(answer.message);
      return 0;
    }

    if (this.explain) {
      this.context.stdout.write(
        await explainStatus(
          this.context.repoRoot,
          this.context.agentsDir,
          this.context.homeDir,
          projectConfigPath,
        ),
      );
      return 0;
    }

    const status = await buildStatusReport(
      this.context.repoRoot,
      this.context.agentsDir,
      this.context.homeDir,
      projectConfigPath,
    );

    if (this.json) {
      const projectStatus = await buildProjectStatusV1({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        projectConfigPath,
      });
      if (!projectStatus) {
        this.context.stdout.write(renderJson(status));
        return 0;
      }
      const sections = await buildDiagnosticsSections(
        this.context.repoRoot,
        this.context.agentsDir,
        this.context.homeDir,
        projectConfigPath,
      );
      let cardModes: Record<string, { mode: string; reason: string; lane: string; sourcePath?: string }> | undefined;
      if (status.project) {
        const projectRoot = resolveProjectRootFromConfigPath(status.project.configPath);
        const state = await buildEffectiveState({
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          homeDir: this.context.homeDir,
          cwd: projectRoot,
        });
        cardModes = {};
        for (const card of state.lockedCards) {
          const mode = state.cardModes[card.name];
          if (!mode) {
            continue;
          }
          cardModes[card.name] = {
            mode: mode.mode,
            reason: mode.reason,
            lane: state.cardLanes[card.name] ?? "committed",
            ...(mode.sourcePath ? { sourcePath: mode.sourcePath } : {}),
          };
        }
      }
      this.context.stdout.write(renderJson({
        ...status,
        sections,
        ...(cardModes ? { cardModes } : {}),
        ...projectStatus,
      }));
      return 0;
    }

    let output = renderTable(
      ["field", "value"],
      [
        ["repoRoot", status.repoRoot],
        ["agentsDir", status.agentsDir],
        ["homeDir", status.homeDir],
        ["machineSchema", `${status.config.schema}@${status.config.schemaVersion}`],
        ["machineProfile", status.profile?.id ?? "none"],
        ["enabledTargets", status.enabledTargets.join(",")],
        ["resolvedSkillCount", String(status.capabilities.counts.resolvedSkills)],
        ["missingSkillCount", String(status.capabilities.counts.missingSkills)],
        ["resolvedMcpServerCount", String(status.capabilities.counts.resolvedMcpServers)],
        ["missingMcpServerCount", String(status.capabilities.counts.missingMcpServers)],
        ["projectionHealthy", String(status.projection.healthy)],
        ["projectionCurrent", String(status.projection.current)],
      ],
    );
    if (status.project) {
      output += `\nProject: ${status.project.configPath}\n\n`;
      output += `  Server overrides:  ${status.project.serverOverrideCount} (${status.project.serverDisabledCount} disabled, ${status.project.serverAddedCount} added)\n`;
      output += `  Skill overrides:   ${status.project.skillIncludeCount} included, ${status.project.skillExcludeCount} excluded\n`;
      output += `  Extension overrides: ${status.project.extensionOverrides.join(", ") || "none"}\n`;
      output += `  Target overrides:  ${status.project.targetOverrides.join(", ") || "none"}\n`;
      const projectRoot = resolveProjectRootFromConfigPath(status.project.configPath);
      const state = await buildEffectiveState({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: projectRoot,
      });
      output += `  Active Worker:      ${state.workerSelection?.activeWorker ?? "none"}\n`;
      const projectStatus = await buildProjectStatusV1({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        projectConfigPath: status.project.configPath,
      });
      if (projectStatus) {
        output += `  Instruction delivery: ${projectStatus.instructionDelivery.state} (Claude adapter: ${projectStatus.instructionDelivery.adapter})\n`;
      }
      if (state.ambientCollisions.length > 0) {
        output += "\nAmbient MCP collisions:\n";
        output += `${state.ambientCollisions.map((collision) => `  - ${formatAmbientCollision(collision)}`).join("\n")}\n`;
      }
      if (state.lockedCards.length > 0) {
        output += "\nCard modes:\n";
        for (const card of state.lockedCards) {
          const mode = state.cardModes[card.name];
          const lane = state.cardLanes[card.name] ?? "committed";
          const source = mode?.sourcePath ? ` source=${mode.sourcePath}` : "";
          output += `  - ${card.name}: ${mode?.mode ?? "unknown"} (${mode?.reason ?? "unknown"}) lane=${lane}${source}\n`;
        }
      }
    }
    this.context.stdout.write(output);
    return 0;
  }
}
