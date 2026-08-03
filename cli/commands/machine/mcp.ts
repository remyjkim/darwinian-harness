// ABOUTME: Implements standalone MCP record inventory lifecycle commands.
// ABOUTME: Rejects retired per-server activation in favor of machine Worker Blueprints.

import { Option, UsageError } from "clipanion";
import { readFile } from "node:fs/promises";
import {
  assertInventoryUnreferenced,
  scanInventoryReferenceReport,
  withLockedInventoryReferenceReport,
} from "../../core/inventory-references";
import { findStandaloneMcpRecord, listStandaloneMcpRecords } from "../../core/inventory";
import { listLibraryMcpServers } from "../../core/library";
import {
  createMcpLibraryRecord,
  removeMcpLibraryRecord,
  updateMcpLibraryRecord,
  validateMcpLibraryServer,
} from "../../core/mcp-library";
import { sanitizeMcpServerSecrets } from "../../core/mcp-secret-policy";
import { renderJson, renderTable } from "../../core/output";
import { loadRegistry } from "../../core/registry";
import type { RegistryServer } from "../../core/types";
import { BaseCommand } from "../base";

async function readServerFile(path: string, id: string): Promise<RegistryServer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new UsageError(`Cannot read MCP server definition ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    validateMcpLibraryServer(id, parsed);
    return sanitizeMcpServerSecrets(id, parsed);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

async function reservedMcpIds(repoRoot: string) {
  return Object.keys((await loadRegistry(repoRoot)).servers).sort((a, b) => a.localeCompare(b));
}

abstract class McpJsonCommand extends BaseCommand {
  json = Option.Boolean("--json", false);

  protected output(payload: unknown, human: string) {
    this.context.stdout.write(this.json ? renderJson(payload) : `${human}\n`);
    return 0;
  }
}

export class MachineMcpListCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "list"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "List bundled and standalone MCP definitions.",
    details: "Lists immutable registry inputs and drwn-managed standalone records without resolving environment references or credential values.",
    examples: [["List as JSON", "drwn machine mcp list --json"]],
  });

  async execute() {
    const records = await listStandaloneMcpRecords(this.context.agentsDir);
    const integrity = new Map(records.map((record) => [record.id, record.integrity]));
    const entries = (await listLibraryMcpServers(this.context.repoRoot, this.context.agentsDir)).map((entry) => ({
      kind: "mcp" as const,
      id: entry.id,
      owner: entry.source === "library" ? "standalone" as const : "registry" as const,
      transport: entry.server.transport,
      integrity: integrity.get(entry.id),
      activation: "inventory-only" as const,
    }));
    if (this.json) return this.output(entries, "");
    if (entries.length === 0) return this.output(entries, "No machine MCP definitions available.");
    this.context.stdout.write(renderTable(
      ["id", "owner", "transport", "activation"],
      entries.map((entry) => [entry.id, entry.owner, entry.transport, entry.activation]),
    ));
    return 0;
  }
}

export class MachineMcpShowCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "show"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Show one bundled or standalone MCP definition.",
    details: "Shows <server-id> ownership and its stored definition without resolving secret references or credential-store values.",
    examples: [["Show a server", "drwn machine mcp show notion --json"]],
  });
  serverId = Option.String({ required: true });

  async execute() {
    const entry = (await listLibraryMcpServers(this.context.repoRoot, this.context.agentsDir))
      .find((candidate) => candidate.id === this.serverId);
    if (!entry) throw new UsageError(`Machine MCP server is not available: ${this.serverId}`);
    const standalone = entry.source === "library" ? await findStandaloneMcpRecord(this.context.agentsDir, this.serverId) : null;
    const payload = {
      kind: "mcp" as const,
      id: entry.id,
      owner: entry.source === "library" ? "standalone" as const : "registry" as const,
      server: entry.server,
      integrity: standalone?.integrity,
    };
    return this.output(payload, `${payload.id} (${payload.owner}, ${payload.server.transport})`);
  }
}

export class MachineMcpReferencesCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "references"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Report known references to one standalone MCP record.",
    details: "Reports references to <server-id>. Repeated --project roots extend the declared known scan scope.",
    examples: [["Inspect references", "drwn machine mcp references notion --project ./consumer --json"]],
  });
  serverId = Option.String({ required: true });
  projects = Option.Array("--project", []);

  async execute() {
    const record = await findStandaloneMcpRecord(this.context.agentsDir, this.serverId);
    if (!record) throw new UsageError(`Standalone MCP server is not installed: ${this.serverId}`);
    const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, mcpIds: [this.serverId], projectRoots: this.projects });
    return this.output({ resource: { kind: "mcp", id: this.serverId }, ...report }, `${report.references.length} known reference(s) across ${report.scope.projectRoots.length} project root(s).`);
  }
}

export class MachineMcpAddCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "add"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Add an inactive standalone MCP record.",
    details: "Validates <file> as --as <server-id>, stores secret references only, and never enables the record automatically. --dry-run creates no managed state.",
    examples: [["Add a server", "drwn machine mcp add ./notion.json --as notion --dry-run"]],
  });
  file = Option.String({ required: true });
  serverId = Option.String("--as", { required: true });
  dryRun = Option.Boolean("--dry-run", false);

  async execute() {
    const server = await readServerFile(this.file, this.serverId);
    const reservedIds = await reservedMcpIds(this.context.repoRoot);
    if (reservedIds.includes(this.serverId)) throw new UsageError(`MCP server ${this.serverId} is owned by the immutable bundled registry.`);
    if (await findStandaloneMcpRecord(this.context.agentsDir, this.serverId)) {
      throw new UsageError(`MCP server ${this.serverId} already exists in standalone inventory.`);
    }
    if (this.dryRun) {
      return this.output({ action: "would-add", id: this.serverId, server, activation: "inventory-only" }, `Would add ${this.serverId} as inventory only.`);
    }
    const added = await createMcpLibraryRecord(this.context.agentsDir, this.serverId, server, { reservedIds });
    return this.output({ ...added, activation: "inventory-only" }, `Added ${this.serverId} as inventory only.`);
  }
}

abstract class McpReferenceMutationCommand extends McpJsonCommand {
  serverId = Option.String({ required: true });
  projects = Option.Array("--project", []);
  dryRun = Option.Boolean("--dry-run", false);
}

export class MachineMcpUpdateCommand extends McpReferenceMutationCommand {
  static override paths = [["machine", "mcp", "update"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Update one standalone MCP record atomically.",
    details: "Updates <server-id> from --from <file>. Repeated --project roots extend reference disclosure; same-ID references do not block behavior updates.",
    examples: [["Update a server", "drwn machine mcp update notion --from ./notion.json --project ./consumer"]],
  });
  file = Option.String("--from", { required: true });

  async execute() {
    if (!await findStandaloneMcpRecord(this.context.agentsDir, this.serverId)) {
      throw new UsageError(`Standalone MCP server is not installed: ${this.serverId}`);
    }
    const server = await readServerFile(this.file, this.serverId);
    const reservedIds = await reservedMcpIds(this.context.repoRoot);
    if (this.dryRun) {
      const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, mcpIds: [this.serverId], projectRoots: this.projects });
      return this.output({ action: "would-update", id: this.serverId, ...report }, `Would update ${this.serverId}; ${report.references.length} known reference(s).`);
    }
    return withLockedInventoryReferenceReport({
      agentsDir: this.context.agentsDir,
      mcpIds: [this.serverId],
      projectRoots: this.projects,
    }, async (report) => {
      const updated = await updateMcpLibraryRecord(this.context.agentsDir, this.serverId, server, { reservedIds });
      return this.output({ ...updated, ...report }, `Updated ${this.serverId}; ${report.references.length} known reference(s).`);
    });
  }
}

export class MachineMcpRemoveCommand extends McpReferenceMutationCommand {
  static override paths = [["machine", "mcp", "remove"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Remove one unreferenced standalone MCP record.",
    details: "Removes <server-id> only after known project references are empty. Repeated --project roots extend the scan; there is no force bypass.",
    examples: [["Preview removal", "drwn machine mcp remove notion --project ./consumer --dry-run"]],
  });

  async execute() {
    if (!await findStandaloneMcpRecord(this.context.agentsDir, this.serverId)) {
      throw new UsageError(`Standalone MCP server is not installed: ${this.serverId}`);
    }
    if (this.dryRun) {
      const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, mcpIds: [this.serverId], projectRoots: this.projects });
      assertInventoryUnreferenced(this.serverId, [this.serverId], report.references);
      return this.output({ action: "would-remove", id: this.serverId, ...report }, `Would remove ${this.serverId}.`);
    }
    return withLockedInventoryReferenceReport({
      agentsDir: this.context.agentsDir,
      mcpIds: [this.serverId],
      projectRoots: this.projects,
    }, async (report) => {
      assertInventoryUnreferenced(this.serverId, [this.serverId], report.references);
      const removed = await removeMcpLibraryRecord(this.context.agentsDir, this.serverId);
      return this.output({ action: "removed", ...removed, ...report }, `Removed ${this.serverId}.`);
    });
  }
}

abstract class MachineMcpSelectionCommand extends McpJsonCommand {
  serverId = Option.String({ required: true });
  dryRun = Option.Boolean("--dry-run", false);

  protected setEnabled(_enabled: boolean): never {
    throw new UsageError(
      "Direct machine MCP activation was removed. Select a Worker Blueprint with `drwn apply --root <blueprint-ref>` or switch an installed Blueprint with `drwn use --root <blueprint-ref>`.",
    );
  }
}

export class MachineMcpEnableCommand extends MachineMcpSelectionCommand {
  static override paths = [["machine", "mcp", "enable"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Explain the replacement for retired direct machine MCP activation.",
    details: "Always exits nonzero. Machine MCP definitions come only from the active Worker Blueprint closure.",
    examples: [["Select a Worker Blueprint instead", "drwn apply --root <blueprint-ref>"]],
  });
  execute() { return this.setEnabled(true); }
}

export class MachineMcpDisableCommand extends MachineMcpSelectionCommand {
  static override paths = [["machine", "mcp", "disable"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Explain the replacement for retired direct machine MCP deactivation.",
    details: "Always exits nonzero. Change or clear the selected machine Worker Blueprint instead.",
    examples: [["Switch the active Worker Blueprint instead", "drwn use --root <blueprint-ref>"]],
  });
  execute() { return this.setEnabled(false); }
}
