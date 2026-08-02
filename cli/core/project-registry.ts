// ABOUTME: Maintains the opt-in machine index of drwn-managed project roots.
// ABOUTME: Widens store GC roots once projects.json is present.

import { constants, existsSync } from "node:fs";
import { access, lstat, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { writeAtomically } from "./fs";
import { assertStoreWritable } from "./store-paths";
import { DrwnError } from "./errors";
import { withInventoryLock } from "./inventory-lock";
import { listStandaloneMcpRecords, listStandaloneSkillPackages } from "./inventory";
import { loadProjectConfig } from "./project";
import { withProjectStateLock } from "./project-state-transaction";
import type { ProjectConfig } from "./types";

export interface ProjectsIndex {
  schemaVersion: 1;
  projects: string[];
}

export function resolveProjectsIndexPath(agentsDir: string) {
  return join(agentsDir, "drwn", "projects.json");
}

export async function loadProjectsIndex(agentsDir: string): Promise<ProjectsIndex> {
  const indexPath = resolveProjectsIndexPath(agentsDir);
  if (!existsSync(indexPath)) {
    return { schemaVersion: 1, projects: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    throw new DrwnError("PROJECT_REGISTRY_INVALID", `Invalid project registry JSON: ${indexPath}`, undefined, error);
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const projects = record?.projects;
  if (
    !record ||
    Object.keys(record).some((key) => key !== "schemaVersion" && key !== "projects") ||
    record.schemaVersion !== 1 ||
    !Array.isArray(projects) ||
    !projects.every((project) => typeof project === "string" && project.length > 0)
  ) {
    throw new DrwnError("PROJECT_REGISTRY_INVALID", `Invalid project registry contract: ${indexPath}`);
  }
  return { schemaVersion: 1, projects: [...projects] as string[] };
}

async function writeProjectsIndex(agentsDir: string, index: ProjectsIndex) {
  assertStoreWritable();
  const indexPath = resolveProjectsIndexPath(agentsDir);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeAtomically(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

async function loadExactProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const configPath = join(projectRoot, ".agents", "drwn", "config.json");
  let stats;
  try {
    stats = await lstat(projectRoot);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("project root must be a concrete directory");
    }
    await access(projectRoot, constants.R_OK);
    await access(configPath, constants.R_OK);
    return await loadProjectConfig(configPath);
  } catch (error) {
    throw new DrwnError(
      "PROJECT_REGISTRY_ROOT_INVALID",
      `Cannot verify project registration at ${projectRoot}`,
      ["Repair the exact project root and strict project config before retrying."],
      error,
    );
  }
}

async function mutateProjectsIndex(
  agentsDir: string,
  mutate: (projects: string[]) => string[],
): Promise<boolean> {
  const index = await loadProjectsIndex(agentsDir);
  const before = [...index.projects].map((project) => resolve(project)).sort((a, b) => a.localeCompare(b));
  const after = [...new Set(mutate(before).map((project) => resolve(project)))].sort((a, b) => a.localeCompare(b));
  if (before.length === after.length && before.every((project, index) => project === after[index])) return false;
  await writeProjectsIndex(agentsDir, { schemaVersion: 1, projects: after });
  return true;
}

function projectStandaloneReferences(
  projectRoot: string,
  config: ProjectConfig,
  skillIds: Set<string>,
  mcpIds: Set<string>,
) {
  const configPath = join(projectRoot, ".agents", "drwn", "config.json");
  const references: Array<{ kind: "skill" | "mcp"; id: string; relation: "include" | "exclude" | "mcp-toggle" }> = [];
  for (const id of config.skills?.include ?? []) {
    if (skillIds.has(id)) references.push({ kind: "skill", id, relation: "include" });
  }
  for (const id of config.skills?.exclude ?? []) {
    if (skillIds.has(id)) references.push({ kind: "skill", id, relation: "exclude" });
  }
  for (const [id, override] of Object.entries(config.mcpServers ?? {})) {
    if (mcpIds.has(id) && "enabled" in override && !("transport" in override)) {
      references.push({ kind: "mcp", id, relation: "mcp-toggle" });
    }
  }
  return references
    .sort((a, b) => `${a.kind}:${a.id}:${a.relation}`.localeCompare(`${b.kind}:${b.id}:${b.relation}`))
    .map((reference) => ({ ...reference, surface: "project" as const, projectRoot, sourcePath: configPath }));
}

async function assertProjectHasNoStandaloneReferences(
  projectRoot: string,
  config: ProjectConfig,
  agentsDir: string,
) {
  const packages = await listStandaloneSkillPackages(agentsDir);
  const mcpRecords = await listStandaloneMcpRecords(agentsDir);
  const references = projectStandaloneReferences(
    projectRoot,
    config,
    new Set(packages.flatMap((entry) => entry.exportedSkillIds)),
    new Set(mcpRecords.map((entry) => entry.id)),
  );
  if (references.length === 0) return;
  const referencedIds = [...new Set(references.map((reference) => reference.id))].sort((a, b) => a.localeCompare(b));
  throw new DrwnError(
    "INVENTORY_ITEM_IN_USE",
    `Cannot unregister ${projectRoot}; the project declares standalone inventory references: ${referencedIds.join(", ")}`,
    references.map((reference) =>
      `${reference.surface} ${reference.projectRoot}: ${reference.kind} ${reference.id} (${reference.relation}) at ${reference.sourcePath}`
    ),
  );
}

export async function registerProject(agentsDir: string, projectRoot: string) {
  const normalized = resolve(projectRoot);
  await loadExactProjectConfig(normalized);
  return withInventoryLock(agentsDir, () =>
    withProjectStateLock(normalized, async () => {
      await loadExactProjectConfig(normalized);
      const changed = await mutateProjectsIndex(agentsDir, (projects) => [...projects, normalized]);
      return { registered: changed, projectRoot: normalized };
    }, { createStateDir: false })
  );
}

async function inspectProjectForUnregister(agentsDir: string, projectRoot: string) {
  const normalized = resolve(projectRoot);
  const index = await loadProjectsIndex(agentsDir);
  if (!index.projects.some((project) => resolve(project) === normalized)) {
    return { registered: false, projectRoot: normalized, missing: false };
  }
  try {
    const stats = await lstat(normalized);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new DrwnError("PROJECT_UNREGISTER_UNSAFE", `Refusing to unregister ambiguous project root: ${normalized}`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { registered: true, projectRoot: normalized, missing: true };
    }
    if (error instanceof DrwnError) throw error;
    throw new DrwnError("PROJECT_UNREGISTER_UNSAFE", `Cannot verify project root before unregistering: ${normalized}`, undefined, error);
  }
  const config = await loadExactProjectConfig(normalized);
  await assertProjectHasNoStandaloneReferences(normalized, config, agentsDir);
  return { registered: true, projectRoot: normalized, missing: false };
}

export async function unregisterProject(
  agentsDir: string,
  projectRoot: string,
  options: { dryRun?: boolean } = {},
) {
  const normalized = resolve(projectRoot);
  if (options.dryRun) {
    const inspection = await inspectProjectForUnregister(agentsDir, normalized);
    return { removed: inspection.registered, projectRoot: normalized };
  }
  return withInventoryLock(agentsDir, async () => {
    const preflight = await inspectProjectForUnregister(agentsDir, normalized);
    if (!preflight.registered) return { removed: false, projectRoot: normalized };
    const remove = async () => ({
      removed: await mutateProjectsIndex(
        agentsDir,
        (projects) => projects.filter((project) => resolve(project) !== normalized),
      ),
      projectRoot: normalized,
    });
    if (preflight.missing) return remove();
    return withProjectStateLock(normalized, async () => {
      const config = await loadExactProjectConfig(normalized);
      await assertProjectHasNoStandaloneReferences(normalized, config, agentsDir);
      return remove();
    }, { createStateDir: false });
  });
}

export async function listRegisteredProjects(agentsDir: string) {
  return (await loadProjectsIndex(agentsDir)).projects;
}

/**
 * Removes registered project roots whose `.agents/drwn/config.json` no longer
 * exists. Returns the removed roots. Designed for cleaning up stale
 * registrations left by deleted or moved checkouts.
 */
export async function pruneStaleProjects(
  agentsDir: string,
  options: { dryRun?: boolean } = {},
): Promise<{ pruned: string[]; remaining: number }> {
  const projects = await listRegisteredProjects(agentsDir);
  const stale: string[] = [];
  for (const projectRoot of projects) {
    const configPath = join(projectRoot, ".agents", "drwn", "config.json");
    if (!existsSync(configPath)) {
      stale.push(projectRoot);
    }
  }
  if (options.dryRun || stale.length === 0) {
    return { pruned: stale, remaining: projects.length - stale.length };
  }
  const staleSet = new Set(stale.map((p) => resolve(p)));
  const changed = await mutateProjectsIndex(agentsDir, (projects) =>
    projects.filter((project) => !staleSet.has(resolve(project))),
  );
  return { pruned: changed ? stale : [], remaining: projects.length - (changed ? stale.length : 0) };
}

export async function updateAllRegisteredProjects(options: {
  agentsDir: string;
  homeDir: string;
  repoRoot: string;
  fetch?: boolean;
  dryRun?: boolean;
  onProject?: (projectRoot: string) => void;
}) {
  const projects = await listRegisteredProjects(options.agentsDir);
  const results: Array<{ projectRoot: string; updated: boolean; message: string }> = [];
  const { findOutdatedProjectCards, updateProjectCardLock } = await import("./card-project");
  const { loadCardLock } = await import("./card-lock");
  const { syncRepository } = await import("./sync");
  const git = await import("./git");
  const { resolveCardBareRepoPath } = await import("./store-paths");

  for (const projectRoot of projects) {
    options.onProject?.(projectRoot);
    if (options.fetch) {
      const lock = await loadCardLock(projectRoot);
      for (const entry of lock?.cards ?? []) {
        if (!entry.git?.url) {
          continue;
        }
        await git.fetch(
          resolveCardBareRepoPath(options.agentsDir, entry.name),
          "origin",
          ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*", "+refs/meta/*:refs/meta/*"],
        );
      }
    }
    const outdated = await findOutdatedProjectCards(projectRoot, options.agentsDir, {
      repoRoot: options.repoRoot,
      cwd: projectRoot,
    });
    if (outdated.length === 0) {
      results.push({ projectRoot, updated: false, message: "Nothing to update." });
      continue;
    }
    if (options.dryRun) {
      results.push({
        projectRoot,
        updated: false,
        message: `Would update: ${outdated.map((entry) => entry.name).join(", ")}`,
      });
      continue;
    }
    const lockResult = await updateProjectCardLock(projectRoot, options.agentsDir, {
      repoRoot: options.repoRoot,
      cwd: projectRoot,
    });
    await syncRepository({
      repoRoot: options.repoRoot,
      agentsDir: options.agentsDir,
      homeDir: options.homeDir,
      cwd: projectRoot,
    });
    const consentMessages = (lockResult.warnings ?? []).filter((w) => w.includes("consent"));
    results.push({
      projectRoot,
      updated: true,
      message: `Updated: ${outdated.map((entry) => entry.name).join(", ")}${consentMessages.length ? `; ${consentMessages.join("; ")}` : ""}`,
    });
  }
  return results;
}
