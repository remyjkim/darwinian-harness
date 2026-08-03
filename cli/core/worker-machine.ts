// ABOUTME: Mutates machine Worker Blueprint roots inside the locked machine V2 transaction.
// ABOUTME: Shares graph resolution and consent carry-forward while rejecting plain Card roots atomically.

import {
  backfillLockTreeShas,
  createCardLockfile,
  evaluateVersionFloor,
  type CardLockEntry,
  type ProjectLockV1,
} from "./card-lock";
import { collectCardMetaWarnings, carryCardConsent } from "./card-project";
import { cardNamesEqual, parseCardRef, type ResolveCardOptions } from "./card-store";
import { DrwnError } from "./errors";
import { mutateMachineConfig } from "./machine-config";
import { resolveMachineConfigPath } from "./store-paths";
import type { MachineConfig } from "./types";
import { resolveWorkerGraph, type ResolvedWorkerGraph } from "./worker-graph";
import { resolveMachineCapabilities } from "./defaults";
import { resolveExplicitInstructionContribution } from "./instruction-contribution";
import { satisfies, validRange } from "./semver-utils";
import { machineConsentScope } from "./consent-scope";

export interface MachineWorkerMutation {
  machineConfigPath: string;
  config: MachineConfig;
  roots: ResolvedWorkerGraph["roots"];
  locked: CardLockEntry[];
  activeWorker: string | null;
  warnings?: string[];
  dryRun?: boolean;
}

export interface MachineWorkerMutationOptions extends ResolveCardOptions {
  dryRun?: boolean;
  validateGraph?: (graph: ResolvedWorkerGraph) => void;
}

export interface MachineCardConsentMutation {
  lockPath: string;
  card: CardLockEntry;
  scope: ReturnType<typeof machineConsentScope>;
}

export interface MachineCardConsentSurfaces {
  hooks: boolean;
  instructions: boolean;
}

function currentGraph(config: MachineConfig): ResolvedWorkerGraph {
  const lock = config.capabilities.workerLock;
  return lock
    ? { roots: lock.workerRoots, cards: lock.cards }
    : { roots: [], cards: [] };
}

function assertBlueprintRoots(graph: ResolvedWorkerGraph): void {
  const plainRoot = graph.roots.find((root) => root.kind !== "blueprint");
  if (plainRoot) {
    throw new DrwnError(
      "MACHINE_WORKER_ROOT_NOT_BLUEPRINT",
      `Machine Worker root ${plainRoot.name} is a plain Card; machine roots must be Blueprints`,
    );
  }
}

function assertRootInstalled(graph: ResolvedWorkerGraph, name: string): void {
  if (!graph.roots.some((root) => cardNamesEqual(root.name, name))) {
    throw new DrwnError("ACTIVE_WORKER_NOT_INSTALLED", `Worker ${name} is not an installed machine root`);
  }
}

function assertSupportedLock(lock: ProjectLockV1): void {
  const floor = evaluateVersionFloor(lock.store.minDrwnVersion);
  if (!floor.satisfied) {
    throw new DrwnError(
      "MACHINE_WORKER_VERSION_UNSUPPORTED",
      `Machine Worker requires drwn >= ${floor.required}, but this CLI is ${floor.running}`,
      [`Upgrade drwn to >= ${floor.required} before changing machine Worker intent.`],
    );
  }
}

async function preserveConsent(
  previousCards: CardLockEntry[],
  nextCards: CardLockEntry[],
  warnings: string[],
): Promise<CardLockEntry[]> {
  const previousByName = new Map(previousCards.map((card) => [card.name, card]));
  return Promise.all(nextCards.map((card) => carryCardConsent(card, previousByName.get(card.name), warnings)));
}

async function resolveNextLock(
  agentsDir: string,
  specs: string[],
  previous: ResolvedWorkerGraph,
  options: MachineWorkerMutationOptions,
): Promise<{ graph: ResolvedWorkerGraph; lock: ProjectLockV1; warnings: string[] }> {
  const resolved = await resolveWorkerGraph(agentsDir, specs, options);
  assertBlueprintRoots(resolved);
  options.validateGraph?.(resolved);
  const warnings: string[] = [];
  const carried = await preserveConsent(previous.cards, resolved.cards, warnings);
  const cards = await backfillLockTreeShas(agentsDir, carried);
  warnings.push(...await collectCardMetaWarnings(agentsDir, cards, options));
  const graph = { roots: resolved.roots, cards };
  const lock = createCardLockfile({ workerRoots: graph.roots, cards: graph.cards });
  assertSupportedLock(lock);
  return { graph, lock, warnings };
}

function mutationValue(
  agentsDir: string,
  config: MachineConfig,
  warnings: string[],
  dryRun: boolean | undefined,
): MachineWorkerMutation {
  const graph = currentGraph(config);
  return {
    machineConfigPath: resolveMachineConfigPath(agentsDir),
    config,
    roots: graph.roots,
    locked: graph.cards,
    activeWorker: config.capabilities.activeWorker,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(dryRun ? { dryRun: true } : {}),
  };
}

export async function applyMachineWorkerRoots(
  agentsDir: string,
  specs: string[],
  options: MachineWorkerMutationOptions & { active?: string; none?: boolean } = {},
): Promise<MachineWorkerMutation> {
  if (options.active && options.none) {
    throw new DrwnError("MACHINE_WORKER_SELECTION_INVALID", "Use either --active <name> or --none, not both");
  }
  if (specs.length > 1 && !options.active && !options.none) {
    throw new DrwnError(
      "MULTIPLE_WORKERS_REQUIRE_SELECTION",
      "Applying multiple machine Worker roots requires --active <installed-root> or --none",
    );
  }

  return mutateMachineConfig(agentsDir, async (config) => {
    if (specs.length === 0) {
      const cleared: MachineConfig = {
        ...config,
        capabilities: { activeWorker: null, workerLock: null },
      };
      return { config: cleared, value: mutationValue(agentsDir, cleared, [], options.dryRun) };
    }

    const next = await resolveNextLock(agentsDir, specs, currentGraph(config), options);
    const activeWorker = options.none
      ? null
      : options.active
        ? parseCardRef(options.active).name
        : next.graph.roots[0]!.name;
    if (activeWorker !== null) assertRootInstalled(next.graph, activeWorker);
    const updated: MachineConfig = {
      ...config,
      capabilities: { activeWorker, workerLock: next.lock },
    };
    return {
      config: updated,
      value: mutationValue(agentsDir, updated, next.warnings, options.dryRun),
    };
  }, { dryRun: options.dryRun });
}

export async function useMachineWorker(
  agentsDir: string,
  ref: string | null,
  options: MachineWorkerMutationOptions = {},
): Promise<MachineWorkerMutation> {
  return mutateMachineConfig(agentsDir, async (config) => {
    const current = currentGraph(config);
    assertBlueprintRoots(current);
    if (ref === null) {
      const updated: MachineConfig = {
        ...config,
        capabilities: { ...config.capabilities, activeWorker: null },
      };
      return { config: updated, value: mutationValue(agentsDir, updated, [], options.dryRun) };
    }

    const requestedName = parseCardRef(ref).name;
    const installed = current.roots.find((root) => cardNamesEqual(root.name, requestedName));
    if (installed) {
      const updated: MachineConfig = {
        ...config,
        capabilities: { ...config.capabilities, activeWorker: installed.name },
      };
      return { config: updated, value: mutationValue(agentsDir, updated, [], options.dryRun) };
    }
    if (current.cards.some((card) => cardNamesEqual(card.name, requestedName))) {
      throw new DrwnError(
        "WORKER_MEMBER_NOT_SELECTABLE",
        `${requestedName} is a Blueprint member, not an installed machine Worker root`,
      );
    }

    const next = await resolveNextLock(
      agentsDir,
      [...current.roots.map((root) => root.requested), ref],
      current,
      options,
    );
    const added = next.graph.roots.find((root) => cardNamesEqual(root.name, requestedName));
    if (!added) throw new DrwnError("WORKER_ROOT_NOT_RESOLVED", `Could not resolve machine Worker root ${ref}`);
    const updated: MachineConfig = {
      ...config,
      capabilities: { activeWorker: added.name, workerLock: next.lock },
    };
    return {
      config: updated,
      value: mutationValue(agentsDir, updated, next.warnings, options.dryRun),
    };
  }, { dryRun: options.dryRun });
}

async function mutateMachineCardConsent(
  agentsDir: string,
  cardNameOrRef: string,
  surfaces: MachineCardConsentSurfaces,
  options: { clear: boolean; range?: string },
): Promise<MachineCardConsentMutation> {
  return mutateMachineConfig(agentsDir, async (config) => {
    const lock = config.capabilities.workerLock;
    if (!lock || config.capabilities.activeWorker === null) {
      throw new DrwnError(
        "MACHINE_WORKER_NOT_SELECTED",
        "Select an active machine Worker Blueprint before changing Card consent",
      );
    }
    assertSupportedLock(lock);
    const capabilities = await resolveMachineCapabilities({
      repoRoot: "",
      agentsDir,
    });
    const requestedName = parseCardRef(cardNameOrRef).name;
    const target = capabilities.activeCards.find((card) =>
      cardNamesEqual(card.name, requestedName)
    );
    if (!target) {
      const installed = lock.cards.some((card) =>
        cardNamesEqual(card.name, requestedName)
      );
      throw new DrwnError(
        installed ? "MACHINE_CARD_NOT_ACTIVE" : "MACHINE_CARD_NOT_LOCKED",
        installed
          ? `Card ${requestedName} is not in the active machine Worker closure`
          : `Card is not in machine Worker lock: ${requestedName}`,
      );
    }

    let nextTarget: CardLockEntry;
    if (options.clear) {
      nextTarget = { ...target };
      if (surfaces.hooks) delete nextTarget.hookConsent;
      if (surfaces.instructions) delete nextTarget.instructionConsent;
    } else {
      const consentedRange = options.range ?? `^${target.version}`;
      if (
        !validRange(consentedRange) ||
        !satisfies(target.version, consentedRange, { includePrerelease: true })
      ) {
        throw new Error(
          `Consent range must be valid and include locked version ${target.version}: ${consentedRange}`,
        );
      }
      if (surfaces.hooks && target.hooks.length === 0) {
        throw new Error(`Card ${target.name} does not declare hooks`);
      }
      const contribution = surfaces.instructions
        ? resolveExplicitInstructionContribution(
            target,
            capabilities.contentRootsByCard[target.name] ?? target.path,
          )
        : null;
      if (surfaces.instructions && !contribution) {
        throw new Error(`Card ${target.name} does not declare explicit instructions`);
      }
      const now = new Date().toISOString();
      const hookConsent = surfaces.hooks
        ? target.hookConsent?.consentedRange === consentedRange
          ? target.hookConsent
          : { consentedAt: now, consentedRange }
        : target.hookConsent;
      const instructionConsent = surfaces.instructions && contribution
        ? target.instructionConsent?.consentedRange === consentedRange &&
            target.instructionConsent.contentDigest === contribution.contentDigest
          ? target.instructionConsent
          : {
              consentedAt: now,
              consentedRange,
              contentDigest: contribution.contentDigest,
            }
        : target.instructionConsent;
      nextTarget = {
        ...target,
        ...(hookConsent ? { hookConsent } : {}),
        ...(instructionConsent ? { instructionConsent } : {}),
      };
    }

    const nextLock: ProjectLockV1 = {
      ...lock,
      cards: lock.cards.map((card) =>
        cardNamesEqual(card.name, target.name) ? nextTarget : card
      ),
    };
    const updated: MachineConfig = {
      ...config,
      capabilities: { ...config.capabilities, workerLock: nextLock },
    };
    return {
      config: updated,
      value: {
        lockPath: resolveMachineConfigPath(agentsDir),
        card: nextTarget,
        scope: machineConsentScope(config.capabilities.activeWorker),
      },
    };
  });
}

export async function setMachineCardConsent(
  agentsDir: string,
  cardNameOrRef: string,
  surfaces: MachineCardConsentSurfaces,
  range?: string,
) {
  return mutateMachineCardConsent(agentsDir, cardNameOrRef, surfaces, {
    clear: false,
    range,
  });
}

export async function clearMachineCardConsent(
  agentsDir: string,
  cardNameOrRef: string,
  surfaces: MachineCardConsentSurfaces,
) {
  return mutateMachineCardConsent(agentsDir, cardNameOrRef, surfaces, {
    clear: true,
  });
}
