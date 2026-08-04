// ABOUTME: Manages Library skill discovery and downstream skill sync state computation.
// ABOUTME: Keeps explicit selections separate from ambient legacy skill directories.

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { resolveSkillSource } from "./card-skill-resolver";
import { resolveSkillScopeDirs, resolveToolPaths } from "./paths";
import { lstatSafe } from "./fs";
import { materializeDir } from "./materialize";
import { ALL_TARGET_NAMES, DESCRIPTORS, descriptorsFor, type SkillSurfaceDir } from "./targets";
import type { CanonicalConfig, NormalizedSyncOptions, SyncResult, TargetName } from "./types";
import { ownManagedPath, type ManagedPath, type ProjectionTarget } from "./write-record";
import { listInstalledSkillBundles } from "./skill-packages";

export type SkillScope = "shared" | "claude-only" | "codex-only" | "experimental";

export interface RepoSkill {
  name: string;
  scope: SkillScope;
  path: string;
}

export interface RepoSkillScopes {
  shared: RepoSkill[];
  claudeOnly: RepoSkill[];
  codexOnly: RepoSkill[];
  experimental: RepoSkill[];
}

export interface SkillInventoryItem extends RepoSkill {
  curated: boolean;
  claudeLinked: boolean;
  codexLinked: boolean;
  sourceType?: "repo" | "npm";
  sourceId?: string;
  sourceVersion?: string;
}

export interface SkillSyncOverrides {
  include?: string[];
  exclude?: string[];
}

interface MaterializeIntent {
  linkPath: string;
  targetPath: string;
  relPath: string;
  layerLabel: string;
  target: Extract<ProjectionTarget, "claude" | "codex">;
  alsoAvailable?: string[];
}

function mergeAlsoAvailable(values: string[]) {
  return [...new Set(values)];
}

function recordIntent(map: Map<string, MaterializeIntent>, intent: MaterializeIntent) {
  const prior = map.get(intent.linkPath);
  if (!prior) {
    map.set(intent.linkPath, intent);
    return;
  }
  map.set(intent.linkPath, {
    ...intent,
    alsoAvailable: mergeAlsoAvailable([
      ...(intent.alsoAvailable ?? []),
      prior.layerLabel,
      ...(prior.alsoAvailable ?? []),
    ]),
  });
}

export function collectDuplicateSkillWarnings(cards: CardLockEntry[]): string[] {
  const warnings: string[] = [];
  const skillToCards = new Map<string, string[]>();
  for (const card of cards) {
    for (const skill of card.skills) {
      const prior = skillToCards.get(skill) ?? [];
      prior.push(card.name);
      skillToCards.set(skill, prior);
    }
  }
  for (const [skill, cardNames] of skillToCards) {
    if (cardNames.length <= 1) {
      continue;
    }
    const winner = cardNames.at(-1)!;
    const dropped = cardNames.slice(0, -1);
    warnings.push(
      `duplicate skill ${skill}: using ${winner} (applied later), dropped ${dropped.join(", ")}`,
    );
  }
  return warnings;
}

async function listScopeSkills(scopeDir: string, scope: SkillScope): Promise<RepoSkill[]> {
  if (!existsSync(scopeDir)) {
    return [];
  }

  const entries = await readdir(scopeDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      scope,
      path: join(scopeDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSkillsByScope(repoRoot: string): Promise<RepoSkillScopes> {
  const scopeDirs = resolveSkillScopeDirs(repoRoot);

  return {
    shared: await listScopeSkills(scopeDirs.shared, "shared"),
    claudeOnly: await listScopeSkills(scopeDirs.claudeOnly, "claude-only"),
    codexOnly: await listScopeSkills(scopeDirs.codexOnly, "codex-only"),
    experimental: await listScopeSkills(scopeDirs.experimental, "experimental"),
  };
}

export async function listRepoSkills(repoRoot: string): Promise<RepoSkill[]> {
  const grouped = await listSkillsByScope(repoRoot);
  return [...grouped.shared, ...grouped.claudeOnly, ...grouped.codexOnly, ...grouped.experimental];
}

export async function findRepoSkill(repoRoot: string, name: string): Promise<RepoSkill | null> {
  const skills = await listRepoSkills(repoRoot);
  return skills.find((skill) => skill.name === name) ?? null;
}

async function findPackageSkill(agentsDir: string, name: string): Promise<RepoSkill | null> {
  const bundles = await listInstalledSkillBundles(agentsDir);
  for (const bundle of bundles) {
    const skill = bundle.manifest.skills.find((entry) => entry.name === name);
    if (skill) {
      return {
        name: skill.name,
        scope: skill.scope,
        path: join(bundle.versionRoot, skill.path),
      };
    }
  }
  return null;
}

export async function findAvailableSkill(repoRoot: string, agentsDir: string, name: string): Promise<RepoSkill | null> {
  return (await findRepoSkill(repoRoot, name)) ?? (await findPackageSkill(agentsDir, name));
}

export async function listCuratedSkills(agentsDir: string) {
  const curatedDir = join(agentsDir, "skills");
  if (!existsSync(curatedDir)) {
    return [];
  }

  const entries = await readdir(curatedDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      path: join(curatedDir, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isMaterialized(linkPath: string) {
  const stats = lstatSafe(linkPath);
  return stats?.isDirectory() === true || stats?.isSymbolicLink() === true;
}

export async function buildSkillInventory(repoRoot: string, agentsDir: string, homeDir: string): Promise<SkillInventoryItem[]> {
  const skills = await listRepoSkills(repoRoot);
  const bundles = await listInstalledSkillBundles(agentsDir);
  const curated = await listCuratedSkills(agentsDir);
  const curatedNames = new Set(curated.map((entry) => entry.name));
  const toolPaths = resolveToolPaths(homeDir);

  const repoInventory = skills.map((skill) => {
    return {
      ...skill,
      curated: curatedNames.has(skill.name),
      claudeLinked:
        skill.scope === "shared" || skill.scope === "claude-only"
          ? isMaterialized(join(toolPaths.claudeSkills, skill.name))
          : false,
      codexLinked:
        skill.scope === "shared" || skill.scope === "codex-only"
          ? isMaterialized(join(toolPaths.codexSkills, skill.name))
          : false,
    };
  });

  const packageInventory = bundles.flatMap((bundle) =>
    bundle.manifest.skills.map((skill) => {
      const skillPath = join(bundle.versionRoot, skill.path);
      return {
        name: skill.name,
        scope: skill.scope,
        path: skillPath,
        curated: curatedNames.has(skill.name),
        claudeLinked:
          skill.scope === "shared" || skill.scope === "claude-only"
            ? isMaterialized(join(toolPaths.claudeSkills, skill.name))
            : false,
        codexLinked:
          skill.scope === "shared" || skill.scope === "codex-only"
            ? isMaterialized(join(toolPaths.codexSkills, skill.name))
            : false,
        sourceType: "npm" as const,
        sourceId: bundle.packageName,
        sourceVersion: bundle.activeVersion,
      } satisfies SkillInventoryItem;
    }),
  );

  return [...repoInventory, ...packageInventory].sort((a, b) => a.name.localeCompare(b.name));
}

export async function findStaleManagedEntries(dirPath: string, desiredNames: Set<string>) {
  if (!existsSync(dirPath)) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .filter((entry) => !desiredNames.has(entry.name))
    .map((entry) => join(dirPath, entry.name));
}

export async function syncSkills(
  options: NormalizedSyncOptions,
  overrides?: SkillSyncOverrides,
  lockedCards: CardLockEntry[] = [],
  contentRoots?: Record<string, string>,
  machineSources?: Record<string, import("./defaults").ResolvedMachineSkill>,
  targetsConfig?: Pick<CanonicalConfig, "targets">,
): Promise<SyncResult> {
  const managedPaths: ManagedPath[] = [];
  const result: SyncResult = { changes: [], warnings: [], managedPaths };
  const toolPaths = resolveToolPaths(options.toolRoot ?? options.homeDir);
  const selectedSurfaces = new Set<SkillSurfaceDir>(
    (targetsConfig
      ? descriptorsFor(targetsConfig, options.target)
      : ALL_TARGET_NAMES
          .filter((name) => (options.target ? name === options.target : true))
          .map((name) => DESCRIPTORS[name])
    ).flatMap((descriptor) => descriptor.skillSurfaces),
  );
  const excluded = new Set(overrides?.exclude ?? []);
  result.warnings.push(...collectDuplicateSkillWarnings(lockedCards));
  for (const skill of excluded) {
    if (lockedCards.some((card) => card.skills.includes(skill))) {
      result.warnings.push(`excluded skill ${skill}: omitted from materialization`);
    }
  }
  type NonMissingResolvedSkillSource = Exclude<Awaited<ReturnType<typeof resolveSkillSource>>, { layer: "missing" }>;
  const includes = (overrides?.include ?? []).filter((name) => !excluded.has(name));
  const resolvedIncludes: Array<{
    name: string;
    source: NonMissingResolvedSkillSource;
  }> = [];
  const errors: string[] = [];
  for (const name of includes) {
    const source = await resolveSkillSource(name, lockedCards, options.repoRoot, options.agentsDir, contentRoots, machineSources);
    if (source.layer === "missing") {
      errors.push(source.reason);
      continue;
    }
    resolvedIncludes.push({ name, source });
  }
  if (errors.length > 0) {
    throw new Error(`drwn write cannot resolve all skills:\n  - ${errors.join("\n  - ")}`);
  }

  const desiredClaude = new Set<string>();
  const desiredCodex = new Set<string>();
  const claudeIntents = new Map<string, MaterializeIntent>();
  const codexIntents = new Map<string, MaterializeIntent>();

  for (const { name, source } of resolvedIncludes) {
    const targetPath = source.path;
    const scope = source.layer === "card" ? "shared" : source.scope;
    const layerLabel = source.layer === "card"
      ? `card ${source.cardName}@${source.cardVersion}`
      : source.layer === "machine-worker"
        ? `machine Worker Card ${source.cardName}@${source.cardVersion}`
          : "user-default";
    if (selectedSurfaces.has("claude")) {
      if (scope === "shared" || scope === "claude-only") {
        desiredClaude.add(name);
        recordIntent(claudeIntents, {
          linkPath: join(toolPaths.claudeSkills, name),
          targetPath,
          relPath: `.claude/skills/${name}`,
          layerLabel,
          target: "claude",
        });
      }
    }
    if (selectedSurfaces.has("codex")) {
      if (scope === "shared" || scope === "codex-only") {
        desiredCodex.add(name);
        recordIntent(codexIntents, {
          linkPath: join(toolPaths.codexSkills, name),
          targetPath,
          relPath: `.codex/skills/${name}`,
          layerLabel,
          target: "codex",
        });
      }
    }
  }

  for (const intent of [...claudeIntents.values(), ...codexIntents.values()]) {
    const labelSuffix = intent.alsoAvailable && intent.alsoAvailable.length > 0
      ? ` ← ${intent.layerLabel} (also available: ${intent.alsoAvailable.join(", ")})`
      : ` ← ${intent.layerLabel}`;
    const record = materializeDir(intent.targetPath, intent.linkPath, {
      dryRun: options.dryRun,
      result,
      relPath: intent.relPath,
      labelSuffix,
    });
    managedPaths.push(ownManagedPath(record, { surface: "skill", target: intent.target }));
  }

  const staleClaude = selectedSurfaces.has("claude")
    ? await findStaleManagedEntries(toolPaths.claudeSkills, desiredClaude)
    : [];
  const staleCodex = selectedSurfaces.has("codex")
    ? await findStaleManagedEntries(toolPaths.codexSkills, desiredCodex)
    : [];

  for (const pathValue of [...staleClaude, ...staleCodex]) {
    result.warnings.push(`stale skill: ${pathValue}`);
  }

  return result;
}
