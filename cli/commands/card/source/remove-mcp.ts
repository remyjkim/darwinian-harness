// ABOUTME: Implements `drwn card source remove-mcp` for editable card sources.
// ABOUTME: Removes MCP source files and card.json.servers entries semantically.

import { Option } from "clipanion";
import { removeCardSourceMcp } from "../../../core/card-source";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { resolveCommandCardSource } from "../source-input";

export class CardSourceRemoveMcpCommand extends BaseCommand {
  static override paths = [["card", "source", "remove-mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Remove an MCP server definition from an editable card source.",
    details: `
      Removes card.json.servers.<id> and deletes mcp-servers/<id>.json by
      default. Use --keep-files to remove only the manifest entry while leaving
      the source file in place for manual follow-up.
    `,
    examples: [
      ["Remove an MCP server", "drwn card source remove-mcp @your-handle/backend context7"],
      ["Keep the source file", "drwn card source remove-mcp @your-handle/backend context7 --keep-files"],
    ],
  });

  cardName = Option.String({ required: true });
  serverId = Option.String({ required: true });

  keepFiles = Option.Boolean("--keep-files", false, {
    description: "Keep mcp-servers/<id>.json and remove only the manifest entry.",
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
      result = await removeCardSourceMcp({
        sourceDir: source.sourceDir,
        serverId: this.serverId,
        keepFiles: this.keepFiles,
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
    this.context.stdout.write(`${this.dryRun ? "Would remove" : "Removed"} MCP ${this.serverId} from ${this.cardName}\n`);
    return 0;
  }
}
