// ABOUTME: Computes report-only diagnostics for skill symlinks, MCP drift, and generated file expectations.
// ABOUTME: Shared by `drwn doctor` and `drwn status` to keep reporting logic centralized and testable.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluateVersionFloor, loadCardLock, type CardLockEntry, type VersionFloorStatus } from "./card-lock";
import type { AmbientCollision } from "./ambient-policy";
import { resolveSkillSource } from "./card-skill-resolver";
import { buildEffectiveState, selectedAmbientCollisions, type EffectiveState } from "./effective-state";
import { inspectAmbientCapabilities } from "./ambient-capabilities";
import { loadConfig } from "./config";
import { canonicalJsonHash } from "./managed-fields";
import {
  mcpServerHashKey,
  hashClaudeManagedServers,
  hashCodexManagedServers,
  mergeCodexTomlText,
  renderJsonMcpConfig,
  renderMcpServerForTarget,
} from "./mcp";
import { mergeUserMcpLibrary } from "./defaults";
import { expandHomePath, resolveToolPaths } from "./paths";
import { resolveHomeDir } from "./home";
import { ALL_TARGET_NAMES, getTargetDescriptor } from "./targets";
import { loadRegistry } from "./registry";
import { loadMcpLibrary } from "./mcp-library";
import {
  buildSkillInventory,
  findStaleManagedEntries,
  listRepoSkills,
} from "./skills";
import { lstatSafe } from "./fs";
import { resolveProjectRootFromConfigPath, summarizeProjectConfig, isServerToggle } from "./project";
import { loadEffectiveConfig } from "./user-config";
import { getExtension } from "./extensions/registry";
import {
  resolveCardsRoot,
  resolveGlobalWriteRecordPath,
  resolveSourcesRoot,
  resolveStoreGeneratedDir,
  resolveStoreMcpServersDir,
  resolveStoreMetadataPath,
  resolveStoreRoot,
  resolveStoreSkillsRoot,
} from "./store-paths";
import { diffWriteRecord, hashManagedContent, loadWriteRecord, resolveProjectWriteRecordPath } from "./write-record";
import { isHookConsentValid } from "./hook-consent";
import { DRWN_VERSION } from "./version";
import type { CanonicalConfig, RegistryServer } from "./types";
import {
  collectMachineProjectionConflicts,
  planMachineManagedPaths,
  planRepositoryProjection,
  type MachineProjectionConflict,
} from "./sync";
import { readMachineConfig } from "./card-store";
import { DrwnError } from "./errors";
import { verifyMachineProfilePin } from "./machine-profiles";
import { parseManagedBlock } from "./managed-block";
import {
  CLAUDE_ADAPTER_BLOCK_MARKERS,
  INSTRUCTION_BLOCK_MARKERS,
} from "./sync-instructions";
import { instructionCompositionForState } from "./sync-project-instructions";

export interface PlatformCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorReport {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  machineProjectionConflicts: string[];
  machineCapabilityIssues: string[];
  missingGeneratedFiles: string[];
  hookIssues: string[];
  projectConfigIssues: string[];
  surfaceNotes: string[];
  platformChecks: PlatformCheck[];
  ambientMcpCollisions: AmbientCollision[];
  cards?: DiagnosticsSections["cards"];
  store?: DiagnosticsSections["store"];
  writeRecord?: DiagnosticsSections["writeRecord"];
}

export interface DiagnosticsSections {
  machine: {
    repoRoot: string;
    agentsDir: string;
    homeDir: string;
  };
  project?: {
    configPath: string;
    root: string;
    cardCount: number;
  };
  store: {
    path: string;
    initialized: boolean;
    schemaVersion: number | null;
    cardCount: number;
    sourceCount: number;
    skillBundleCount: number;
    mcpServerCount: number;
  };
  writeRecord: {
    path: string;
    present: boolean;
    corrupt: boolean;
    managedPathCount: number;
    lastWriteAt?: string;
    lastWriteHarnessVersion?: string;
  };
  skills: {
    inventoryCount: number;
    activeCount: number;
    projectIncludes: string[];
    projectExcludes: string[];
    cardIncludes: Array<{ card: string; skill: string }>;
  };
  mcp: {
    activeServerCount: number;
    projectServers: string[];
    cardServers: Array<{ card: string; server: string }>;
  };
  extensions: {
    projectExtensions: string[];
  };
  cards: {
    configuredRefs: string[];
    lockedVersions: string[];
    warnings: string[];
  };
  versionFloor: VersionFloorStatus;
  targets: {
    enabled: string[];
    projectOverrides: string[];
  };
}

export interface ProjectStatusItem {
  id: string;
  sourceKind: "worker-root" | "card" | "project-overlay" | "local-overlay";
  sourceId: string;
  sourcePath: string;
  target: string;
  health: "installed" | "active" | "declared";
}

export interface ProjectStatusV1 {
  schema: "drwn.project-status";
  schemaVersion: 1;
  installedWorkers: ProjectStatusItem[];
  activeWorker: string | null;
  activeCards: ProjectStatusItem[];
  selectionSource: "project" | "local";
  localOverrides: {
    activeWorker: string | null;
    cardReplacements: string[];
    localOnlyRoots: string[];
    sourceOverrides: string[];
  };
  projectOverlays: {
    skills: ProjectStatusItem[];
    mcp: ProjectStatusItem[];
    extensions: ProjectStatusItem[];
    targets: ProjectStatusItem[];
    hookControls: ProjectStatusItem[];
  };
  declaredCapabilities: {
    skills: ProjectStatusItem[];
    mcp: ProjectStatusItem[];
    hooks: ProjectStatusItem[];
  };
  ambientCapabilities: {
    observations: Awaited<ReturnType<typeof inspectAmbientCapabilities>>;
    collisions: AmbientCollision[];
    enforcement: "target-native";
  };
  projection: { current: boolean; issues: string[] };
  instructionDelivery: {
    state: "absent" | "current" | "drifted" | "blocked";
    instructionId?: string;
    contentDigest?: string;
    ownershipHash?: string;
    adapter: "absent" | "owned" | "foreign-valid" | "foreign-missing" | "drifted";
    issues: Array<{
      code:
        | "INSTRUCTIONS_BLOCK_MALFORMED"
        | "INSTRUCTIONS_CONTENT_STALE"
        | "INSTRUCTIONS_OWNERSHIP_DRIFT"
        | "INSTRUCTIONS_ID_STALE"
        | "INSTRUCTIONS_CONSENT_REQUIRED"
        | "CLAUDE_ADAPTER_MISSING"
        | "CLAUDE_ADAPTER_DRIFT";
      severity: "error" | "warning" | "advisory";
    }>;
  };
}

export interface MachineStatusCapability {
  id: string;
  provenance: "profile" | "explicit";
  profileId?: "darwinian-operator";
  source: "profile" | "repo" | "package" | "registry" | "library";
  status: "resolved" | "missing";
}

export interface MachineStatusV1 {
  schema: "drwn.machine-status";
  schemaVersion: 1;
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  enabledTargets: string[];
  config: { schema: "drwn.machine"; schemaVersion: 1 };
  profile: (NonNullable<Awaited<ReturnType<typeof readMachineConfig>>["capabilities"]["profile"]> & {
    status: "verified" | "missing" | "invalid";
    issueCode?: string;
  }) | null;
  capabilities: {
    skills: MachineStatusCapability[];
    mcpServers: MachineStatusCapability[];
    counts: {
      resolvedSkills: number;
      missingSkills: number;
      resolvedMcpServers: number;
      missingMcpServers: number;
    };
  };
  projection: {
    healthy: boolean;
    current: boolean;
    recordPresent: boolean;
    conflicts: MachineProjectionConflict[];
    issues: string[];
  };
  inventory: { skillCount: number; mcpServerCount: number };
}

export async function buildMachineStatusV1(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
): Promise<MachineStatusV1> {
  const [machine, repoConfig, builtInRegistry, skillInventory, userMcpLibrary] = await Promise.all([
    readMachineConfig(agentsDir),
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
    loadMcpLibrary(agentsDir),
  ]);
  const { config: effectiveConfig } = await loadEffectiveConfig(repoConfig, agentsDir);
  const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
  const skillById = new Map(skillInventory.map((skill) => [skill.name, skill]));
  const profileSkillIds = new Set(machine.capabilities.profile?.skills ?? []);
  const profileMcpIds = new Set(machine.capabilities.profile?.mcpServers ?? []);
  const issues: string[] = [];
  let profileStatus: "verified" | "missing" | "invalid" = "verified";
  let profileIssueCode: string | undefined;

  if (machine.capabilities.profile) {
    try {
      await verifyMachineProfilePin(agentsDir, machine.capabilities.profile);
    } catch (error) {
      if (!(error instanceof DrwnError)) throw error;
      profileStatus = error.code === "MACHINE_PROFILE_NOT_AVAILABLE" ? "missing" : "invalid";
      profileIssueCode = error.code;
      issues.push(`${error.code}: ${error.message}`);
    }
  }

  const skills: MachineStatusCapability[] = [
    ...(machine.capabilities.profile?.skills ?? []).map((id) => ({
      id,
      provenance: "profile" as const,
      profileId: "darwinian-operator" as const,
      source: "profile" as const,
      status: profileStatus === "verified" ? "resolved" as const : "missing" as const,
    })),
    ...machine.capabilities.skills
      .filter((id) => !profileSkillIds.has(id))
      .map((id) => {
        const skill = skillById.get(id);
        return {
          id,
          provenance: "explicit" as const,
          source: skill?.sourceType === "npm" ? "package" as const : "repo" as const,
          status: skill ? "resolved" as const : "missing" as const,
        };
      }),
  ];
  const mcpServers: MachineStatusCapability[] = [
    ...(machine.capabilities.profile?.mcpServers ?? []).map((id) => ({
      id,
      provenance: "profile" as const,
      profileId: "darwinian-operator" as const,
      source: "profile" as const,
      status: profileStatus === "verified" ? "resolved" as const : "missing" as const,
    })),
    ...machine.capabilities.mcpServers
      .filter((id) => !profileMcpIds.has(id))
      .map((id) => {
        const server = registry.servers[id];
        const resolved = Boolean(server && server.transport !== "platform-provided");
        return {
          id,
          provenance: "explicit" as const,
          source: userMcpLibrary.servers[id] ? "library" as const : "registry" as const,
          status: resolved ? "resolved" as const : "missing" as const,
        };
      }),
  ];
  for (const skill of skills.filter((entry) => entry.status === "missing" && entry.provenance === "explicit")) {
    issues.push(`MACHINE_CAPABILITY_NOT_FOUND: Explicit machine skill is not available in machine inventory: ${skill.id}`);
  }
  for (const server of mcpServers.filter((entry) => entry.status === "missing" && entry.provenance === "explicit")) {
    issues.push(`MACHINE_CAPABILITY_NOT_FOUND: Explicit machine MCP server is not available in machine inventory: ${server.id}`);
  }

  const machineRecordPath = resolveGlobalWriteRecordPath(agentsDir);
  let record = null;
  try {
    record = loadWriteRecord(machineRecordPath, "machine");
  } catch (error) {
    if (!(error instanceof DrwnError)) throw error;
    issues.push(`${error.code}: ${error.message}`);
  }
  let conflicts: MachineProjectionConflict[] = [];
  let current = false;
  if (issues.length === 0) {
    const state = await buildEffectiveState({
      repoRoot,
      agentsDir,
      homeDir,
      dryRun: true,
      forceMachineScope: true,
      scope: "machine",
    });
    conflicts = collectMachineProjectionConflicts(state, record);
    const difference = diffWriteRecord(record, planMachineManagedPaths(state));
    current = conflicts.length === 0 && difference.toAdd.length === 0 && difference.toRemove.length === 0;
  }

  const counts = {
    resolvedSkills: skills.filter((entry) => entry.status === "resolved").length,
    missingSkills: skills.filter((entry) => entry.status === "missing").length,
    resolvedMcpServers: mcpServers.filter((entry) => entry.status === "resolved").length,
    missingMcpServers: mcpServers.filter((entry) => entry.status === "missing").length,
  };
  return {
    schema: "drwn.machine-status",
    schemaVersion: 1,
    repoRoot,
    agentsDir,
    homeDir,
    enabledTargets: Object.entries(effectiveConfig.targets).filter(([, target]) => target.enabled).map(([id]) => id),
    config: { schema: machine.schema, schemaVersion: machine.schemaVersion },
    profile: machine.capabilities.profile
      ? { ...machine.capabilities.profile, status: profileStatus, ...(profileIssueCode ? { issueCode: profileIssueCode } : {}) }
      : null,
    capabilities: { skills, mcpServers, counts },
    projection: {
      healthy: issues.length === 0 && conflicts.length === 0,
      current,
      recordPresent: existsSync(machineRecordPath),
      conflicts,
      issues,
    },
    inventory: { skillCount: skillInventory.length, mcpServerCount: Object.keys(userMcpLibrary.servers).length },
  };
}

function projectItem(
  id: string,
  sourceKind: ProjectStatusItem["sourceKind"],
  sourceId: string,
  sourcePath: string,
  target: string,
  health: ProjectStatusItem["health"] = "declared",
): ProjectStatusItem {
  return { id, sourceKind, sourceId, sourcePath, target, health };
}

function inspectInstructionDelivery(
  state: EffectiveState,
): ProjectStatusV1["instructionDelivery"] {
  const issues: ProjectStatusV1["instructionDelivery"]["issues"] = [];
  const composition = instructionCompositionForState(state);
  for (const _excluded of composition.excluded) {
    issues.push({ code: "INSTRUCTIONS_CONSENT_REQUIRED", severity: "error" });
  }
  let record: ReturnType<typeof loadWriteRecord> = null;
  try {
    record = loadWriteRecord(state.recordPath, "project");
  } catch (error) {
    if (!(error instanceof DrwnError) || error.code !== "WRITE_RECORD_INVALID") {
      throw error;
    }
  }
  const instructionEntry = record?.managedPaths.find(
    (entry) => entry.surface === "instructions" && entry.path === "AGENTS.md",
  );
  const expectedOwnership =
    instructionEntry?.kind === "managed-fields"
      ? instructionEntry.fieldHashes["drwn:instructions"]
      : undefined;
  const agentsPath = join(state.projectRoot!, "AGENTS.md");
  const agentsBytes = existsSync(agentsPath)
    ? new Uint8Array(readFileSync(agentsPath))
    : new Uint8Array();
  const parsed = parseManagedBlock(agentsBytes, INSTRUCTION_BLOCK_MARKERS);
  let ownershipHash: string | undefined;
  let instructionId: string | undefined;
  let stateValue: ProjectStatusV1["instructionDelivery"]["state"] = "absent";
  if (parsed.state === "malformed") {
    issues.push({ code: "INSTRUCTIONS_BLOCK_MALFORMED", severity: "error" });
    stateValue = "blocked";
  } else if (parsed.state === "present") {
    ownershipHash = hashManagedContent(parsed.block);
    const blockText = new TextDecoder().decode(parsed.block);
    instructionId = blockText.match(/^Instruction-ID:\s*(.+)$/m)?.[1];
    const expectedId = `worker:${state.workerSelection?.selectedRoot?.name ?? "none"}`;
    if (instructionId !== expectedId) {
      issues.push({ code: "INSTRUCTIONS_ID_STALE", severity: "error" });
    }
    if (!expectedOwnership || ownershipHash !== expectedOwnership) {
      issues.push({ code: "INSTRUCTIONS_OWNERSHIP_DRIFT", severity: "error" });
    }
    if (
      composition.contentDigest &&
      !blockText.includes(`Content-Digest: ${composition.contentDigest}`)
    ) {
      issues.push({ code: "INSTRUCTIONS_CONTENT_STALE", severity: "error" });
    }
    stateValue = issues.some((issue) => issue.severity === "error")
      ? "drifted"
      : "current";
  } else if (composition.bytes) {
    issues.push({ code: "INSTRUCTIONS_CONTENT_STALE", severity: "error" });
    stateValue = "drifted";
  }

  const adapterPath = join(state.projectRoot!, ".claude", "CLAUDE.md");
  let adapter: ProjectStatusV1["instructionDelivery"]["adapter"] = "absent";
  if (existsSync(adapterPath)) {
    const bytes = new Uint8Array(readFileSync(adapterPath));
    const text = new TextDecoder().decode(bytes);
    const adapterEntry = record?.managedPaths.find(
      (entry) =>
        entry.surface === "instructions" &&
        entry.path === ".claude/CLAUDE.md",
    );
    const adapterBlock = parseManagedBlock(bytes, CLAUDE_ADAPTER_BLOCK_MARKERS);
    if (adapterBlock.state === "malformed") {
      adapter = "drifted";
      issues.push({ code: "CLAUDE_ADAPTER_DRIFT", severity: "warning" });
    } else if (
      adapterEntry?.kind === "managed-content" &&
      hashManagedContent(bytes) === adapterEntry.contentHash
    ) {
      adapter = "owned";
    } else if (
      adapterEntry?.kind === "managed-fields" &&
      adapterBlock.state === "present" &&
      hashManagedContent(adapterBlock.block) ===
        adapterEntry.fieldHashes["drwn:claude-adapter"]
    ) {
      adapter = "owned";
    } else if (/^\s*@\.\.\/AGENTS\.md\s*$/m.test(text)) {
      adapter = "foreign-valid";
    } else if (adapterEntry) {
      adapter = "drifted";
      issues.push({ code: "CLAUDE_ADAPTER_DRIFT", severity: "warning" });
    } else {
      adapter = "foreign-missing";
      if (composition.bytes) {
        issues.push({ code: "CLAUDE_ADAPTER_MISSING", severity: "advisory" });
      }
    }
  } else if (composition.bytes) {
    issues.push({ code: "CLAUDE_ADAPTER_MISSING", severity: "advisory" });
  }

  return {
    state: stateValue,
    ...(instructionId ? { instructionId } : {}),
    ...(composition.contentDigest
      ? { contentDigest: composition.contentDigest }
      : {}),
    ...(ownershipHash ? { ownershipHash } : {}),
    adapter,
    issues,
  };
}

export async function buildProjectStatusV1(options: {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  projectConfigPath?: string | null;
}): Promise<ProjectStatusV1 | null> {
  if (!options.projectConfigPath) return null;
  const projectRoot = resolveProjectRootFromConfigPath(options.projectConfigPath);
  const state = await buildEffectiveState({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    cwd: projectRoot,
  });
  if (!state.projectConfig || !state.workerSelection) return null;
  const configPath = state.projectConfigPath!;
  const cardByName = new Map(state.lockedCards.map((card) => [card.name, card]));
  const installedWorkers = state.workerSelection.installedRoots.map((root) => {
    const card = cardByName.get(root.name);
    const sourceKind = state.cardLanes[root.name] === "localOverlay" ? "local-overlay" : "worker-root";
    return projectItem(root.name, sourceKind, root.requested, card?.path ?? configPath, "project", "installed");
  });
  const activeCards = state.activeCards.map((card) => {
    const sourceKind = state.cardLanes[card.name] === "localOverlay" ? "local-overlay" : "card";
    return projectItem(
      card.name,
      sourceKind,
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "project",
      "active",
    );
  });
  const overlayItem = (id: string, target: string) => projectItem(id, "project-overlay", id, configPath, target);
  const projectOverlays = {
    skills: [
      ...(state.projectConfig.skills?.include ?? []).map((id) => overlayItem(id, "skills:include")),
      ...(state.projectConfig.skills?.exclude ?? []).map((id) => overlayItem(id, "skills:exclude")),
    ],
    mcp: Object.keys(state.projectConfig.mcpServers ?? {}).sort().map((id) => overlayItem(id, "mcp")),
    extensions: Object.keys(state.projectConfig.extensions ?? {}).sort().map((id) => overlayItem(id, "extension")),
    targets: Object.keys(state.projectConfig.targets ?? {}).sort().map((id) => overlayItem(id, "target")),
    hookControls: Object.keys(state.projectConfig.hooks ?? {}).sort().map((id) => overlayItem(id, "hooks")),
  };
  const skillItems = state.activeCards.flatMap((card) =>
    card.skills.map((id) => projectItem(
      id,
      "card",
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "skills",
      "active",
    )),
  );
  for (const id of state.projectConfig.skills?.include ?? []) {
    if (!skillItems.some((entry) => entry.id === id)) skillItems.push(overlayItem(id, "skills"));
  }
  const mcpItems = state.cardServerDefinitions
    .filter((definition) => Object.hasOwn(state.activeServers, definition.serverName))
    .map((definition) => {
      const card = cardByName.get(definition.cardName);
      return projectItem(
        definition.serverName,
        "card",
        `${definition.cardName}@${definition.cardVersion}`,
        card ? (state.contentRootsByCard[card.name] ?? card.path) : configPath,
        "mcp",
        "active",
      );
    });
  for (const id of Object.keys(state.projectConfig.mcpServers ?? {})) {
    if (Object.hasOwn(state.activeServers, id) && !mcpItems.some((entry) => entry.id === id)) {
      mcpItems.push(overlayItem(id, "mcp"));
    }
  }
  const hookItems = state.activeCards.flatMap((card) =>
    card.hooks.map((id) => projectItem(
      id,
      "card",
      `${card.name}@${card.version}`,
      state.contentRootsByCard[card.name] ?? card.path,
      "hooks",
      "active",
    )),
  );
  const ambient = await inspectAmbientCapabilities({
    config: state.repoConfig,
    homeDir: options.homeDir,
    declaredSkillIds: skillItems.map((entry) => entry.id),
    declaredMcpIds: mcpItems.map((entry) => entry.id),
  });
  const projection = await planRepositoryProjection({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    cwd: projectRoot,
  });
  return {
    schema: "drwn.project-status",
    schemaVersion: 1,
    installedWorkers,
    activeWorker: state.workerSelection.activeWorker,
    activeCards,
    selectionSource: state.workerSelection.selectionSource,
    localOverrides: { ...state.workerSelection.localOverrides },
    projectOverlays,
    declaredCapabilities: { skills: skillItems, mcp: mcpItems, hooks: hookItems },
    ambientCapabilities: {
      observations: ambient,
      collisions: state.ambientCollisions,
      enforcement: "target-native",
    },
    projection: { current: projection.current, issues: projection.issues },
    instructionDelivery: inspectInstructionDelivery(state),
  };
}

export async function buildStatusReport(repoRoot: string, agentsDir: string, homeDir: string, projectConfigPath?: string | null) {
  const machineStatus = await buildMachineStatusV1(repoRoot, agentsDir, homeDir);
  let projectSummary: ReturnType<typeof summarizeProjectConfig> | undefined;

  if (projectConfigPath) {
    const state = await buildEffectiveState({
      repoRoot,
      agentsDir,
      homeDir,
      cwd: resolveProjectRootFromConfigPath(projectConfigPath),
    });
    projectSummary = state.projectConfig ? summarizeProjectConfig(state.projectConfig) : undefined;
  }

  return {
    ...machineStatus,
    project: projectSummary && projectConfigPath
      ? {
          configPath: projectConfigPath,
          ...projectSummary,
        }
      : undefined,
  };
}

function readWriteRecordStatus(
  path: string,
  scope: "project" | "machine",
): DiagnosticsSections["writeRecord"] {
  const present = existsSync(path);
  let record = null;
  let corrupt = false;
  try {
    record = loadWriteRecord(path, scope);
  } catch (error) {
    if (!(error instanceof DrwnError) || error.code !== "WRITE_RECORD_INVALID") throw error;
    corrupt = true;
  }
  return {
    path,
    present,
    corrupt,
    managedPathCount: record?.managedPaths.length ?? 0,
    lastWriteAt: record?.lastWriteAt,
    lastWriteHarnessVersion: record?.lastWriteHarnessVersion,
  };
}

function currentStateStatus(agentsDir: string): DiagnosticsSections["store"] {
  const metadataPath = resolveStoreMetadataPath(agentsDir);
  const countMarkedDirectories = (root: string, marker: string) => {
    if (!existsSync(root)) return 0;
    let count = 0;
    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      if (entries.some((entry) => entry.name === marker && (entry.isFile() || entry.isSymbolicLink()))) {
        count += 1;
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
      }
    };
    walk(root);
    return count;
  };
  const countJsonRecords = (root: string) => existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("."))
        .length
    : 0;
  let schemaVersion: number | null = null;
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { schemaVersion?: unknown };
    schemaVersion = typeof metadata.schemaVersion === "number" ? metadata.schemaVersion : null;
  }
  return {
    path: resolveStoreRoot(agentsDir),
    initialized: existsSync(metadataPath),
    schemaVersion,
    cardCount: countMarkedDirectories(resolveCardsRoot(agentsDir), "HEAD"),
    sourceCount: countMarkedDirectories(resolveSourcesRoot(agentsDir), "card.json"),
    skillBundleCount: countMarkedDirectories(resolveStoreSkillsRoot(agentsDir), "current"),
    mcpServerCount: countJsonRecords(resolveStoreMcpServersDir(agentsDir)),
  };
}

export async function buildDiagnosticsSections(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DiagnosticsSections> {
  const [repoConfig, repoSkills, store, machineStatus] = await Promise.all([
    loadConfig(repoRoot),
    listRepoSkills(repoRoot),
    currentStateStatus(agentsDir),
    buildMachineStatusV1(repoRoot, agentsDir, homeDir),
  ]);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const projectState = projectConfigPath
    ? await buildEffectiveState({
        repoRoot,
        agentsDir,
        homeDir,
        cwd: resolveProjectRootFromConfigPath(projectConfigPath),
      })
    : null;
  const projectRoot = projectState?.projectRoot ?? null;
  const projectConfig = projectState?.projectConfig ?? null;
  const cardLocks = projectState?.activeCards ?? [];
  const effectiveConfig = projectState?.effectiveConfig ?? loadedConfig.config;
  const activeServers = projectState?.activeServers ?? {};
  const lock = projectRoot ? await loadCardLock(projectRoot) : null;
  const writeRecordPath = projectRoot ? resolveProjectWriteRecordPath(projectRoot) : resolveGlobalWriteRecordPath(agentsDir);

  const cardIncludes = cardLocks.flatMap((card) =>
    (card.manifest.skills?.include ?? []).map((skill) => ({ card: `${card.name}@${card.version}`, skill })),
  );
  const cardServers = cardLocks.flatMap((card) =>
    Object.keys(card.manifest.servers ?? {}).map((server) => ({ card: `${card.name}@${card.version}`, server })),
  );

  return {
    machine: { repoRoot, agentsDir, homeDir },
    project: projectConfigPath && projectRoot && projectConfig
      ? { configPath: projectConfigPath, root: projectRoot, cardCount: projectConfig.workers.length }
      : undefined,
    store,
    writeRecord: readWriteRecordStatus(writeRecordPath, projectRoot ? "project" : "machine"),
    skills: {
      inventoryCount: repoSkills.length,
      activeCount: projectState
        ? new Set(stateSkillNames(projectState)).size
        : machineStatus.capabilities.counts.resolvedSkills,
      projectIncludes: projectConfig?.skills?.include ?? [],
      projectExcludes: projectConfig?.skills?.exclude ?? [],
      cardIncludes,
    },
    mcp: {
      activeServerCount: projectState
        ? Object.keys(activeServers).length
        : machineStatus.capabilities.counts.resolvedMcpServers,
      projectServers: Object.keys(projectConfig?.mcpServers ?? {}),
      cardServers,
    },
    extensions: {
      projectExtensions: Object.keys(projectConfig?.extensions ?? {}),
    },
    cards: {
      configuredRefs: projectConfig?.workers ?? [],
      lockedVersions: (lock?.cards ?? []).map((card) => `${card.name}@${card.version}`),
      warnings: [],
    },
    versionFloor: evaluateVersionFloor(lock?.store?.minDrwnVersion),
    targets: {
      enabled: Object.entries(effectiveConfig.targets)
        .filter(([, target]) => target.enabled)
        .map(([name]) => name),
      projectOverrides: Object.entries(projectConfig?.targets ?? {}).map(([name, override]) =>
        `${name} ${override.enabled ? "enabled" : "disabled"}`,
      ),
    },
  };
}

function stateSkillNames(state: Pick<EffectiveState, "skillSelection">) {
  return state.skillSelection?.include ?? [];
}

export interface WhyAnswer {
  ok: boolean;
  message: string;
}

type WhyMatch = { kind: "skill" | "server" | "extension" | "target" | "card"; name: string; message: string };

function splitWhyQuery(query: string) {
  const match = query.match(/^(skill|server|extension|target|card):(.+)$/);
  return match ? { kind: match[1] as WhyMatch["kind"], name: match[2] ?? "" } : { kind: null, name: query };
}

function formatAmbiguous(name: string, matches: WhyMatch[]) {
  return `ambiguous: ${name} matched ${matches.map((match) => `${match.kind}:${match.name}`).join(", ")}\n`;
}

async function collectWhyMatches(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath: string | null | undefined,
  name: string,
) {
  const matches: WhyMatch[] = [];
  const [repoConfig, registry, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const userMcpLibrary = await loadMcpLibrary(agentsDir);
  const baseRegistry = mergeUserMcpLibrary(registry, userMcpLibrary);
  const loadedConfig = await loadEffectiveConfig(repoConfig, agentsDir);
  const projectState = projectConfigPath
    ? await buildEffectiveState({
        repoRoot,
        agentsDir,
        homeDir,
        cwd: resolveProjectRootFromConfigPath(projectConfigPath),
      })
    : null;
  const projectConfig = projectState?.projectConfig ?? null;
  const cardLocks = projectState?.activeCards ?? [];
  const effectiveConfig = projectState?.effectiveConfig ?? loadedConfig.config;
  const effectiveRegistry = projectState?.effectiveRegistry ?? baseRegistry;
  const machineStatus = projectState ? null : await buildMachineStatusV1(repoRoot, agentsDir, homeDir);
  const activeServerNames = new Set(
    projectState
      ? Object.keys(projectState.activeServers)
      : machineStatus?.capabilities.mcpServers.filter((server) => server.status === "resolved").map((server) => server.id),
  );

  const cardSkill = cardLocks.find((card) => card.manifest.skills?.include?.includes(name));
  const projectSkill = projectConfig?.skills?.include?.includes(name);
  const machineSkill = machineStatus?.capabilities.skills.find((skill) => skill.id === name);
  const inventorySkill = skillInventory.find((skill) => skill.name === name);
  if (cardSkill || projectSkill || machineSkill || inventorySkill) {
    const source = cardSkill
      ? `card ${cardSkill.name}@${cardSkill.version}`
      : projectSkill
        ? "project config"
        : machineSkill
          ? machineSkill.provenance === "profile" ? "machine profile" : "explicit machine selection"
          : "repo or installed skill inventory";
    const state = cardSkill || projectSkill || (machineSkill?.status === "resolved") ? "active" : "available";
    matches.push({ kind: "skill", name, message: `skill:${name} is ${state} from ${source}.\n` });
  }

  const cardServer = cardLocks.find((card) => Object.hasOwn(card.manifest.servers ?? {}, name));
  const projectServer = projectConfig?.mcpServers && Object.hasOwn(projectConfig.mcpServers, name);
  const machineServer = machineStatus?.capabilities.mcpServers.find((server) => server.id === name);
  const registryServer = effectiveRegistry.servers[name];
  if (cardServer || projectServer || machineServer || registryServer) {
    const active = activeServerNames.has(name);
    const source = cardServer
      ? `card ${cardServer.name}@${cardServer.version}`
      : projectServer
        ? "project config"
        : machineServer
          ? machineServer.provenance === "profile" ? "machine profile" : "explicit machine selection"
          : "registry or standalone machine inventory";
    matches.push({ kind: "server", name, message: `server:${name} is ${active ? "active" : "available"} from ${source}.\n` });
  }

  if ((projectConfig?.extensions && Object.hasOwn(projectConfig.extensions, name)) || getExtension(name)) {
    const source = projectConfig?.extensions && Object.hasOwn(projectConfig.extensions, name) ? "project config" : "extension registry";
    matches.push({ kind: "extension", name, message: `extension:${name} is known from ${source}.\n` });
  }

  if (name === "claude" || name === "codex" || name === "cursor" || name === "opencode") {
    const override = projectConfig?.targets?.[name];
    const enabled = effectiveConfig.targets[name].enabled;
    matches.push({
      kind: "target",
      name,
      message: `target:${name} is ${enabled ? "enabled" : "disabled"}${override ? " by project config" : " by machine config"}.\n`,
    });
  }

  const card = cardLocks.find((entry) => entry.name === name || `${entry.name}@${entry.version}` === name);
  if (card) {
    matches.push({ kind: "card", name: card.name, message: `card:${card.name} is locked at ${card.version} from ${card.requested}.\n` });
  }

  return matches;
}

export async function explainStatus(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
) {
  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir, projectConfigPath);
  return [
    "Machine",
    `- repo: ${sections.machine.repoRoot}`,
    `- agents: ${sections.machine.agentsDir}`,
    "Store",
    `- path: ${sections.store.path}`,
    `- schema: ${sections.store.schemaVersion ?? "none"}`,
    "Cards",
    `- configured: ${sections.cards.configuredRefs.join(", ") || "none"}`,
    `- locked: ${sections.cards.lockedVersions.join(", ") || "none"}`,
    "Skills",
    `- project includes: ${sections.skills.projectIncludes.join(", ") || "none"}`,
    `- card includes: ${sections.skills.cardIncludes.map((entry) => `${entry.skill} from ${entry.card}`).join(", ") || "none"}`,
    "MCP",
    `- card servers: ${sections.mcp.cardServers.map((entry) => `${entry.server} from ${entry.card}`).join(", ") || "none"}`,
    "Targets",
    `- enabled: ${sections.targets.enabled.join(", ") || "none"}`,
    "Write record",
    `- ${sections.writeRecord.present ? `${sections.writeRecord.managedPathCount} managed paths` : "missing"}`,
  ].join("\n") + "\n";
}

export async function answerWhy(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath: string | null | undefined,
  query: string,
): Promise<WhyAnswer> {
  const parsed = splitWhyQuery(query);
  const matches = await collectWhyMatches(repoRoot, agentsDir, homeDir, projectConfigPath, parsed.name);
  const filtered = parsed.kind ? matches.filter((match) => match.kind === parsed.kind) : matches;
  if (filtered.length === 0) {
    return { ok: false, message: `not found: ${query}\n` };
  }
  if (!parsed.kind && filtered.length > 1) {
    return { ok: false, message: formatAmbiguous(parsed.name, filtered) };
  }
  return { ok: true, message: filtered[0]?.message ?? "" };
}

async function detectBrokenSymlinks(paths: string[]) {
  return paths.filter((pathValue) => lstatSafe(pathValue)?.isSymbolicLink() && !existsSync(pathValue));
}

async function detectStaleSkillSymlinks(
  repoRoot: string,
  agentsDir: string,
  toolRoot: string,
  skillOverrides?: { include?: string[]; exclude?: string[] },
  lockedCards: CardLockEntry[] = [],
) {
  const toolPaths = resolveToolPaths(toolRoot);
  const excluded = new Set(skillOverrides?.exclude ?? []);
  const resolvedSources = await Promise.all(
    (skillOverrides?.include ?? [])
      .filter((name) => !excluded.has(name))
      .map(async (name) => ({
        name,
        source: await resolveSkillSource(name, lockedCards, repoRoot, agentsDir),
      })),
  );
  const desiredClaude = new Set([
    ...resolvedSources
      .filter((entry) =>
        entry.source.layer === "card" ||
        (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "claude-only"))
      )
      .map((entry) => entry.name),
  ]);
  const desiredCodex = new Set([
    ...resolvedSources
      .filter((entry) =>
        entry.source.layer === "card" ||
        (entry.source.layer === "user-default" && (entry.source.scope === "shared" || entry.source.scope === "codex-only"))
      )
      .map((entry) => entry.name),
  ]);

  return [
    ...(await findStaleManagedEntries(toolPaths.claudeSkills, desiredClaude)),
    ...(await findStaleManagedEntries(toolPaths.codexSkills, desiredCodex)),
  ];
}

export async function detectMcpDrift(
  config: CanonicalConfig,
  activeServers: Record<string, RegistryServer>,
  toolRoot: string,
) {
  const drifts: string[] = [];
  const toolPaths = resolveToolPaths(toolRoot);

  for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.enabled) {
      continue;
    }

    const configPath = targetName === "claude"
      ? toolPaths.claudeMcp
      : targetName === "codex"
        ? toolPaths.codexConfig
        : targetName === "opencode"
          ? toolPaths.opencodeConfig
          : toolPaths.cursorMcp;

    if (targetName === "claude" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = renderJsonMcpConfig(activeServers);
      if (current !== expected) {
        drifts.push(`claude:${configPath}`);
      }
    }

    if (targetName === "codex" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const expected = mergeCodexTomlText(current, activeServers);
      const names = Object.keys(activeServers);
      const currentHashes = hashCodexManagedServers(current, names);
      const expectedHashes = hashCodexManagedServers(expected, names);
      if (names.some((name) => currentHashes[name] !== expectedHashes[name])) {
        drifts.push(`codex:${configPath}`);
      }
    }

    if (targetName === "opencode" && existsSync(configPath)) {
      const names = Object.keys(activeServers);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      } catch {
        drifts.push(`opencode:${configPath}`);
        parsed = {};
      }
      const rawServers = parsed.mcp;
      const currentServers = rawServers && typeof rawServers === "object" && !Array.isArray(rawServers)
        ? rawServers as Record<string, unknown>
        : {};
      const drifted = names.some((name) => {
        const currentValue = currentServers[name];
        if (currentValue === undefined) return true;
        return canonicalJsonHash(currentValue) !== canonicalJsonHash(renderMcpServerForTarget("opencode", activeServers[name]!));
      });
      if (drifted && !drifts.includes(`opencode:${configPath}`)) {
        drifts.push(`opencode:${configPath}`);
      }
    }

    if (targetName === "cursor" && existsSync(configPath)) {
      const current = readFileSync(configPath, "utf8");
      const names = Object.keys(activeServers);
      const currentHashes = hashClaudeManagedServers(current, names);
      const drifted = names.some((name) => {
        const expected = canonicalJsonHash(renderMcpServerForTarget("cursor", activeServers[name]!));
        return currentHashes[mcpServerHashKey(name)] !== expected;
      });
      if (drifted) {
        drifts.push(`cursor:${configPath}`);
      }
    }
  }

  return drifts;
}

async function detectMissingGeneratedFiles(_config: CanonicalConfig, _generatedDir: string) {
  // Cursor MCP config is now written directly as managed content, so there is no
  // generated sidecar file that can go missing. Retained for output-shape stability.
  return [] as string[];
}

function detectHookIssues(cards: CardLockEntry[], generatedDir: string) {
  const issues: string[] = [];
  for (const card of cards) {
    if (card.hooks.length > 0 && !isHookConsentValid(card)) {
      issues.push(`Card ${card.name}@${card.version} has hooks without valid consent. Run drwn card trust ${card.name} --hooks.`);
    }
  }

  for (const pathValue of generatedComposerPaths(generatedDir)) {
    if (!existsSync(pathValue)) {
      continue;
    }
    const match = readFileSync(pathValue, "utf8").match(/drwn-version:\s*([^\s]+)/);
    if (match && match[1] !== DRWN_VERSION) {
      issues.push(`composer stale; rerun drwn write: ${pathValue}`);
    }
  }

  return issues;
}

function generatedComposerPaths(generatedDir: string) {
  const paths = [
    join(generatedDir, "hooks", "claude", "composer.mjs"),
    join(generatedDir, "hooks", "codex", "composer.mjs"),
    join(generatedDir, "hooks", "mastra", "composer.ts"),
  ];
  const workersDir = join(generatedDir, "workers");
  if (!existsSync(workersDir)) {
    return paths;
  }

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const pathValue = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(pathValue);
        continue;
      }
      if (entry.isFile() && (entry.name === "composer.mjs" || entry.name === "composer.ts")) {
        paths.push(pathValue);
      }
    }
  }

  walk(workersDir);
  return paths;
}

function buildSurfaceNotes(config: { targets: Record<string, { enabled: boolean }> }): string[] {
  const notes: string[] = [];
  for (const name of ALL_TARGET_NAMES) {
    const descriptor = getTargetDescriptor(name);
    if (config.targets[name]?.enabled && descriptor.surfaces.includes("cowork")) {
      notes.push(
        `The ${name} target also serves the Cowork surface; materialized skills, MCP servers, and hooks apply there too. ` +
          `Cowork runs in a workspace-trust VM, so review its trust and snapshot prompts.`,
      );
    }
  }
  return notes;
}

function isExecutableOnPath(command: string): boolean {
  const isWindows = process.platform === "win32";
  const exts = isWindows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(isWindows ? ";" : ":");
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      if (existsSync(join(dir, `${command}${ext}`))) {
        return true;
      }
    }
  }
  return false;
}

function buildPlatformChecks(): PlatformCheck[] {
  const home = resolveHomeDir(process.env);
  const nodeOnPath = isExecutableOnPath("node");
  return [
    { name: "home directory resolves to a non-empty path", ok: home.length > 0, detail: home || "(empty)" },
    {
      name: "node resolvable on PATH (for MCP servers that spawn node)",
      ok: nodeOnPath,
      detail: nodeOnPath ? undefined : "node not found on PATH",
    },
  ];
}

export async function buildDoctorReport(repoRoot: string, agentsDir: string, homeDir: string): Promise<DoctorReport> {
  const toolPaths = resolveToolPaths(homeDir);
  const generatedDir = resolveStoreGeneratedDir(agentsDir);
  const [repoConfig, sections, machineStatus] = await Promise.all([
    loadConfig(repoRoot),
    buildDiagnosticsSections(repoRoot, agentsDir, homeDir),
    buildMachineStatusV1(repoRoot, agentsDir, homeDir),
  ]);
  const { config } = await loadEffectiveConfig(repoConfig, agentsDir);
  let machineRecord = null;
  try {
    machineRecord = loadWriteRecord(resolveGlobalWriteRecordPath(agentsDir), "machine");
  } catch (error) {
    if (!(error instanceof DrwnError) || error.code !== "WRITE_RECORD_INVALID") throw error;
  }
  let staleSkillSymlinks: string[] = [];
  if (machineStatus.projection.issues.length === 0) {
    const machineState = await buildEffectiveState({
      repoRoot,
      agentsDir,
      homeDir,
      dryRun: true,
      forceMachineScope: true,
      scope: "machine",
    });
    staleSkillSymlinks = diffWriteRecord(machineRecord, planMachineManagedPaths(machineState)).toRemove
      .filter((entry) => entry.kind === "managed-directory" && isMachineSkillPath(entry.path))
      .map((entry) => join(homeDir, entry.path))
      .filter((pathValue) => lstatSafe(pathValue) !== null);
  }
  const machineProjectionConflicts = machineStatus.projection.conflicts.map((conflict) => conflict.message);
  return {
    brokenSymlinks: await detectBrokenSymlinks([
      ...((existsSync(toolPaths.claudeSkills) ? Object.keys(readDirLinks(toolPaths.claudeSkills)) : []) as string[]).map((name) =>
        join(toolPaths.claudeSkills, name),
      ),
      ...((existsSync(toolPaths.codexSkills) ? Object.keys(readDirLinks(toolPaths.codexSkills)) : []) as string[]).map((name) =>
        join(toolPaths.codexSkills, name),
      ),
    ]),
    staleSkillSymlinks,
    mcpDrift: machineStatus.projection.conflicts
      .filter((conflict) => conflict.kind === "drift")
      .flatMap((conflict) => machineMcpDriftLabel(config, homeDir, conflict.path)),
    machineProjectionConflicts,
    machineCapabilityIssues: machineStatus.projection.issues,
    missingGeneratedFiles: await detectMissingGeneratedFiles(config, generatedDir),
    hookIssues: [],
    projectConfigIssues: [],
    surfaceNotes: buildSurfaceNotes(config),
    platformChecks: buildPlatformChecks(),
    ambientMcpCollisions: [],
    cards: sections.cards,
    store: sections.store,
    writeRecord: sections.writeRecord,
  };
}

function isMachineSkillPath(pathValue: string) {
  return pathValue.startsWith(".claude/skills/") || pathValue.startsWith(".codex/skills/");
}

function machineMcpDriftLabel(config: CanonicalConfig, homeDir: string, pathValue: string): string[] {
  return Object.entries(config.targets).flatMap(([target, targetConfig]) => {
    const configPath = expandHomePath(
      target === "claude" ? (targetConfig.userMcpPath ?? targetConfig.configPath) : targetConfig.configPath,
      homeDir,
    );
    return configPath === pathValue ? [`${target}:${pathValue}`] : [];
  });
}

export async function buildDoctorReportWithProject(
  repoRoot: string,
  agentsDir: string,
  homeDir: string,
  projectConfigPath?: string | null,
): Promise<DoctorReport> {
  const report = await buildDoctorReport(repoRoot, agentsDir, homeDir);
  if (!projectConfigPath) {
    return report;
  }

  const [repoConfig, builtInRegistry, skillInventory] = await Promise.all([
    loadConfig(repoRoot),
    loadRegistry(repoRoot),
    buildSkillInventory(repoRoot, agentsDir, homeDir),
  ]);
  const state = await buildEffectiveState({
    repoRoot,
    agentsDir,
    homeDir,
    cwd: resolveProjectRootFromConfigPath(projectConfigPath),
  });
  const projectRoot = state.projectRoot;
  const project = state.projectConfig;
  const projectWithCards = state.projectConfigWithCards;
  const cardLocks = state.activeCards;
  if (!project || !projectWithCards || !projectRoot) {
    return report;
  }
  const knownServerNames = new Set([
    ...Object.keys(builtInRegistry.servers),
    ...state.cardServerDefinitions.map((definition) => definition.serverName),
  ]);
  const availableSkillNames = new Set([
    ...skillInventory.map((skill) => skill.name),
    ...cardLocks.flatMap((card) => card.skills),
  ]);
  const issues: string[] = [];

  for (const [name, override] of Object.entries(project.mcpServers ?? {})) {
    if (isServerToggle(override)) {
      if (!knownServerNames.has(name)) {
        issues.push(`Unknown server reference: "${name}"`);
        continue;
      }
      const centrallyActive = false;
      if (centrallyActive === override.enabled) {
        issues.push(`Stale override: server "${name}" is already ${centrallyActive ? "enabled" : "disabled"} centrally`);
      }
    }
  }

  for (const name of [...(projectWithCards.skills?.include ?? []), ...(projectWithCards.skills?.exclude ?? [])]) {
    if (!availableSkillNames.has(name)) {
      issues.push(`Unknown skill reference: "${name}"`);
    }
  }

  for (const name of Object.keys(project.extensions ?? {})) {
    if (!getExtension(name)) {
      issues.push(`Unknown extension reference: "${name}"`);
    }
  }

  for (const [name, override] of Object.entries(project.targets ?? {})) {
    if (repoConfig.targets[name as keyof typeof repoConfig.targets]?.enabled === override.enabled) {
      issues.push(`Stale override: target "${name}" is already ${override.enabled ? "enabled" : "disabled"} centrally`);
    }
  }

  const generatedDir = join(projectRoot, ".agents", "drwn", "generated");
  const scopedReport = {
    ...report,
    staleSkillSymlinks: await detectStaleSkillSymlinks(repoRoot, agentsDir, projectRoot, state.skillSelection, cardLocks),
    mcpDrift: await detectMcpDrift(
      state.effectiveConfig,
      state.activeServers,
      projectRoot,
    ),
    missingGeneratedFiles: await detectMissingGeneratedFiles(state.effectiveConfig, generatedDir),
    hookIssues: detectHookIssues(cardLocks, generatedDir),
    projectConfigIssues: [...report.projectConfigIssues, ...issues],
    ambientMcpCollisions: selectedAmbientCollisions(state),
  };
  const projection = await planRepositoryProjection({ repoRoot, agentsDir, homeDir, cwd: projectRoot });
  scopedReport.projectConfigIssues.push(...projection.issues);
  const sections = await buildDiagnosticsSections(repoRoot, agentsDir, homeDir, projectConfigPath);
  return {
    ...scopedReport,
    cards: {
      ...sections.cards,
      warnings: [
        ...sections.cards.warnings,
        ...cardLocks.filter((card) => card.manifest.skills?.include?.some((skill) => !availableSkillNames.has(skill)))
          .map((card) => `Card ${card.name}@${card.version} references unavailable skills`),
      ],
    },
    store: sections.store,
    writeRecord: sections.writeRecord,
  };
}

function readDirLinks(dirPath: string) {
  const entries: Record<string, true> = {};
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      entries[entry.name] = true;
    }
  }
  return entries;
}
