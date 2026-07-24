// ABOUTME: Resolves cards-era store paths under ~/.agents/drwn.
// ABOUTME: Keeps store layout decisions separate from legacy path helpers.

import { join } from "node:path";
import type { Runtime } from "./hook-policy/types";
import { DrwnError } from "./errors";

export function resolveStoreRoot(agentsDir: string) {
  return join(agentsDir, "drwn");
}

/**
 * Refuses any store mutation when DRWN_STORE_READONLY is set. Every helper
 * that touches the local store calls this at entry. Centralized here so it
 * can be enforced uniformly across card-store, card-catalog, store-migrate,
 * and install paths.
 */
export function assertStoreWritable() {
  if (process.env.DRWN_STORE_READONLY === "1" || process.env.DRWN_STORE_READONLY === "true") {
    throw new DrwnError("STORE_READONLY", "Managed inventory is read-only; mutation refused");
  }
}

export function assertStoreWritableForSeed(options: { allowReadonlySeed?: boolean } = {}) {
  if (options.allowReadonlySeed) {
    return;
  }
  assertStoreWritable();
}

export function resolveStoreMetadataPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "store.json");
}

export function resolveMachineConfigPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "machine.json");
}

export function resolveInventoryLockPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), ".inventory-transaction.lock");
}

export const MACHINE_LOCK_FILENAME = ".machine-transaction.lock";

export function resolveMachineLockPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), MACHINE_LOCK_FILENAME);
}

export function resolveCardsRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "cards");
}

export function isSafePathPart(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes("..") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !value.startsWith(".")
  );
}

export function assertSafePathPart(value: string, label: string) {
  if (!isSafePathPart(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export function splitCardName(name: string) {
  if (name.startsWith("@")) {
    const [scope, cardName, ...rest] = name.split("/");
    if (!scope || !cardName || rest.length > 0) {
      throw new Error(`Invalid card name: ${name}`);
    }
    assertSafePathPart(scope, "card scope");
    assertSafePathPart(cardName, "card name");
    return [scope, cardName];
  }
  assertSafePathPart(name, "card name");
  return [name];
}

export function resolveCardPackageDir(agentsDir: string, name: string) {
  return join(resolveCardsRoot(agentsDir), ...splitCardName(name));
}

export function resolveCardVersionDir(agentsDir: string, name: string, version: string) {
  assertSafePathPart(version, "card version");
  return join(resolveCardPackageDir(agentsDir, name), version);
}

export function resolveCardBareRepoPath(agentsDir: string, name: string) {
  const parts = splitCardName(name);
  if (parts.length === 1) {
    return join(resolveCardsRoot(agentsDir), `${parts[0]}.git`);
  }
  return join(resolveCardsRoot(agentsDir), parts[0]!, `${parts[1]}.git`);
}

export function resolveExtractedPath(agentsDir: string, treeSha: string) {
  validateTreeSha(treeSha);
  return join(resolveStoreRoot(agentsDir), "extracted", treeSha);
}

export function resolveExtractedRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "extracted");
}

export function resolveCatalogsDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "catalogs");
}

export function resolveCatalogPath(agentsDir: string, url: string) {
  return join(resolveCatalogsDir(agentsDir), slugifyUrl(url));
}

export function resolveCatalogsIndexPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "catalogs.json");
}

function validateTreeSha(sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error(`invalid tree sha: ${sha}`);
  }
}

function slugifyUrl(url: string) {
  return url
    .replace(/^.*?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/[/:]/g, "_")
    .toLowerCase();
}

export function resolveSourcesRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "sources");
}

export function resolveCardSourceDir(agentsDir: string, name: string) {
  return join(resolveSourcesRoot(agentsDir), ...splitCardName(name));
}

export function resolveStoreSkillsRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "skills");
}

export const resolveStoreSkillPackagesRoot = resolveStoreSkillsRoot;

export function resolveStoreSkillPackageRoot(agentsDir: string, packageName: string) {
  return join(resolveStoreSkillsRoot(agentsDir), ...packageName.split("/").filter(Boolean));
}

export function resolveStoreSkillPackageVersionRoot(agentsDir: string, packageName: string, version: string) {
  assertSafePathPart(version, "skill package version");
  return join(resolveStoreSkillPackageRoot(agentsDir, packageName), version);
}

export function resolveStoreSkillPackageCurrentLink(agentsDir: string, packageName: string) {
  return join(resolveStoreSkillPackageRoot(agentsDir, packageName), "current");
}

export function resolveStoreMcpServersDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "mcp-servers");
}

export function resolveStoreMcpServerFile(agentsDir: string, serverId: string) {
  assertSafePathPart(serverId, "MCP server id");
  if (serverId.includes("/")) {
    throw new Error(`Invalid MCP server id: ${serverId}`);
  }
  return join(resolveStoreMcpServersDir(agentsDir), `${serverId}.json`);
}

export function resolveInventoryTombstonesRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), ".inventory-tombstones");
}

export function resolveStoreGeneratedDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "generated");
}

export function resolveGeneratedWorkersDir(generatedDir: string) {
  return join(generatedDir, "workers");
}

export function resolveGeneratedWorkerDir(generatedDir: string, name: string) {
  return join(resolveGeneratedWorkersDir(generatedDir), ...splitCardName(name));
}

export function resolveGeneratedHooksDir(generatedDir: string, runtime: Runtime) {
  if (runtime === "claude-code") {
    return join(generatedDir, "hooks", "claude");
  }
  if (runtime === "codex" || runtime === "cursor" || runtime === "opencode" || runtime === "mastra") {
    return join(generatedDir, "hooks", runtime);
  }
  throw new Error(`Invalid hook runtime: ${String(runtime)}`);
}

export function resolveGlobalWriteRecordPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "global-write-record.json");
}
