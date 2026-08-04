// ABOUTME: Provides shared path resolution helpers for the drwn harness CLI and sync wrapper.
// ABOUTME: Normalizes repo, home, tool, and skill-scope paths without command-layer dependencies.

import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveHomeDir } from "./home";
import type { NormalizedSyncOptions, SyncOptions, TargetName } from "./types";

export type ToolScope =
  | { kind: "project"; projectRoot: string }
  | { kind: "machine"; homeDir: string };

export function inferRepoRootFromModulePath(modulePath: string) {
  return dirname(realpathSync(modulePath));
}

export function resolveAgentsDir(homeDir: string) {
  return join(homeDir, ".agents");
}

export function resolveUserDrwnDir(agentsDir: string) {
  return join(agentsDir, "drwn");
}

export function resolveUserConfigPath(agentsDir: string) {
  return join(resolveUserDrwnDir(agentsDir), "config.json");
}

export function resolveCredentialsPath(agentsDir: string) {
  return join(resolveUserDrwnDir(agentsDir), "credentials.json");
}

export function resolveOrgWorkerMaterializationRecordPath(
  projectRoot: string,
) {
  return join(
    projectRoot,
    ".agents",
    "drwn",
    "org-worker-materialization.json",
  );
}

export function resolveOrgWorkerMaterializationJournalPath(
  projectRoot: string,
) {
  return join(
    projectRoot,
    ".agents",
    "drwn",
    ".org-worker-materialization-journal.json",
  );
}

export function resolveLibraryDir(agentsDir: string) {
  return join(agentsDir, "library");
}

export function resolvePackagedRegistryDir(repoRoot: string) {
  return join(repoRoot, "registry");
}

export function resolvePackagedConfigPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "config.json");
}

export function resolvePackagedMcpRegistryPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "mcp-servers.json");
}

export function resolveMachineWorkersRegistryPath(repoRoot: string) {
  return join(resolvePackagedRegistryDir(repoRoot), "machine-workers.json");
}

export function expandHomePath(pathValue: string, homeDir: string) {
  if (pathValue === "~") {
    return homeDir;
  }
  if (pathValue.startsWith("~/")) {
    return join(homeDir, pathValue.slice(2));
  }
  return pathValue;
}

// Dedicated OpenCode-visible skills projection dir, declared project-relative in
// opencode.json skills.paths. Must stay outside OpenCode's built-in scan paths so the
// configured entry wins cross-scope skill dedup.
export const OPENCODE_PROJECT_SKILLS_DIR = ".agents/drwn/opencode-skills";

export function resolveToolPaths(scope: string | ToolScope) {
  const root = typeof scope === "string"
    ? scope
    : scope.kind === "project"
      ? scope.projectRoot
      : scope.homeDir;
  return {
    claudeSkills: join(root, ".claude", "skills"),
    claudeMcp: join(root, ".mcp.json"),
    codexSkills: join(root, ".codex", "skills"),
    opencodeSkills: join(root, OPENCODE_PROJECT_SKILLS_DIR),
    claudeSettings: join(root, ".claude", "settings.json"),
    codexConfig: join(root, ".codex", "config.toml"),
    cursorMcp: join(root, ".cursor", "mcp.json"),
    opencodeConfig: join(root, "opencode.json"),
  };
}

export function resolveGlobalCodexConfig(homeDir: string) {
  return join(homeDir, ".codex", "config.toml");
}

export function resolveSkillScopeDirs(repoRoot: string) {
  return {
    shared: join(repoRoot, "skills", "shared"),
    claudeOnly: join(repoRoot, "skills", "claude-only"),
    codexOnly: join(repoRoot, "skills", "codex-only"),
    experimental: join(repoRoot, "skills", "experimental"),
  };
}

export function resolveSkillPackagesRoot(agentsDir: string) {
  return join(agentsDir, "packages", "skills");
}

export function resolveSkillPackageRoot(agentsDir: string, packageName: string) {
  return join(resolveSkillPackagesRoot(agentsDir), packageName);
}

export function resolveSkillPackageVersionRoot(agentsDir: string, packageName: string, version: string) {
  return join(resolveSkillPackageRoot(agentsDir, packageName), version);
}

export function resolveSkillPackageCurrentLink(agentsDir: string, packageName: string) {
  return join(resolveSkillPackageRoot(agentsDir, packageName), "current");
}

export function normalizeSyncPathOptions(
  options: SyncOptions = {},
  modulePath?: string,
): NormalizedSyncOptions {
  const homeDir = options.homeDir ?? resolveHomeDir();

  return {
    repoRoot: options.repoRoot ?? inferRepoRootFromModulePath(modulePath ?? import.meta.path),
    agentsDir: options.agentsDir ?? resolveAgentsDir(homeDir),
    homeDir,
    cwd: options.cwd ?? process.cwd(),
    dryRun: options.dryRun ?? false,
    mcpOnly: options.mcpOnly ?? false,
    skillsOnly: options.skillsOnly ?? false,
    target: options.target,
    force: options.force ?? false,
    strictHooks: options.strictHooks ?? false,
    strict: options.strict ?? false,
    applyClaudeAdapter: options.applyClaudeAdapter ?? false,
    forceMachineScope: options.forceMachineScope ?? false,
    organizationInstructionConsent:
      options.organizationInstructionConsent,
  };
}
