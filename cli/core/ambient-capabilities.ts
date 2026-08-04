// ABOUTME: Observes user-home skill and MCP surfaces without adding them to project declarations.
// ABOUTME: Returns redacted provenance for status and doctor; enforcement belongs to target adapters.

import { existsSync, realpathSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { AmbientMcpDefinition, AmbientDefinitionSource } from "./ambient-policy";
import { expandHomePath, OPENCODE_PROJECT_SKILLS_DIR, resolveToolPaths } from "./paths";
import type { CanonicalConfig, TargetName } from "./types";

export interface AmbientCapabilityObservation {
  id: string;
  kind: "skill" | "mcp";
  target: TargetName;
  sourceKind: "user-home";
  sourceId: string;
  sourcePath: string;
  sameIdDeclared: boolean;
  health: "visible" | "same-id";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface AmbientMcpInspectionError {
  target: TargetName;
  path: string;
  message: string;
}

export interface AmbientMcpInspection {
  definitions: AmbientMcpDefinition[];
  errors: AmbientMcpInspectionError[];
}

function appendDefinitions(
  definitions: AmbientMcpDefinition[],
  target: TargetName,
  path: string,
  source: AmbientDefinitionSource,
  servers: unknown,
) {
  if (!isObject(servers)) return;
  for (const id of Object.keys(servers).sort()) {
    definitions.push({ target, id, source, path, value: servers[id] });
  }
}

function findClaudeProjectEntry(projects: Record<string, unknown>, projectRoot: string): unknown {
  if (projectRoot in projects) return projects[projectRoot];
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(projectRoot);
  } catch {
    return undefined;
  }
  for (const [candidate, entry] of Object.entries(projects)) {
    try {
      if (realpathSync(candidate) === canonicalRoot) return entry;
    } catch {
      // Stale Claude project keys are unrelated ambient observations.
    }
  }
  return undefined;
}

const sourceOrder: Record<AmbientDefinitionSource, number> = { local: 0, project: 1, user: 2 };

export async function inspectAmbientMcpDefinitions(options: {
  config: CanonicalConfig;
  homeDir: string;
  projectRoot?: string | null;
}): Promise<AmbientMcpInspection> {
  const definitions: AmbientMcpDefinition[] = [];
  const errors: AmbientMcpInspectionError[] = [];

  for (const target of ["claude", "codex", "cursor", "opencode"] as const) {
    const targetConfig = options.config.targets[target];
    if (!targetConfig) continue;
    const path = expandHomePath(
      target === "claude" ? (targetConfig.userMcpPath ?? targetConfig.configPath) : targetConfig.configPath,
      options.homeDir,
    );
    if (!existsSync(path)) continue;
    try {
      const bytes = await readFile(path, "utf8");
      const parsed = target === "codex" ? parseToml(bytes) : JSON.parse(bytes);
      if (!isObject(parsed)) {
        errors.push({ target, path, message: "Ambient MCP configuration must contain an object." });
        continue;
      }
      appendDefinitions(definitions, target, path, "user", parsed[targetConfig.mcpKey]);
      if (target === "claude" && options.projectRoot) {
        const projectEntry = isObject(parsed.projects)
          ? findClaudeProjectEntry(parsed.projects, options.projectRoot)
          : undefined;
        appendDefinitions(
          definitions,
          target,
          path,
          "local",
          isObject(projectEntry) ? projectEntry[targetConfig.mcpKey] : undefined,
        );
      }
    } catch {
      errors.push({ target, path, message: "Ambient MCP configuration could not be parsed." });
    }
  }

  definitions.sort((left, right) =>
    left.target.localeCompare(right.target) ||
    left.id.localeCompare(right.id) ||
    sourceOrder[left.source] - sourceOrder[right.source] ||
    left.path.localeCompare(right.path)
  );
  return { definitions, errors };
}

async function readSkillIds(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function inspectAmbientCapabilities(options: {
  config: CanonicalConfig;
  homeDir: string;
  declaredSkillIds?: Iterable<string>;
  declaredMcpIds?: Iterable<string>;
}): Promise<AmbientCapabilityObservation[]> {
  const declaredSkills = new Set(options.declaredSkillIds ?? []);
  const declaredMcp = new Set(options.declaredMcpIds ?? []);
  const toolPaths = resolveToolPaths({ kind: "machine", homeDir: options.homeDir });
  const skillPaths: Record<TargetName, string | null> = {
    claude: toolPaths.claudeSkills,
    codex: toolPaths.codexSkills,
    cursor: null,
    opencode: null,
  };
  const observations: AmbientCapabilityObservation[] = [];

  const ambientMcp = await inspectAmbientMcpDefinitions({
    config: options.config,
    homeDir: options.homeDir,
  });

  for (const target of ["claude", "codex", "cursor", "opencode"] as const) {
    for (const definition of ambientMcp.definitions.filter((entry) => entry.target === target && entry.source === "user")) {
      const id = definition.id;
      const sameIdDeclared = declaredMcp.has(id);
      observations.push({
        id,
        kind: "mcp",
        target,
        sourceKind: "user-home",
        sourceId: `${target}:mcp`,
        sourcePath: definition.path,
        sameIdDeclared,
        health: sameIdDeclared ? "same-id" : "visible",
      });
    }
    const skillPath = skillPaths[target];
    if (!skillPath) continue;
    for (const id of await readSkillIds(skillPath)) {
      const sameIdDeclared = declaredSkills.has(id);
      observations.push({
        id,
        kind: "skill",
        target,
        sourceKind: "user-home",
        sourceId: `${target}:skills`,
        sourcePath: skillPath,
        sameIdDeclared,
        health: sameIdDeclared ? "same-id" : "visible",
      });
    }
  }

  return observations.sort((left, right) =>
    left.target.localeCompare(right.target) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
}

export interface OpencodeSkillShadowingIssue {
  code: "OPENCODE_SKILL_SHADOWED";
  severity: "warning" | "advisory";
  skill: string;
  machinePaths: string[];
  declared: boolean;
}

async function opencodeSkillsDirDeclared(projectRoot: string) {
  const configPath = join(projectRoot, "opencode.json");
  if (!existsSync(configPath)) return false;
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    if (!isObject(parsed.skills)) return false;
    const paths = parsed.skills.paths;
    return Array.isArray(paths) && paths.includes(OPENCODE_PROJECT_SKILLS_DIR);
  } catch {
    return false;
  }
}

// Reports project skills OpenCode would dedup against machine-home copies
// (~/.agents/skills/, ~/.claude/skills/). Warning when the managed skills.paths
// declaration is absent — the machine copy wins and project customization is lost;
// advisory when the declaration is present, since the dedicated dir then resolves first.
export async function inspectOpencodeSkillShadowing(options: {
  projectRoot: string;
  homeDir: string;
  agentsDir: string;
  projectedSkillIds: Iterable<string>;
}): Promise<OpencodeSkillShadowingIssue[]> {
  const projected = [...new Set(options.projectedSkillIds)].sort();
  if (projected.length === 0) return [];

  const machineDirs = [
    join(options.agentsDir, "skills"),
    join(options.homeDir, ".claude", "skills"),
  ];
  const machineSkills = new Map<string, string[]>();
  for (const dir of machineDirs) {
    for (const id of await readSkillIds(dir)) {
      const prior = machineSkills.get(id) ?? [];
      prior.push(join(dir, id));
      machineSkills.set(id, prior);
    }
  }

  const declared = await opencodeSkillsDirDeclared(options.projectRoot);
  const issues: OpencodeSkillShadowingIssue[] = [];
  for (const skill of projected) {
    const machinePaths = machineSkills.get(skill);
    if (!machinePaths) continue;
    issues.push({
      code: "OPENCODE_SKILL_SHADOWED",
      severity: declared ? "advisory" : "warning",
      skill,
      machinePaths,
      declared,
    });
  }
  return issues;
}
