// ABOUTME: Preserves the legacy sync-mcp CLI surface as a thin compatibility wrapper.
// ABOUTME: Re-exports the public sync helpers from the extracted core modules during the CLI migration.

import {
  buildActiveServers,
  detectCodexLayerConflicts,
  mergeClaudeSettingsText,
  mergeCodexTomlText,
  renderCursorConfig,
} from "./cli/core/mcp";
import { syncRepository as syncRepositoryCore } from "./cli/core/sync";
import { inferRepoRootFromModulePath } from "./cli/core/paths";
import type { SyncOptions, TargetName } from "./cli/core/types";

export type {
  CanonicalConfig,
  CanonicalRegistry,
  RegistryServer,
  SyncOptions,
  SyncResult,
  TargetConfig,
  TargetName,
  Transport,
} from "./cli/core/types";

export {
  buildActiveServers,
  detectCodexLayerConflicts,
  mergeClaudeSettingsText,
  mergeCodexTomlText,
  renderCursorConfig,
};

export async function syncRepository(options: SyncOptions = {}) {
  const repoRoot = options.repoRoot ?? process.env.AGENTS_REPO_ROOT ?? inferRepoRootFromModulePath(import.meta.path);
  return await syncRepositoryCore({
    ...options,
    repoRoot,
    cwd: options.cwd ?? repoRoot,
  });
}

function parseCliArgs(argv: string[]) {
  const options: SyncOptions = {};

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--mcp-only") {
      options.mcpOnly = true;
      continue;
    }
    if (arg === "--skills-only") {
      options.skillsOnly = true;
      continue;
    }
    if (arg.startsWith("--target=")) {
      const value = arg.split("=")[1] as TargetName | undefined;
      if (value === "claude" || value === "codex" || value === "cursor") {
        options.target = value;
        continue;
      }
      throw new Error(`Unsupported target: ${value ?? ""}`);
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  if (options.mcpOnly && options.skillsOnly) {
    throw new Error("Use either --mcp-only or --skills-only, not both.");
  }

  return options;
}

async function main() {
  const result = await syncRepository(parseCliArgs(process.argv.slice(2)));

  if (result.changes.length === 0) {
    console.log("No changes.");
  } else {
    console.log("Changes:");
    for (const change of result.changes) {
      console.log(`- ${change}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

if (import.meta.main) {
  await main();
}
