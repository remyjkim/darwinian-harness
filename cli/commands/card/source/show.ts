// ABOUTME: Implements `drwn card source show` for one editable card source.
// ABOUTME: Surfaces manifest, bundled skills, MCP files, and local source issues.

import { Option } from "clipanion";
import { readCardSourceState } from "../../../core/card-source";
import { renderJson, renderTable } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceShowCommand extends BaseCommand {
  static override paths = [["card", "source", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show an editable card source.",
    details: `
      Reads a named local source under ~/.agents/drwn/sources and prints its
      manifest fields, bundled skills, MCP files, and any source-level issues.
      This inspects editable source state, not published immutable versions.
    `,
    examples: [
      ["Show a source", "drwn card source show @your-handle/backend"],
      ["Show a source as JSON", "drwn card source show @your-handle/backend --json"],
    ],
  });

  name = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const source = await resolveCommandCardSource(this.context, { input: this.name });
    const state = await readCardSourceState(source.sourceDir);
    if (this.json) {
      this.context.stdout.write(renderJson(state));
      return state.manifest ? 0 : 1;
    }
    this.context.stdout.write(
      renderTable(
        ["field", "value"],
        [
          ["name", state.name],
          ["version", state.manifest?.version ?? "unknown"],
          ["path", state.sourceDir],
          ["status", state.ok ? "ok" : "issues"],
          ["manifestSkills", state.manifestSkills.join(", ") || "none"],
          ["bundledSkills", state.bundledSkills.map((skill) => skill.name).join(", ") || "none"],
          ["mcpServers", state.mcpServers.map((server) => server.id).join(", ") || "none"],
          ["issues", state.issues.map((issue) => issue.code).join(", ") || "none"],
        ],
      ),
    );
    return state.manifest ? 0 : 1;
  }
}
