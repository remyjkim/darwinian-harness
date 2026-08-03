// ABOUTME: Resolves machine capabilities exclusively from the selected verified Worker closure.
// ABOUTME: Keeps packaged defaults and standalone inventory outside machine activation authority.

import type { CanonicalConfig, CanonicalRegistry, UserMcpLibrary } from "./types";
import type { RegistryServer } from "./types";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { join, resolve } from "node:path";
import type { CardLockEntry, ProjectLockV1, WorkerRootLockEntry } from "./card-lock";
import { evaluateVersionFloor } from "./card-lock";
import { assertValidCardManifest } from "./card-manifest";
import { readMachineConfig } from "./card-store";
import { collectEffectiveCardServerDefinitions } from "./card-mcp";
import { assertWorkerCapabilityCompatibility } from "./card-skill-resolver";
import { computeIntegrityFromDir } from "./content-manifest";
import { DrwnError } from "./errors";
import { resolveExtractedPath } from "./store-paths";
import type { SkillScope } from "./skills";

function isParallelMcpName(name: string) {
  return name === "parallel-search" || name === "parallel-task";
}

export function hasExplicitSkillDefaults(config: CanonicalConfig): boolean {
  return Array.isArray(config.defaults?.skills);
}

export function hasExplicitMcpDefaults(config: CanonicalConfig): boolean {
  return Array.isArray(config.defaults?.mcpServers);
}

export function resolveDefaultSkillNames(config: CanonicalConfig): string[] {
  return hasExplicitSkillDefaults(config) ? [...(config.defaults?.skills ?? [])] : [];
}

export function resolveDefaultMcpNames(config: CanonicalConfig, registry: CanonicalRegistry): string[] {
  if (hasExplicitMcpDefaults(config)) {
    return [...(config.defaults?.mcpServers ?? [])];
  }

  return Object.entries(registry.servers)
    .filter(([name, server]) => {
      if (server.transport === "platform-provided") {
        return false;
      }
      if (isParallelMcpName(name)) {
        return config.parallel?.mcp?.enabled === true;
      }
      return !server.optional || config.optional[name] === true;
    })
    .map(([name]) => name);
}

export function applyMcpDefaultsToConfig(config: CanonicalConfig): CanonicalConfig {
  if (!hasExplicitMcpDefaults(config)) {
    return config;
  }

  const next: CanonicalConfig = JSON.parse(JSON.stringify(config));
  const defaults = new Set(next.defaults?.mcpServers ?? []);
  next.optional = {};
  for (const name of defaults) {
    next.optional[name] = true;
  }
  next.parallel ??= {};
  next.parallel.mcp = {
    ...(next.parallel.mcp ?? {}),
    enabled: defaults.has("parallel-search") || defaults.has("parallel-task"),
  };
  return next;
}

export function ensureMcpDefaultsInitialized(config: CanonicalConfig, seedNames: string[]): string[] {
  config.defaults ??= {};
  if (!hasExplicitMcpDefaults(config)) {
    config.defaults.mcpServers = [...seedNames];
  }
  return config.defaults.mcpServers ?? [];
}

export function ensureSkillDefaultsInitialized(config: CanonicalConfig, seedNames: string[]): string[] {
  config.defaults ??= {};
  if (!hasExplicitSkillDefaults(config)) {
    config.defaults.skills = [...seedNames];
  }
  return config.defaults.skills ?? [];
}

export function mergeUserMcpLibrary(registry: CanonicalRegistry, library: UserMcpLibrary): CanonicalRegistry {
  return {
    version: registry.version,
    servers: {
      ...registry.servers,
      ...library.servers,
    },
  };
}

export interface ResolvedMachineSkill {
  id: string;
  source: "worker";
  cardName: string;
  cardVersion: string;
  path: string;
  scope: SkillScope;
}

export interface ResolvedMachineMcpServer {
  id: string;
  source: "worker";
  cardName: string;
  cardVersion: string;
  server: RegistryServer;
}

export interface ResolvedMachineCapabilities {
  activeWorker: string | null;
  workerLock: ProjectLockV1 | null;
  installedRoots: WorkerRootLockEntry[];
  installedCards: CardLockEntry[];
  activeCards: CardLockEntry[];
  contentRootsByCard: Record<string, string>;
  skills: ResolvedMachineSkill[];
  mcpServers: ResolvedMachineMcpServer[];
}

function invalidMachineWorker(code: string, message: string, cause?: unknown): never {
  throw new DrwnError(code, message, undefined, cause);
}

async function verifyMachineCardContent(agentsDir: string, card: CardLockEntry): Promise<string> {
  let contentRoot: string;
  if (card.origin === "store" || card.origin === "git") {
    if (!card.treeSha) {
      invalidMachineWorker(
        "MACHINE_WORKER_CONTENT_MISSING",
        `Machine Worker Card ${card.name} is missing its immutable tree SHA`,
      );
    }
    contentRoot = resolveExtractedPath(agentsDir, card.treeSha);
    if (resolve(card.path) !== resolve(contentRoot)) {
      invalidMachineWorker(
        "MACHINE_WORKER_CONTENT_INVALID",
        `Machine Worker Card ${card.name} path does not match its immutable extracted tree`,
      );
    }
  } else if (card.origin === "file") {
    if (!card.requested.startsWith("file:") || resolve(card.requested.slice(5)) !== resolve(card.path)) {
      invalidMachineWorker(
        "MACHINE_WORKER_CONTENT_INVALID",
        `Machine Worker Card ${card.name} file source does not match its locked path`,
      );
    }
    contentRoot = resolve(card.path);
  } else {
    invalidMachineWorker(
      "MACHINE_WORKER_CONTENT_INVALID",
      `Machine Worker Card ${card.name} has unsupported ${card.origin} origin`,
    );
  }

  const manifestPath = join(contentRoot, "card.json");
  if (!existsSync(manifestPath)) {
    invalidMachineWorker(
      "MACHINE_WORKER_CONTENT_MISSING",
      `Machine Worker Card bytes are missing for ${card.name}: ${contentRoot}`,
    );
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assertValidCardManifest(manifest);
  } catch (error) {
    invalidMachineWorker(
      "MACHINE_WORKER_CONTENT_INVALID",
      `Machine Worker Card manifest is invalid for ${card.name}: ${manifestPath}`,
      error,
    );
  }
  if (!isDeepStrictEqual(manifest, card.manifest)) {
    invalidMachineWorker(
      "MACHINE_WORKER_INTEGRITY_MISMATCH",
      `Machine Worker Card manifest changed for ${card.name}`,
    );
  }
  if (await computeIntegrityFromDir(contentRoot) !== card.integrity) {
    invalidMachineWorker(
      "MACHINE_WORKER_INTEGRITY_MISMATCH",
      `Machine Worker Card content integrity changed for ${card.name}`,
    );
  }
  return contentRoot;
}

export async function resolveMachineCapabilities(options: {
  repoRoot: string;
  agentsDir: string;
}): Promise<ResolvedMachineCapabilities> {
  const machine = await readMachineConfig(options.agentsDir);
  const lock = machine.capabilities.workerLock;
  const activeWorker = machine.capabilities.activeWorker;
  const installedRoots = lock?.workerRoots ?? [];
  const installedCards = lock?.cards ?? [];
  if (lock) {
    const floor = evaluateVersionFloor(lock.store.minDrwnVersion);
    if (!floor.satisfied) {
      invalidMachineWorker(
        "MACHINE_WORKER_VERSION_UNSUPPORTED",
        `Machine Worker requires drwn >= ${floor.required}, but this CLI is ${floor.running}`,
      );
    }
  }

  const selectedRoot = activeWorker === null
    ? null
    : installedRoots.find((root) => root.name === activeWorker) ?? null;
  if (activeWorker !== null && !selectedRoot) {
    invalidMachineWorker(
      "ACTIVE_WORKER_NOT_INSTALLED",
      `Active machine Worker ${activeWorker} is not an installed root`,
    );
  }
  const cardsByName = new Map(installedCards.map((card) => [card.name, card]));
  const activeCards = selectedRoot
    ? [selectedRoot.name, ...selectedRoot.members].map((name) => {
        const card = cardsByName.get(name);
        if (!card) {
          invalidMachineWorker(
            "MACHINE_WORKER_LOCK_INVALID",
            `Active machine Worker ${selectedRoot.name} is missing Card ${name}`,
          );
        }
        return card;
      })
    : [];

  assertWorkerCapabilityCompatibility(activeCards);

  const contentRootsByCard: Record<string, string> = {};
  for (const card of activeCards) {
    contentRootsByCard[card.name] = await verifyMachineCardContent(options.agentsDir, card);
  }

  const skillById = new Map<string, ResolvedMachineSkill>();
  for (const card of activeCards) {
    for (const id of card.skills) {
      skillById.set(id, {
        id,
        source: "worker",
        cardName: card.name,
        cardVersion: card.version,
        path: join(contentRootsByCard[card.name]!, "skills", id),
        scope: "shared",
      });
    }
  }

  const mcpServers = collectEffectiveCardServerDefinitions(activeCards).map((definition) => ({
    id: definition.serverName,
    source: "worker" as const,
    cardName: definition.cardName,
    cardVersion: definition.cardVersion,
    server: definition.server,
  }));

  return {
    activeWorker,
    workerLock: lock,
    installedRoots,
    installedCards,
    activeCards,
    contentRootsByCard,
    skills: [...skillById.values()],
    mcpServers,
  };
}

export async function validateDefaultReferences(options: {
  config: CanonicalConfig;
  registry: CanonicalRegistry;
  skillNames: Set<string>;
}) {
  const issues: string[] = [];
  for (const name of options.config.defaults?.skills ?? []) {
    if (!options.skillNames.has(name)) {
      issues.push(`Unknown default skill: "${name}"`);
    }
  }
  for (const name of options.config.defaults?.mcpServers ?? []) {
    if (!options.registry.servers[name]) {
      issues.push(`Unknown default MCP server: "${name}"`);
    }
  }
  return issues;
}

export function addDefaultValue(values: string[] | undefined, value: string) {
  const next = [...(values ?? [])];
  if (!next.includes(value)) {
    next.push(value);
  }
  return next;
}

export function removeDefaultValue(values: string[] | undefined, value: string) {
  return [...(values ?? [])].filter((item) => item !== value);
}
