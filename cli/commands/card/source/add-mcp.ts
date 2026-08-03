// ABOUTME: Implements `drwn card source add-mcp` for editable card sources.
// ABOUTME: Mirrors MCP definitions into source files and card.json.servers.

import { Option } from "clipanion";
import { addCardSourceMcp } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceAddMcpCommand extends BaseCommand {
  static override paths = [["card", "source", "add-mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Add an MCP server definition to an editable card source.",
    details: `
      Resolves an MCP server from an explicit --from JSON file or the reusable
      inventory, writes mcp-servers/<id>.json, and mirrors the definition into
      card.json.servers so current consumers can use the published card.
    `,
    examples: [
      ["Add a reusable MCP server", "drwn card source add-mcp @your-handle/backend context7"],
      ["Preview an MCP source mutation", "drwn card source add-mcp @your-handle/backend context7 --dry-run --json"],
    ],
  });

  cardName = Option.String({ required: true });
  serverId = Option.String({ required: true });

  from = Option.String("--from", {
    description: "Read this MCP server definition JSON file instead of resolving by id.",
  });

  replace = Option.Boolean("--replace", false, {
    description: "Replace an existing MCP definition in the source.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview source changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    let result;
    try {
      const source = await resolveCommandCardSource(this.context, { input: this.cardName });
      result = await addCardSourceMcp({
        agentsDir: this.context.agentsDir,
        repoRoot: this.context.repoRoot,
        sourceDir: source.sourceDir,
        serverId: this.serverId,
        from: this.from,
        replace: this.replace,
        dryRun: this.dryRun,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }
    this.context.stdout.write(`${this.dryRun ? "Would add" : "Added"} MCP ${this.serverId} to ${this.cardName}\n`);
    return 0;
  }
}
