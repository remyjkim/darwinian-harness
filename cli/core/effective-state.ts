// ABOUTME: Builds the effective drwn state shared by write and capture flows.
// ABOUTME: Keeps project card, overlay, registry, and target resolution in one place.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AmbientMcpCollisionError,
  classifyAmbientMcpCollisions,
  type AmbientCollision,
} from "./ambient-policy";
import {
  inspectAmbientMcpDefinitions,
  type AmbientMcpInspectionError,
} from "./ambient-capabilities";
import { cardLockPath, type CardLockEntry, type ProjectLockV1, type WorkerRootLockEntry } from "./card-lock";
import { mergeCardManifestsIntoProjectConfig } from "./card-project";
import { collectCardServerDefinitions, mergeCardServerDefinitionsIntoRegistry, type CardServerDefinition } from "./card-mcp";
import { loadCardLock } from "./card-lock";
import { loadConfigLocal, loadCardLockLocal, mergeProjectWithLocal, type ConfigLocal } from "./config-local";
import { resolveCardContentRoot } from "./card-content-root";
import { resolveMode } from "./mode-resolution";
import { loadConfig } from "./config";
import { resolveMachineCapabilities, type ResolvedMachineCapabilities } from "./defaults";
import { buildActiveServers, renderMcpServerForTarget } from "./mcp";
import { normalizeSyncPathOptions, resolveToolPaths } from "./paths";
import { findProjectConfig, isServerToggle, loadProjectConfig, mergeProjectConfig, resolveProjectRootFromConfigPath } from "./project";
import { loadRegistry } from "./registry";
import { resolveGlobalWriteRecordPath, resolveStoreGeneratedDir } from "./store-paths";
import type {
  CanonicalConfig,
  CanonicalRegistry,
  NormalizedSyncOptions,
  ProjectConfig,
  RegistryServer,
  SyncOptions,
} from "./types";
import { loadEffectiveConfig } from "./user-config";
import { resolveProjectWriteRecordPath } from "./write-record";
import type { SkillSyncOverrides } from "./skills";
import { DrwnError } from "./errors";
import { assertWorkerCapabilityCompatibility } from "./card-skill-resolver";
import { getExtension } from "./extensions/registry";
import type { OrganizationInstructionConsentContext } from "./instruction-consent-evidence";
import { loadOrgWorkerInstructionConsentContext } from "./org-worker-materialization-record";

import type { ResolvedCardMode } from "./mode-resolution";

export interface EffectiveState {
  normalized: NormalizedSyncOptions;
  repoConfig: CanonicalConfig;
  effectiveConfig: CanonicalConfig;
  effectiveRegistry: CanonicalRegistry;
  activeServers: Record<string, RegistryServer>;
  projectConfigPath: string | null;
  projectRoot: string | null;
  projectConfig: ProjectConfig | null;
  projectConfigWithCards: ProjectConfig | null;
  workerSelection: EffectiveWorkerSelection | null;
  cardServerDefinitions: CardServerDefinition[];
  inactiveCardServerDefinitions: CardServerDefinition[];
  lockedCards: CardLockEntry[];
  activeCards: CardLockEntry[];
  skillApplyOrderCards: CardLockEntry[];
  overlayCards: CardLockEntry[];
  cardModes: Record<string, ResolvedCardMode>;
  cardLanes: Record<string, "committed" | "localOverlay">;
  contentRootsByCard: Record<string, string>;
  vendorEligible: Set<string>;
  overlayWarnings: string[];
  ambientCollisions: AmbientCollision[];
  ambientMcpErrors: AmbientMcpInspectionError[];
  skillSelection?: SkillSyncOverrides;
  machineCapabilities: ResolvedMachineCapabilities | null;
  organizationInstructionConsent: OrganizationInstructionConsentContext | null;
  recordPath: string;
  scopeRoot: string;
  scopedOptions: NormalizedSyncOptions;
}

export interface EffectiveWorkerSelection {
  installedRoots: WorkerRootLockEntry[];
  activeWorker: string | null;
  selectedRoot: WorkerRootLockEntry | null;
  installedCards: CardLockEntry[];
  activeCards: CardLockEntry[];
  selectionSource: "project" | "local" | "machine";
  localOverrides: {
    activeWorker: string | null;
    cardReplacements: string[];
    localOnlyRoots: string[];
    sourceOverrides: string[];
  };
  localCardNames: Set<string>;
}

interface SelectProjectWorkerOptions {
  projectConfig: ProjectConfig;
  committedLock: ProjectLockV1 | null;
  configLocal: ConfigLocal | null;
  localLock: ProjectLockV1 | null;
}

function invalidSelection(detail: string): never {
  throw new DrwnError("PROJECT_LOCK_INVALID", `Invalid project Worker graph: ${detail}`);
}

function sameTopology(left: WorkerRootLockEntry, right: WorkerRootLockEntry): boolean {
  return left.name === right.name && left.kind === right.kind &&
    left.members.length === right.members.length && left.members.every((member, index) => right.members[index] === member);
}

function closureNames(root: WorkerRootLockEntry): string[] {
  return [root.name, ...root.members];
}

function projectBaseConfig(repoConfig: CanonicalConfig): CanonicalConfig {
  const config: CanonicalConfig = JSON.parse(JSON.stringify(repoConfig));
  delete config.defaults;
  config.optional = {};
  config.parallel = {
    ...(config.parallel ?? {}),
    mcp: { ...(config.parallel?.mcp ?? {}), enabled: false },
  };
  return config;
}

function projectBaseRegistry(
  builtInRegistry: CanonicalRegistry,
  projectConfig: ProjectConfig,
): CanonicalRegistry {
  const names = new Set<string>();
  for (const [name, override] of Object.entries(projectConfig.mcpServers ?? {})) {
    if (isServerToggle(override)) names.add(name);
  }
  for (const [extensionName, extensionConfig] of Object.entries(projectConfig.extensions ?? {})) {
    if (extensionConfig.enabled === false || extensionConfig.mcp !== true) continue;
    for (const server of getExtension(extensionName)?.mcpServers ?? []) names.add(server.name);
  }
  return {
    version: builtInRegistry.version,
    servers: Object.fromEntries(
      [...names]
        .filter((name) => Boolean(builtInRegistry.servers[name]))
        .map((name) => [name, builtInRegistry.servers[name]!]),
    ),
  };
}

export function selectProjectWorker(options: SelectProjectWorkerOptions): EffectiveWorkerSelection {
  const { projectConfig, committedLock, configLocal, localLock } = options;
  const committedRoots = committedLock?.workerRoots ?? [];
  if (projectConfig.workers.length !== committedRoots.length) {
    invalidSelection("project requirements and committed lock roots differ");
  }
  projectConfig.workers.forEach((spec, index) => {
    if (committedRoots[index]?.requested !== spec) {
      invalidSelection(`requirement ${spec} does not match committed root ${committedRoots[index]?.requested ?? "<missing>"}`);
    }
  });

  const committedRootsByName = new Map(committedRoots.map((root) => [root.name, root]));
  const committedCardsByName = new Map((committedLock?.cards ?? []).map((card) => [card.name, card]));
  const localRootsByName = new Map((localLock?.workerRoots ?? []).map((root) => [root.name, root]));
  const localCardsByName = new Map((localLock?.cards ?? []).map((card) => [card.name, card]));
  const replacementNames = Object.keys(configLocal?.cardReplacements ?? {});
  const localOnlyNames = configLocal?.localOnlyRoots ?? [];
  const localOnlySet = new Set(localOnlyNames);
  const replacementSet = new Set(replacementNames);

  for (const name of replacementNames) {
    if (!committedCardsByName.has(name)) invalidSelection(`local replacement ${name} is not a committed Card`);
    if (!localCardsByName.has(name)) invalidSelection(`local replacement ${name} is missing from card.lock.local`);
  }
  for (const name of localOnlyNames) {
    if (committedRootsByName.has(name)) invalidSelection(`local-only root ${name} is already committed`);
    if (!localRootsByName.has(name)) invalidSelection(`local-only root ${name} is missing from card.lock.local`);
  }
  for (const localRoot of localLock?.workerRoots ?? []) {
    if (localOnlySet.has(localRoot.name)) continue;
    const committedRoot = committedRootsByName.get(localRoot.name);
    if (!committedRoot) invalidSelection(`local root ${localRoot.name} is neither committed nor declared local-only`);
    if (!sameTopology(committedRoot, localRoot)) invalidSelection(`local root ${localRoot.name} changes committed root topology`);
    if (!closureNames(localRoot).some((name) => replacementSet.has(name))) {
      invalidSelection(`local root ${localRoot.name} contains no declared Card replacement`);
    }
  }

  const installedRoots = [...committedRoots];
  for (const name of localOnlyNames) installedRoots.push(localRootsByName.get(name)!);
  const installedCardsByName = new Map(committedCardsByName);
  const localCardNames = new Set<string>();
  for (const name of replacementNames) {
    installedCardsByName.set(name, localCardsByName.get(name)!);
    localCardNames.add(name);
  }
  for (const name of localOnlyNames) {
    const localRoot = localRootsByName.get(name)!;
    for (const cardName of closureNames(localRoot)) {
      const card = localCardsByName.get(cardName);
      if (!card) invalidSelection(`local-only root ${name} is missing Card ${cardName}`);
      const existing = installedCardsByName.get(cardName);
      if (existing && existing.integrity !== card.integrity) {
        invalidSelection(`local-only root ${name} conflicts with installed Card ${cardName}`);
      }
      installedCardsByName.set(cardName, card);
      localCardNames.add(cardName);
    }
  }

  const selectionSource = configLocal?.activeWorker !== undefined ? "local" : "project";
  const activeWorker = configLocal?.activeWorker !== undefined ? configLocal.activeWorker : projectConfig.activeWorker;
  if (activeWorker === null) {
    return {
      installedRoots,
      activeWorker,
      selectedRoot: null,
      installedCards: [...installedCardsByName.values()],
      activeCards: [],
      selectionSource,
      localOverrides: {
        activeWorker: configLocal?.activeWorker ?? null,
        cardReplacements: replacementNames,
        localOnlyRoots: localOnlyNames,
        sourceOverrides: Object.keys(configLocal?.sourceOverrides ?? {}),
      },
      localCardNames,
    };
  }

  const selectedRoot = installedRoots.find((root) => root.name === activeWorker) ?? null;
  if (!selectedRoot || (localOnlySet.has(activeWorker) && selectionSource !== "local")) {
    throw new DrwnError("ACTIVE_WORKER_NOT_INSTALLED", `Active Worker ${activeWorker} is not an installed selectable root`);
  }
  const activeCards = closureNames(selectedRoot).map((name) => {
    const card = installedCardsByName.get(name);
    if (!card) invalidSelection(`selected root ${selectedRoot.name} is missing Card ${name}`);
    return card;
  });
  return {
    installedRoots,
    activeWorker,
    selectedRoot,
    installedCards: [...installedCardsByName.values()],
    activeCards,
    selectionSource,
    localOverrides: {
      activeWorker: configLocal?.activeWorker ?? null,
      cardReplacements: replacementNames,
      localOnlyRoots: localOnlyNames,
      sourceOverrides: Object.keys(configLocal?.sourceOverrides ?? {}),
    },
    localCardNames,
  };
}

export async function buildEffectiveState(options: SyncOptions = {}): Promise<EffectiveState> {
  const normalized = normalizeSyncPathOptions(options, options.repoRoot ? undefined : import.meta.path);
  const repoConfig = await loadConfig(normalized.repoRoot);
  const projectConfigPath = normalized.forceMachineScope ? null : findProjectConfig(normalized.cwd ?? process.cwd());
  const projectRoot = projectConfigPath ? resolveProjectRootFromConfigPath(projectConfigPath) : null;
  const builtInRegistry = await loadRegistry(normalized.repoRoot);
  const registry = builtInRegistry;
  const baseConfig = projectConfigPath
    ? projectBaseConfig(repoConfig)
    : (await loadEffectiveConfig(repoConfig, normalized.agentsDir)).config;
  let effectiveConfig = baseConfig;
  let effectiveRegistry = registry;
  const machineCapabilities = projectConfigPath
    ? null
    : await resolveMachineCapabilities({ repoRoot: normalized.repoRoot, agentsDir: normalized.agentsDir });
  if (machineCapabilities) {
    effectiveRegistry = {
      version: registry.version,
      servers: {
        ...registry.servers,
        ...Object.fromEntries(machineCapabilities.mcpServers.map((entry) => [entry.id, entry.server])),
      },
    };
  }
  let skillSelection: SkillSyncOverrides | undefined = machineCapabilities?.skills.length
    ? { include: machineCapabilities.skills.map((skill) => skill.id) }
    : undefined;
  let lockedCards: CardLockEntry[] = [];
  let activeCards: CardLockEntry[] = [];
  let skillApplyOrderCards: CardLockEntry[] = [];
  let projectConfig: ProjectConfig | null = null;
  let projectConfigWithCards: ProjectConfig | null = null;
  let workerSelection: EffectiveWorkerSelection | null = null;
  let cardServerDefinitions: CardServerDefinition[] = [];
  let inactiveCardServerDefinitions: CardServerDefinition[] = [];
  let overlayCards: CardLockEntry[] = [];
  const cardModes: Record<string, ResolvedCardMode> = {};
  const cardLanes: Record<string, "committed" | "localOverlay"> = {};
  const contentRootsByCard: Record<string, string> = {};
  const vendorEligible = new Set<string>();
  const overlayWarnings: string[] = [];
  let organizationInstructionConsent =
    normalized.organizationInstructionConsent ?? null;
  const cardsSourcePath = process.env.CARDS_SOURCE_PATH ?? null;

  if (!projectConfigPath && machineCapabilities) {
    lockedCards = machineCapabilities.installedCards;
    activeCards = machineCapabilities.activeCards;
    skillApplyOrderCards = activeCards;
    assertWorkerCapabilityCompatibility(activeCards);
    const selectedRoot = machineCapabilities.activeWorker === null
      ? null
      : machineCapabilities.installedRoots.find((root) => root.name === machineCapabilities.activeWorker) ?? null;
    workerSelection = {
      installedRoots: machineCapabilities.installedRoots,
      activeWorker: machineCapabilities.activeWorker,
      selectedRoot,
      installedCards: machineCapabilities.installedCards,
      activeCards,
      selectionSource: "machine",
      localOverrides: {
        activeWorker: null,
        cardReplacements: [],
        localOnlyRoots: [],
        sourceOverrides: [],
      },
      localCardNames: new Set(),
    };
    for (const card of lockedCards) cardLanes[card.name] = "committed";
    for (const card of activeCards) {
      const contentRoot = machineCapabilities.contentRootsByCard[card.name]!;
      contentRootsByCard[card.name] = contentRoot;
      cardModes[card.name] = {
        mode: "overlay",
        reason: card.origin === "file"
          ? "integrity-locked machine file source"
          : "immutable machine Store extraction",
        vendorEligible: false,
        sourcePath: contentRoot,
      };
    }
    cardServerDefinitions = collectCardServerDefinitions(activeCards);
    const activeNames = new Set(activeCards.map((card) => card.name));
    inactiveCardServerDefinitions = collectCardServerDefinitions(
      lockedCards.filter((card) => !activeNames.has(card.name)),
    );
  }

  if (projectConfigPath) {
    projectConfig = await loadProjectConfig(projectConfigPath);
    const configLocal = projectRoot ? await loadConfigLocal(projectRoot) : null;
    if (configLocal?.activeWorker !== undefined && configLocal.activeWorker !== projectConfig.activeWorker) {
      overlayWarnings.push("config.local.json activeWorker overrides committed activeWorker");
    }
    const cardLock = projectRoot ? await loadCardLock(projectRoot) : null;
    if (
      !organizationInstructionConsent &&
      projectRoot &&
      projectConfigPath
    ) {
      organizationInstructionConsent =
        await loadOrgWorkerInstructionConsentContext({
          projectRoot,
          configBytes: await readFile(projectConfigPath, "utf8"),
          lockBytes: cardLock
            ? await readFile(cardLockPath(projectRoot), "utf8")
            : "",
          lock: cardLock,
        });
    }
    const localLock = projectRoot ? await loadCardLockLocal(projectRoot) : null;
    workerSelection = selectProjectWorker({ projectConfig, committedLock: cardLock, configLocal, localLock });
    projectConfig = mergeProjectWithLocal(projectConfig, configLocal);
    lockedCards = workerSelection.installedCards;
    activeCards = workerSelection.activeCards;
    assertWorkerCapabilityCompatibility(activeCards);
    skillApplyOrderCards = activeCards;
    for (const card of lockedCards) {
      cardLanes[card.name] = workerSelection.localCardNames.has(card.name) ? "localOverlay" : "committed";
    }
    for (const name of workerSelection.localOverrides.cardReplacements) {
      overlayWarnings.push(`card.lock.local replaces committed lock entry for ${name}`);
    }
    for (const card of lockedCards) {
      let resolved = resolveMode(card, {
        projectConfig,
        configLocal,
        cardsSourcePath,
      });
      if (cardLanes[card.name] === "localOverlay") {
        resolved = {
          mode: "overlay",
          reason: "local lock lane overlay",
          vendorEligible: false,
          sourcePath: resolved.sourcePath ?? card.path,
        };
      }
      cardModes[card.name] = resolved;
      if (resolved.vendorEligible) {
        vendorEligible.add(card.name);
      } else {
        overlayCards.push(card);
      }
      if (resolved.reason.includes("absent")) {
        overlayWarnings.push(`${card.name}: ${resolved.reason}`);
      }
    }
    if (projectRoot) {
      for (const card of lockedCards) {
        const mode = cardModes[card.name];
        if (mode) {
          contentRootsByCard[card.name] = resolveCardContentRoot({
            projectRoot,
            agentsDir: normalized.agentsDir,
            card,
            mode,
            allowPlanningFallback: true,
          });
        }
      }
    }
    projectConfigWithCards = mergeCardManifestsIntoProjectConfig(
      projectConfig,
      activeCards.map((card) => card.manifest),
    );
    cardServerDefinitions = collectCardServerDefinitions(activeCards);
    const activeNames = new Set(activeCards.map((card) => card.name));
    inactiveCardServerDefinitions = collectCardServerDefinitions(
      lockedCards.filter((card) => !activeNames.has(card.name)),
    );
    const registryWithCards = mergeCardServerDefinitionsIntoRegistry(
      projectBaseRegistry(builtInRegistry, projectConfig),
      cardServerDefinitions,
    );
    const projectOverlay: ProjectConfig = {
      ...projectConfigWithCards,
      mcpServers: projectConfig.mcpServers,
    };
    const merged = mergeProjectConfig(baseConfig, registryWithCards, projectOverlay);
    effectiveConfig = merged.config;
    effectiveRegistry = merged.registry;
    skillSelection = {
      include: [
        ...(merged.skills?.include ?? []),
      ],
      exclude: merged.skills?.exclude,
    };
  }

  const scopeRoot = projectRoot ?? normalized.homeDir;
  const scopedOptions: NormalizedSyncOptions = {
    ...normalized,
    toolRoot: scopeRoot,
    writeScope: projectRoot ? "project" : "machine",
    generatedDir: projectRoot ? join(projectRoot, ".agents", "drwn", "generated") : resolveStoreGeneratedDir(normalized.agentsDir),
  };
  const activeServers = machineCapabilities
    ? Object.fromEntries(machineCapabilities.mcpServers.map((entry) => [entry.id, entry.server]))
    : buildActiveServers(effectiveRegistry, effectiveConfig);
  let ambientCollisions: AmbientCollision[] = [];
  let ambientMcpErrors: AmbientMcpInspectionError[] = [];
  if (projectRoot) {
    const inspected = await inspectAmbientMcpDefinitions({
      config: effectiveConfig,
      homeDir: normalized.homeDir,
      projectRoot,
    });
    ambientMcpErrors = inspected.errors;
    const projectPaths = resolveToolPaths({ kind: "project", projectRoot });
    const declaredPaths = {
      claude: projectPaths.claudeMcp,
      codex: projectPaths.codexConfig,
      cursor: projectPaths.cursorMcp,
      opencode: projectPaths.opencodeConfig,
    } as const;
    ambientCollisions = classifyAmbientMcpCollisions(
      inspected.definitions.flatMap((ambient) => {
        const server = activeServers[ambient.id];
        if (!server) return [];
        return [{
          declared: {
            target: ambient.target,
            id: ambient.id,
            source: "project" as const,
            path: declaredPaths[ambient.target],
            value: renderMcpServerForTarget(ambient.target, server),
          },
          ambient,
        }];
      }),
    );
  }

  return {
    normalized,
    repoConfig,
    effectiveConfig,
    effectiveRegistry,
    activeServers,
    projectConfigPath,
    projectRoot,
    projectConfig,
    projectConfigWithCards,
    workerSelection,
    cardServerDefinitions,
    inactiveCardServerDefinitions,
    lockedCards,
    activeCards,
    skillApplyOrderCards,
    overlayCards,
    cardModes,
    cardLanes,
    contentRootsByCard,
    vendorEligible,
    overlayWarnings,
    ambientCollisions,
    ambientMcpErrors,
    skillSelection,
    machineCapabilities,
    organizationInstructionConsent,
    recordPath: projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(normalized.agentsDir),
    scopeRoot,
    scopedOptions,
  };
}

export function selectedAmbientCollisions(
  state: Pick<EffectiveState, "ambientCollisions" | "effectiveConfig" | "normalized">,
): AmbientCollision[] {
  return state.ambientCollisions.filter((collision) =>
    state.effectiveConfig.targets[collision.target].enabled &&
    (!state.normalized.target || state.normalized.target === collision.target)
  );
}

export function assertAmbientMcpPreflight(
  state: Pick<EffectiveState, "ambientCollisions" | "effectiveConfig" | "normalized">,
): AmbientCollision[] {
  const selected = selectedAmbientCollisions(state);
  const fatal = state.normalized.skillsOnly
    ? []
    : selected.filter((collision) => collision.disposition === "fatal");
  if (fatal.length > 0) throw new AmbientMcpCollisionError(fatal);
  return selected;
}

export function recomputeContentRootsByCard(
  state: Pick<EffectiveState, "projectRoot" | "scopedOptions" | "lockedCards" | "cardModes">,
  options: { allowPlanningFallback?: boolean } = {},
): Record<string, string> {
  if (!state.projectRoot) {
    return {};
  }
  const allowPlanningFallback = options.allowPlanningFallback ?? !state.scopedOptions.dryRun;
  const contentRootsByCard: Record<string, string> = {};
  for (const card of state.lockedCards) {
    const mode = state.cardModes[card.name];
    if (!mode) {
      continue;
    }
    contentRootsByCard[card.name] = resolveCardContentRoot({
      projectRoot: state.projectRoot,
      agentsDir: state.scopedOptions.agentsDir,
      card,
      mode,
      allowPlanningFallback,
    });
  }
  return contentRootsByCard;
}

export function assertMachineWriteScopeAllowed(options: {
  writeScope?: "machine" | "project";
  forceMachineScope?: boolean;
  scope?: "machine" | "project";
}) {
  if (options.writeScope !== "machine") {
    return;
  }
  if (options.forceMachineScope || options.scope === "machine") {
    return;
  }
  throw new Error(
    "Machine-scope drwn write would modify user home tool configs (~/.claude, ~/.codex, ...). Re-run with --scope machine or --root to confirm.",
  );
}
