// ABOUTME: Discovers project references to standalone skill and MCP inventory.
// ABOUTME: Fails closed when registered or supplied project roots cannot be verified.

import { access, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { DrwnError } from "./errors";
import { withInventoryLock, withMachineLock } from "./inventory-lock";
import { loadProjectConfig } from "./project";
import { listRegisteredProjects } from "./project-registry";
import { withProjectStateLock } from "./project-state-transaction";
import { resolveMachineConfigPath } from "./store-paths";

export type InventoryReferenceKind = "skill" | "mcp";

export interface InventoryReference {
  kind: InventoryReferenceKind;
  id: string;
  surface: "project";
  relation: "include" | "exclude" | "mcp-toggle";
  sourcePath: string;
  projectRoot?: string;
}

export interface InventoryReferenceScanOptions {
  agentsDir: string;
  skillIds?: Iterable<string>;
  mcpIds?: Iterable<string>;
  projectRoots?: string[];
}

export interface InventoryReferenceScope {
  kind: "declared-known-scope";
  machineConfigPath: string;
  registeredProjectRoots: string[];
  explicitProjectRoots: string[];
  projectRoots: string[];
}

export interface InventoryReferenceReport {
  scope: InventoryReferenceScope;
  references: InventoryReference[];
}

function scanFailed(path: string, error: unknown): DrwnError {
  return new DrwnError(
    "INVENTORY_REFERENCE_SCAN_FAILED",
    `Cannot verify standalone inventory references at ${path}`,
    ["Repair the project config or unregister a stale project before retrying."],
    error,
  );
}

async function validateProjectRoot(root: string) {
  try {
    const stats = await lstat(root);
    if (!stats.isDirectory()) throw new Error("project root is not a directory");
    await access(root);
  } catch (error) {
    throw scanFailed(root, error);
  }
}

export async function resolveInventoryReferenceRoots(agentsDir: string, explicitRoots: string[] = []) {
  return (await resolveInventoryReferenceScope(agentsDir, explicitRoots)).projectRoots;
}

export async function resolveInventoryReferenceScope(
  agentsDir: string,
  explicitRoots: string[] = [],
): Promise<InventoryReferenceScope> {
  let registered: string[];
  try {
    registered = await listRegisteredProjects(agentsDir);
  } catch (error) {
    throw scanFailed(`${agentsDir}/drwn/projects.json`, error);
  }
  const registeredProjectRoots = [...new Set(registered.map((root) => resolve(root)))].sort((a, b) => a.localeCompare(b));
  const explicitProjectRoots = [...new Set(explicitRoots.map((root) => resolve(root)))].sort((a, b) => a.localeCompare(b));
  return {
    kind: "declared-known-scope",
    machineConfigPath: resolveMachineConfigPath(agentsDir),
    registeredProjectRoots,
    explicitProjectRoots,
    projectRoots: [...new Set([...registeredProjectRoots, ...explicitProjectRoots])].sort((a, b) => a.localeCompare(b)),
  };
}

async function scanInventoryReferenceScope(
  options: InventoryReferenceScanOptions,
  scope: InventoryReferenceScope,
): Promise<InventoryReference[]> {
  const skillIds = new Set(options.skillIds ?? []);
  const mcpIds = new Set(options.mcpIds ?? []);
  const references: InventoryReference[] = [];
  for (const projectRoot of scope.projectRoots) {
    await validateProjectRoot(projectRoot);
    const configPath = `${projectRoot}/.agents/drwn/config.json`;
    let config;
    try {
      config = await loadProjectConfig(configPath);
    } catch (error) {
      throw scanFailed(configPath, error);
    }
    for (const id of config.skills?.include ?? []) {
      if (skillIds.has(id)) references.push({ kind: "skill", id, surface: "project", relation: "include", sourcePath: configPath, projectRoot });
    }
    for (const id of config.skills?.exclude ?? []) {
      if (skillIds.has(id)) references.push({ kind: "skill", id, surface: "project", relation: "exclude", sourcePath: configPath, projectRoot });
    }
    for (const [id, override] of Object.entries(config.mcpServers ?? {})) {
      if (mcpIds.has(id) && "enabled" in override && !("transport" in override)) {
        references.push({ kind: "mcp", id, surface: "project", relation: "mcp-toggle", sourcePath: configPath, projectRoot });
      }
    }
  }
  return references.sort((a, b) =>
    `${a.kind}:${a.id}:${a.surface}:${a.projectRoot ?? ""}:${a.relation}`.localeCompare(
      `${b.kind}:${b.id}:${b.surface}:${b.projectRoot ?? ""}:${b.relation}`,
    )
  );
}

export async function scanInventoryReferenceReport(
  options: InventoryReferenceScanOptions,
): Promise<InventoryReferenceReport> {
  const scope = await resolveInventoryReferenceScope(options.agentsDir, options.projectRoots);
  return { scope, references: await scanInventoryReferenceScope(options, scope) };
}

export async function scanInventoryReferences(options: InventoryReferenceScanOptions): Promise<InventoryReference[]> {
  return (await scanInventoryReferenceReport(options)).references;
}

export async function withLockedInventoryReferenceReport<T>(
  options: InventoryReferenceScanOptions,
  operation: (report: InventoryReferenceReport) => Promise<T>,
): Promise<T> {
  return withInventoryLock(options.agentsDir, async () => {
    const scope = await resolveInventoryReferenceScope(options.agentsDir, options.projectRoots);
    return withMachineLock(options.agentsDir, async () => {
      async function lockProject(index: number): Promise<T> {
        const root = scope.projectRoots[index];
        if (!root) {
          return operation({ scope, references: await scanInventoryReferenceScope(options, scope) });
        }
        await validateProjectRoot(root);
        return withProjectStateLock(root, () => lockProject(index + 1), { createStateDir: false });
      }
      return lockProject(0);
    });
  });
}

export function assertInventoryUnreferenced(
  itemId: string,
  exportedIds: string[],
  references: InventoryReference[],
): void {
  if (references.length === 0) return;
  throw new DrwnError(
    "INVENTORY_ITEM_IN_USE",
    `Cannot remove ${itemId}; referenced inventory IDs: ${exportedIds.join(", ")}`,
    references.map((reference) =>
      `${reference.surface}${reference.projectRoot ? ` ${reference.projectRoot}` : ""}: ${reference.kind} ${reference.id} (${reference.relation})`
    ),
  );
}
