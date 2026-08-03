// ABOUTME: Implements the `drwn doctor` command for report-only diagnostics over the current machine state.
// ABOUTME: Surfaces broken links, stale state, MCP drift, and missing generated files without mutating anything.

import { Option } from "clipanion";
import { buildDoctorReportWithProject, buildProjectStatusV1 } from "../core/diagnostics";
import { DrwnError } from "../core/errors";
import { renderDoctorReport, renderJson } from "../core/output";
import { BaseCommand } from "./base";

export class DoctorCommand extends BaseCommand {
  static override paths = [["doctor"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Report drift, stale state, and broken symlinks without mutating anything.",
    details: `
      Inspects local harness state for broken symlinks, stale generated files,
      MCP drift, machine capability issues, and project config issues. This command is
      read-only and never mutates files.

      Reportable issues are rendered in the output; use --json if automation
      needs to inspect issue counts or exact paths. For extension-specific
      diagnostics, see drwn extensions doctor.
    `,
    examples: [
      ["Run a health check", "drwn doctor"],
      ["Inspect structured output", "drwn doctor --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      return await this.executeReport();
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

  private async executeReport() {
    const report = await buildDoctorReportWithProject(
      this.context.repoRoot,
      this.context.agentsDir,
      this.context.homeDir,
      this.context.projectConfigPath,
    );
    const projectStatus = await buildProjectStatusV1({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      projectConfigPath: this.context.projectConfigPath,
    });
    const unhealthy =
      report.ambientMcpCollisions.some(
        (collision) => collision.disposition === "fatal",
      ) ||
      Boolean(
        projectStatus?.instructionDelivery.issues.some(
          (issue) => issue.severity === "error",
        ),
      );

    if (this.json) {
      this.context.stdout.write(renderJson({ ...report, ...(projectStatus ?? {}) }));
      return unhealthy ? 1 : 0;
    }

    this.context.stdout.write(renderDoctorReport(report));
    return unhealthy ? 1 : 0;
  }
}
