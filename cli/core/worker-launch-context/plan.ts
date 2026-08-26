// ABOUTME: Builds the deterministic target-neutral additive Worker launch plan.
// ABOUTME: Resolves only effective installed roots and never writes project or target state.

import { lstatSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { classifyAmbientMcpCollision } from "../ambient-policy";
import { inspectAmbientMcpDefinitions } from "../ambient-capabilities";
import { collectCardServerDefinitions } from "../card-mcp";
import { buildProjectClosureCapabilityState } from "../effective-state";
import { DrwnError } from "../errors";
import { isHookConsentValid } from "../hook-consent";
import { planHookPolicies } from "../hook-generator/sync-hooks";
import { renderMcpServerForTarget } from "../mcp";
import { planSkillCapabilities, type PlannedSkillCapability } from "../skills";
import { instructionCompositionForCards } from "../sync-project-instructions";
import type { RegistryServer } from "../types";
import { hashManagedDirectory } from "../write-record";
import type { HookPolicyBundleInput } from "../hook-generator/bundle-composer";
import type { StableWorkerLaunchInput } from "./snapshot";
import { computeWorkerCapabilityDelta } from "./capability-delta";
import {
  parseWorkerLaunchPlan,
  type WorkerLaunchDiagnosticV1,
  type WorkerLaunchPlanV1,
} from "./contracts";
import {
  computeProjectRootHash,
  computeWorkerCapabilityIdentity,
  computeWorkerLaunchContextId,
} from "./digest";
import { resolveInstalledWorkerClosure } from "./closure";

export const WORKER_LAUNCH_RENDERER_VERSION = "worker-launch-context@1";

interface InternalSkill extends PlannedSkillCapability {
  identityHash: string;
}

interface InternalMcp {
  id: string;
  identityHash: string;
  definitionHash: `sha256-${string}`;
  optional: boolean;
  server: RegistryServer;
  rendered: Record<string, unknown>;
}

interface InternalHook {
  id: string;
  identityHash: string;
  contentHash: `sha256-${string}`;
  consentHash: `sha256-${string}`;
  sourceRoot: string;
  sourceTreeHash: `sha256-${string}`;
  policyRelativePath: string;
  policy: HookPolicyBundleInput;
}

export interface WorkerLaunchMaterializationSource {
  path: string;
  kind: "file" | "directory";
  contentHash: `sha256-${string}`;
}

export interface WorkerLaunchMaterializationInput {
  skills: InternalSkill[];
  mcpServers: InternalMcp[];
  hooks: InternalHook[];
  instructionBytes: Uint8Array | null;
}

export interface PlannedWorkerLaunchContext {
  plan: WorkerLaunchPlanV1;
  materialization: WorkerLaunchMaterializationInput;
  sourceState: {
    projectRootHash: `sha256-${string}`;
    baseClosureDigest: `sha256-${string}` | null;
    assignedClosureDigest: `sha256-${string}`;
    projectOverlayDigest: `sha256-${string}`;
    localOverlayDigest?: `sha256-${string}`;
  };
  sourceProvenance: {
    sourceProjectLockDigest: `sha256-${string}`;
    sourceLocalLockDigest?: `sha256-${string}`;
  };
  sourceInputDigest: `sha256-${string}`;
  materializationSources: WorkerLaunchMaterializationSource[];
}

function diagnostic(code: string, message: string): WorkerLaunchDiagnosticV1 {
  return { code, severity: "warning", message };
}

function targetMinimum(target: "claude" | "codex") {
  return target === "claude" ? "2.1.212" : "0.149.0";
}

function relevantProjectOverlay(projectConfig: NonNullable<StableWorkerLaunchInput["state"]["projectConfig"]>) {
  return {
    materialization: projectConfig.materialization ?? null,
    committedSurfaces: projectConfig.committedSurfaces ?? null,
    mcpServers: projectConfig.mcpServers ?? {},
    skills: projectConfig.skills ?? {},
    hooks: projectConfig.hooks ?? {},
    extensions: projectConfig.extensions ?? {},
    targets: projectConfig.targets ?? {},
  };
}

function filteredLocalOverlay(
  stableInput: StableWorkerLaunchInput,
  relevantCards: Set<string>,
): unknown | null {
  const overrides = stableInput.state.workerSelection!.localOverrides;
  const value = {
    activeWorker: overrides.activeWorker,
    cardReplacements: overrides.cardReplacements.filter((name) => relevantCards.has(name)).sort(),
    localOnlyRoots: overrides.localOnlyRoots.filter((name) => relevantCards.has(name)).sort(),
    sourceOverrides: overrides.sourceOverrides.filter((name) => relevantCards.has(name)).sort(),
  };
  return value.activeWorker !== null || value.cardReplacements.length > 0 || value.localOnlyRoots.length > 0 || value.sourceOverrides.length > 0
    ? value
    : null;
}

function assertConcreteSourceTree(path: string): void {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    throw new DrwnError("LAUNCH_CAPABILITY_SOURCE_INVALID", `Worker launch capability source contains a symlink: ${path}`);
  }
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path).sort()) assertConcreteSourceTree(join(path, entry));
    return;
  }
  if (!stats.isFile()) {
    throw new DrwnError("LAUNCH_CAPABILITY_SOURCE_INVALID", `Worker launch capability source is not a regular file: ${path}`);
  }
}

export async function planWorkerLaunchContext(input: {
  stableInput: StableWorkerLaunchInput;
  assignedRoot: string;
  target: "claude" | "codex";
  enabledOptionalMcp?: string[];
  strict?: boolean;
}): Promise<PlannedWorkerLaunchContext> {
  const { state, projection, snapshot } = input.stableInput;
  if (!state.projectRoot || !state.projectConfig || !state.workerSelection) {
    throw new DrwnError("PROJECT_NOT_INITIALIZED", "Worker launch planning requires effective project Worker state");
  }
  if (state.workerSelection.activeWorker !== null && !projection.current) {
    throw new DrwnError(
      "LAUNCH_BASE_PROJECTION_STALE",
      "The active Worker project projection is not current",
      ["Run drwn write and resolve every reported projection issue before preparing launch contexts."],
    );
  }

  const assigned = resolveInstalledWorkerClosure(state.workerSelection, input.assignedRoot);
  const base = state.workerSelection.activeWorker === null
    ? null
    : resolveInstalledWorkerClosure(state.workerSelection, state.workerSelection.activeWorker);
  const baseByName = new Map((base?.cardIdentities ?? []).map((card) => [card.name, card]));
  const deltaCards = assigned.cards.filter((card) => {
    const baseCard = baseByName.get(card.name);
    if (!baseCard) return true;
    if (baseCard.integrity !== card.integrity) {
      throw new DrwnError("LAUNCH_ROOT_CLOSURE_INVALID", `Card ${card.name} differs between active and assigned closures`);
    }
    return false;
  });
  const deltaCardNames = new Set(deltaCards.map((card) => card.name));
  const deltaIdentities = assigned.cardIdentities.filter((card) => deltaCardNames.has(card.name));

  const requestedOptional = [...new Set(input.enabledOptionalMcp ?? [])].sort();
  const assignedDefinitions = new Map(collectCardServerDefinitions(assigned.cards).map((entry) => [entry.serverName, entry]));
  for (const id of requestedOptional) {
    const definition = assignedDefinitions.get(id);
    if (!definition || !definition.server.optional) {
      throw new DrwnError(
        "LAUNCH_OPTIONAL_MCP_INVALID",
        `Optional MCP ${id} is not an optional server declared by assigned root ${assigned.root.name}`,
      );
    }
  }
  const assignedProjectConfig = structuredClone(state.projectConfig);
  assignedProjectConfig.mcpServers = {
    ...(assignedProjectConfig.mcpServers ?? {}),
    ...Object.fromEntries(requestedOptional.map((id) => [id, { enabled: true }])),
  };
  const baseCapabilities = buildProjectClosureCapabilityState({
    repoConfig: state.repoConfig,
    repoRegistry: state.repoRegistry,
    projectConfig: state.projectConfig,
    cards: base?.cards ?? [],
  });
  const assignedCapabilities = buildProjectClosureCapabilityState({
    repoConfig: state.repoConfig,
    repoRegistry: state.repoRegistry,
    projectConfig: assignedProjectConfig,
    cards: assigned.cards,
  });
  if (!assignedCapabilities.effectiveConfig.targets[input.target]?.enabled) {
    throw new DrwnError("LAUNCH_TARGET_UNSUPPORTED", `Target ${input.target} is disabled by effective project intent`);
  }

  const skillOptions = { ...state.scopedOptions, target: input.target, writeScope: "project" as const };
  const [baseSkillPlan, assignedSkillPlan] = await Promise.all([
    planSkillCapabilities(
      skillOptions,
      baseCapabilities.skillSelection,
      base?.cards ?? [],
      state.contentRootsByCard,
      undefined,
      baseCapabilities.effectiveConfig,
    ),
    planSkillCapabilities(
      skillOptions,
      assignedCapabilities.skillSelection,
      assigned.cards,
      state.contentRootsByCard,
      undefined,
      assignedCapabilities.effectiveConfig,
    ),
  ]);
  const skills = computeWorkerCapabilityDelta<InternalSkill>({
    kind: "skill",
    base: baseSkillPlan.capabilities.map((entry) => ({ ...entry, identityHash: entry.contentHash })),
    assigned: assignedSkillPlan.capabilities.map((entry) => ({ ...entry, identityHash: entry.contentHash })),
  });
  for (const skill of skills) assertConcreteSourceTree(skill.sourcePath);

  const toMcp = (servers: Record<string, RegistryServer>): InternalMcp[] => Object.entries(servers)
    .map(([id, server]) => {
      const rendered = renderMcpServerForTarget(input.target, server);
      const definitionHash = computeWorkerCapabilityIdentity(rendered);
      return { id, server, rendered, optional: server.optional, definitionHash, identityHash: definitionHash };
    })
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const mcpServers = computeWorkerCapabilityDelta<InternalMcp>({
    kind: "mcp",
    base: toMcp(baseCapabilities.activeServers),
    assigned: toMcp(assignedCapabilities.activeServers),
  });

  const ambient = await inspectAmbientMcpDefinitions({
    config: assignedCapabilities.effectiveConfig,
    homeDir: state.normalized.homeDir,
    projectRoot: state.projectRoot,
  });
  const targetAmbientErrors = ambient.errors.filter((error) => error.target === input.target);
  if (targetAmbientErrors.length > 0) {
    throw new DrwnError("LAUNCH_MCP_CONFLICT", `Unable to verify ambient ${input.target} MCP configuration`);
  }
  for (const server of mcpServers) {
    for (const existing of ambient.definitions.filter((entry) => entry.target === input.target && entry.id === server.id)) {
      const collision = classifyAmbientMcpCollision({
        declared: { target: input.target, id: server.id, source: "project", path: "<worker-launch-context>", value: server.rendered },
        ambient: existing,
      });
      if (collision && collision.disposition !== "identical") {
        throw new DrwnError("LAUNCH_MCP_CONFLICT", `Worker launch MCP ${server.id} conflicts with ambient ${input.target} configuration`);
      }
    }
  }

  const hookExclusions = new Set(assignedCapabilities.projectConfigWithCards.hooks?.exclude ?? []);
  const hookPlan = planHookPolicies({
    cards: deltaCards,
    exclusions: hookExclusions,
    strictHooks: false,
    contentRootsByCard: state.contentRootsByCard,
  });
  const deltaCardsByName = new Map(deltaCards.map((card) => [card.name, card]));
  const hooks: InternalHook[] = hookPlan.policies.map((policy) => {
    const card = deltaCardsByName.get(policy.cardName)!;
    const sourceRoot = state.contentRootsByCard[policy.cardName];
    if (!sourceRoot) throw new DrwnError("LAUNCH_CAPABILITY_SOURCE_INVALID", `Missing source root for hook Card ${policy.cardName}`);
    assertConcreteSourceTree(sourceRoot);
    const policyRelativePath = relative(sourceRoot, policy.policyTsPath);
    if (!policyRelativePath || policyRelativePath === ".." || policyRelativePath.startsWith(`..${process.platform === "win32" ? "\\\\" : "/"}`) || isAbsolute(policyRelativePath)) {
      throw new DrwnError("LAUNCH_CAPABILITY_SOURCE_INVALID", `Hook policy escapes its Card source root: ${policy.cardName}:${policy.policyName}`);
    }
    const sourceTreeHash = hashManagedDirectory(sourceRoot) as `sha256-${string}`;
    const hookContentHash = sourceTreeHash;
    const consentHash = computeWorkerCapabilityIdentity(card.hookConsent);
    return {
      id: `${policy.cardName}:${policy.policyName}`,
      policy,
      contentHash: hookContentHash,
      consentHash,
      sourceRoot,
      sourceTreeHash,
      policyRelativePath,
      identityHash: computeWorkerCapabilityIdentity({ contentHash: hookContentHash, consentHash }),
    };
  }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const hookExcluded = deltaCards.flatMap((card) =>
    card.hooks
      .filter((policy) => !hookExclusions.has(policy) && !hookExclusions.has(`${card.name}:${policy}`))
      .filter(() => !isHookConsentValid(card))
      .map((policy) => ({ id: `${card.name}:${policy}`, reason: "consent_required" as const })),
  ).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

  const instructions = instructionCompositionForCards({
    cards: deltaCards,
    contentRootsByCard: state.contentRootsByCard,
    organizationConsent: state.organizationInstructionConsent,
  });
  const instructionExcluded = instructions.excluded.map((entry) => ({ id: entry.card, reason: entry.reason }))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const excluded = [...hookExcluded, ...instructionExcluded].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  if (input.strict && excluded.length > 0) {
    throw new DrwnError("LAUNCH_CONSENT_REQUIRED", `Worker launch context requires consent for ${excluded.map((entry) => entry.id).join(", ")}`);
  }
  const instructionConsentHash = instructions.contentDigest
    ? computeWorkerCapabilityIdentity(instructions.included)
    : null;

  const warnings: WorkerLaunchDiagnosticV1[] = [
    ...new Set([...baseSkillPlan.warnings, ...assignedSkillPlan.warnings]),
  ].map((message) => diagnostic("LAUNCH_SKILL_WARNING", message));
  warnings.push(...hookPlan.warnings.map((message) => diagnostic("LAUNCH_HOOK_CONSENT_SKIPPED", message)));
  warnings.push(...instructions.excluded.map((entry) => diagnostic(
    "LAUNCH_INSTRUCTION_CONSENT_SKIPPED",
    `Skipping instructions for ${entry.card}: ${entry.reason}`,
  )));

  const projectOverlayDigest = computeWorkerCapabilityIdentity(relevantProjectOverlay(state.projectConfig));
  const relevantCards = new Set([...(base?.cards ?? []), ...assigned.cards].map((card) => card.name));
  const localOverlay = filteredLocalOverlay(input.stableInput, relevantCards);
  const localOverlayDigest = localOverlay ? computeWorkerCapabilityIdentity(localOverlay) : undefined;
  const publicCapabilities: WorkerLaunchPlanV1["capabilities"] = {
    skills: skills.map((entry) => ({ id: entry.id, contentHash: entry.contentHash })),
    mcpServers: mcpServers.map((entry) => ({ id: entry.id, definitionHash: entry.definitionHash, optional: entry.optional })),
    hooks: hooks.map((entry) => ({ id: entry.id, contentHash: entry.contentHash, consentHash: entry.consentHash })),
    instructions: instructions.contentDigest && instructionConsentHash
      ? { present: true, contentHash: instructions.contentDigest, consentHash: instructionConsentHash }
      : { present: false },
  };
  const sourceState = {
    projectRootHash: computeProjectRootHash(state.projectRoot),
    baseClosureDigest: (base?.rootIdentity.closureDigest as `sha256-${string}` | undefined) ?? null,
    assignedClosureDigest: assigned.rootIdentity.closureDigest as `sha256-${string}`,
    projectOverlayDigest,
    ...(localOverlayDigest ? { localOverlayDigest } : {}),
  };
  const preimage = {
    schema: "drwn.worker-launch-digest-preimage",
    schemaVersion: 1,
    rendererVersion: WORKER_LAUNCH_RENDERER_VERSION,
    target: input.target,
    ...sourceState,
    baseRoot: base?.rootIdentity ?? null,
    assignedRoot: assigned.rootIdentity,
    deltaCards: deltaIdentities,
    capabilities: publicCapabilities,
    enabledOptionalMcp: requestedOptional,
    strict: input.strict ?? false,
  };
  const plannedContextId = computeWorkerLaunchContextId(preimage);
  const plannedArtifactDir = join(
    state.projectRoot,
    ".agents",
    "drwn",
    "generated",
    "launch-contexts",
    "v1",
    input.target,
    plannedContextId,
  );
  const includedConsent = [
    ...hooks.map((entry) => entry.id),
    ...instructions.included.map((entry) => entry.card),
  ].sort();
  const plan = parseWorkerLaunchPlan({
    schema: "drwn.worker-launch-plan",
    schemaVersion: 1,
    target: input.target,
    projectRoot: state.projectRoot,
    baseRoot: base?.rootIdentity ?? null,
    assignedRoot: assigned.rootIdentity,
    baseClosure: base?.cardIdentities ?? [],
    assignedClosure: assigned.cardIdentities,
    deltaClosure: deltaIdentities,
    capabilities: publicCapabilities,
    optionalMcp: { requested: requestedOptional, enabled: requestedOptional, rejected: [] },
    consent: { strict: input.strict ?? false, included: [...new Set(includedConsent)], excluded },
    targetCompatibility: { minimumVersion: targetMinimum(input.target), probed: false },
    warnings,
    plannedContextId,
    plannedArtifactDir,
  });
  const materializationSources = [
    ...skills.map((skill) => ({ path: skill.sourcePath, kind: "directory" as const, contentHash: skill.contentHash })),
    ...hooks.map((hook) => ({ path: hook.sourceRoot, kind: "directory" as const, contentHash: hook.sourceTreeHash })),
  ].sort((left, right) => left.path.localeCompare(right.path))
    .filter((entry, index, entries) => index === 0 || entry.path !== entries[index - 1]!.path);
  return {
    plan,
    materialization: {
      skills,
      mcpServers,
      hooks,
      instructionBytes: instructions.bytes,
    },
    sourceState,
    sourceProvenance: {
      sourceProjectLockDigest: snapshot.sourceProjectLockDigest,
      ...(snapshot.sourceLocalLockDigest ? { sourceLocalLockDigest: snapshot.sourceLocalLockDigest } : {}),
    },
    sourceInputDigest: snapshot.inputDigest,
    materializationSources,
  };
}
