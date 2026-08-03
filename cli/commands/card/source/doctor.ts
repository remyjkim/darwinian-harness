// ABOUTME: Implements `drwn card source doctor` for editable source diagnostics.
// ABOUTME: Reports source issues without mutating files or failing for findings.

import { Option } from "clipanion";
import { doctorCardSource, type CardSourceDoctorReport } from "../../../core/card-source";
import { checkCardSourceUpstream } from "../../../core/card-source-sync";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

function renderSourceDoctorReport(report: CardSourceDoctorReport, upstreamWarnings: string[] = []) {
  const lines: string[] = [];
  if (upstreamWarnings.length > 0) {
    lines.push("Upstream warnings:");
    for (const warning of upstreamWarnings) {
      lines.push(`- ${warning}`);
    }
  }
  if (report.ok && upstreamWarnings.length === 0) {
    return "No issues found.\n";
  }
  if (!report.ok) {
    lines.push(`Issues:\n${report.issues.map((issue) => `- ${issue.code}: ${issue.message}`).join("\n")}`);
  } else if (lines.length === 0) {
    return "No issues found.\n";
  }
  return `${lines.join("\n")}\n`;
}

export class CardSourceDoctorCommand extends BaseCommand {
  static override paths = [["card", "source", "doctor"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Report editable card source issues without mutating anything.",
    details: `
      Checks one explicit or uniquely catalog-resolved source for manifest,
      bundled skill, package.json, and MCP server file issues. Reportable issues
      are returned in output; the command exits nonzero only for fatal command
      errors such as an unknown named source.
    `,
    examples: [
      ["Doctor one source", "drwn card source doctor ./cards/backend"],
      ["Doctor one source as JSON", "drwn card source doctor @your-handle/backend --json"],
    ],
  });

  name = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const source = await resolveCommandCardSource(this.context, { input: this.name });
    const report = await doctorCardSource(source.sourceDir);
    const upstreamWarnings: string[] = [];
    if (this.name) {
      try {
        const upstream = await checkCardSourceUpstream(this.context.agentsDir, source.sourceDir);
        for (const skill of upstream.stale) {
          upstreamWarnings.push(`upstream stale: skill ${skill} differs from upstream`);
        }
        for (const skill of upstream.moved) {
          upstreamWarnings.push(`upstream moved: skill ${skill} has a newer upstream commit`);
        }
      } catch {
        // Named-card doctor already surfaces fatal source errors.
      }
    }
    this.context.stdout.write(
      this.json ? renderJson({ ...report, upstreamWarnings }) : renderSourceDoctorReport(report, upstreamWarnings),
    );
    return 0;
  }
}
