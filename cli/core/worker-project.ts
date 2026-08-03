// ABOUTME: Mutates project Worker requirements through supported V1 config and lock state.
// ABOUTME: Resolves complete next bytes before committing both files through one transaction.

import {
  backfillLockTreeShas,
  cardLockPath,
  serializeCardLock,
  validateCardLockfile,
  type CardLockEntry,
} from "./card-lock";
import { collectCardMetaWarnings } from "./card-project";
import { cardNamesEqual, parseCardRef, type ResolveCardOptions } from "./card-store";
import { DrwnError } from "./errors";
import { validateProjectConfig } from "./project";
import { mutateProjectState, type ProjectStateSnapshot } from "./project-state-transaction";
import { projectConfigPath } from "./project-writes";
import { satisfies } from "./semver-utils";
import type { ProjectConfig } from "./types";
import { resolveWorkerGraph, type ResolvedWorkerGraph } from "./worker-graph";
import { resolveExplicitInstructionContribution } from "./instruction-contribution";

export interface WorkerProjectMutation {
  projectConfigPath: string;
  lockPath: string;
  workers: string[];
  roots: ResolvedWorkerGraph["roots"];
  locked: CardLockEntry[];
  activeWorker: string | null;
  warnings?: string[];
  dryRun?: boolean;
  configBytes: string;
  lockBytes: string;
}

export interface WorkerMutationOptions extends ResolveCardOptions {
  dryRun?: boolean;
}

interface CurrentProjectState {
  config: ProjectConfig;
  graph: ResolvedWorkerGraph;
}

function parseSnapshot(snapshot: ProjectStateSnapshot): CurrentProjectState {
  if (!snapshot.configBytes) {
    throw new DrwnError("PROJECT_CONFIG_REQUIRED", "Project config does not exist; run drwn init first");
  }
  let config: ProjectConfig;
  try {
    config = validateProjectConfig(JSON.parse(snapshot.configBytes));
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw new DrwnError("PROJECT_CONFIG_INVALID", "Invalid project config: malformed JSON", undefined, error);
  }
  if (!snapshot.lockBytes) {
    if (config.workers.length > 0) {
      throw new DrwnError("PROJECT_LOCK_INVALID", "Project requirements exist but card.lock is missing");
    }
    return { config, graph: { roots: [], cards: [] } };
  }
  let lock;
  try {
    lock = validateCardLockfile(JSON.parse(snapshot.lockBytes));
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw new DrwnError("PROJECT_LOCK_INVALID", "Invalid project lock: malformed JSON", undefined, error);
  }
  if (
    lock.workerRoots.length !== config.workers.length ||
    config.workers.some((spec, index) => lock.workerRoots[index]?.requested !== spec)
  ) {
    throw new DrwnError("PROJECT_LOCK_INVALID", "Project requirements and lock roots differ");
  }
  return { config, graph: { roots: lock.workerRoots, cards: lock.cards } };
}

function preserveConsent(previousCards: CardLockEntry[], nextCards: CardLockEntry[], warnings: string[]) {
  const previousByName = new Map(previousCards.map((card) => [card.name, card]));
  return nextCards.map((card) => {
    const previous = previousByName.get(card.name);
    let next = card;
    if (previous?.hookConsent) {
      if (satisfies(card.version, previous.hookConsent.consentedRange, { includePrerelease: true })) {
        next = { ...next, hookConsent: previous.hookConsent };
      } else if (card.hooks.length > 0) {
        warnings.push(
          `${card.name} hook consent dropped: locked ${card.version} is outside consent range ${previous.hookConsent.consentedRange}. Run drwn card trust ${card.name} --hooks to re-consent.`,
        );
      }
    }
    if (previous?.instructionConsent) {
      const contribution = resolveExplicitInstructionContribution(card, card.path);
      if (
        contribution &&
        contribution.contentDigest === previous.instructionConsent.contentDigest &&
        satisfies(card.version, previous.instructionConsent.consentedRange, {
          includePrerelease: true,
        })
      ) {
        next = { ...next, instructionConsent: previous.instructionConsent };
      } else {
        warnings.push(
          `${card.name} instruction consent dropped: version or explicit instruction content changed. Run drwn card trust ${card.name} --instructions to re-consent.`,
        );
      }
    }
    return next;
  });
}

function assertRootInstalled(graph: ResolvedWorkerGraph, name: string) {
  if (!graph.roots.some((root) => root.name === name)) {
    throw new DrwnError("ACTIVE_WORKER_NOT_INSTALLED", `Worker ${name} is not an installed root`);
  }
}

async function prepareMutation(
  projectRoot: string,
  agentsDir: string,
  snapshot: ProjectStateSnapshot,
  nextSpecs: string[],
  select: (current: CurrentProjectState, next: ResolvedWorkerGraph) => string | null,
  options: WorkerMutationOptions,
): Promise<{ bytes: { configBytes: string; lockBytes: string }; value: WorkerProjectMutation }> {
  const current = parseSnapshot(snapshot);
  const resolved = await resolveWorkerGraph(agentsDir, nextSpecs, options);
  const warnings: string[] = [];
  const cardsWithConsent = preserveConsent(current.graph.cards, resolved.cards, warnings);
  const locked = await backfillLockTreeShas(agentsDir, cardsWithConsent);
  warnings.push(...await collectCardMetaWarnings(agentsDir, locked, options));
  const graph = { roots: resolved.roots, cards: locked };
  const activeWorker = select(current, graph);
  if (activeWorker !== null) assertRootInstalled(graph, activeWorker);
  const config: ProjectConfig = {
    ...current.config,
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [...nextSpecs],
    activeWorker,
  };
  const configBytes = `${JSON.stringify(validateProjectConfig(config), null, 2)}\n`;
  const lockBytes = serializeCardLock({ workerRoots: graph.roots, cards: graph.cards });
  return {
    bytes: { configBytes, lockBytes },
    value: {
      projectConfigPath: projectConfigPath(projectRoot),
      lockPath: cardLockPath(projectRoot),
      workers: [...nextSpecs],
      roots: graph.roots,
      locked,
      activeWorker,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(options.dryRun ? { dryRun: true } : {}),
      configBytes,
      lockBytes,
    },
  };
}

async function mutateRoots(
  projectRoot: string,
  agentsDir: string,
  derive: (current: CurrentProjectState) => Promise<{
    specs: string[];
    select: (current: CurrentProjectState, next: ResolvedWorkerGraph) => string | null;
  }>,
  options: WorkerMutationOptions = {},
) {
  return mutateProjectState(projectRoot, async (snapshot) => {
    const current = parseSnapshot(snapshot);
    const mutation = await derive(current);
    return prepareMutation(projectRoot, agentsDir, snapshot, mutation.specs, mutation.select, options);
  }, { dryRun: options.dryRun });
}

export async function addProjectWorkerRoot(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: WorkerMutationOptions = {},
) {
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    const name = parseCardRef(spec).name;
    if (current.graph.roots.some((root) => cardNamesEqual(root.name, name))) {
      throw new DrwnError("WORKER_ROOT_DUPLICATE", `Worker root ${name} is already installed`);
    }
    return {
      specs: [...current.config.workers, spec],
      select: (before, next) => before.graph.roots.length === 0 && before.config.activeWorker === null
        ? next.roots[0]!.name
        : before.config.activeWorker,
    };
  }, options);
}

export async function applyProjectWorkerRoots(
  projectRoot: string,
  agentsDir: string,
  specs: string[],
  options: WorkerMutationOptions & { active?: string; none?: boolean } = {},
) {
  if (options.active && options.none) {
    throw new DrwnError("PROJECT_WORKER_SELECTION_INVALID", "Use either --active <name> or --none, not both");
  }
  if (specs.length > 1 && !options.active && !options.none) {
    throw new DrwnError(
      "MULTIPLE_WORKERS_REQUIRE_SELECTION",
      "Applying multiple Worker roots requires --active <installed-root> or --none",
    );
  }
  return mutateRoots(projectRoot, agentsDir, async () => ({
    specs,
    select: (_current, next) => {
      if (options.none || next.roots.length === 0) return null;
      if (options.active) return parseCardRef(options.active).name;
      return next.roots[0]!.name;
    },
  }), options);
}

export async function removeProjectWorkerRoot(
  projectRoot: string,
  agentsDir: string,
  refOrName: string,
  options: WorkerMutationOptions = {},
) {
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    const requestedName = parseCardRef(refOrName).name;
    const index = current.graph.roots.findIndex((root) => cardNamesEqual(root.name, requestedName));
    if (index < 0) throw new DrwnError("WORKER_ROOT_NOT_INSTALLED", `Worker root is not installed: ${requestedName}`);
    const removedName = current.graph.roots[index]!.name;
    return {
      specs: current.config.workers.filter((_, specIndex) => specIndex !== index),
      select: (before) => before.config.activeWorker === removedName ? null : before.config.activeWorker,
    };
  }, options);
}

export async function pinProjectWorkerRoot(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: WorkerMutationOptions = {},
) {
  const [resolvedRoot] = (await resolveWorkerGraph(agentsDir, [spec], options)).roots;
  if (!resolvedRoot) throw new DrwnError("WORKER_ROOT_NOT_RESOLVED", `Could not resolve Worker root ${spec}`);
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    const index = current.graph.roots.findIndex((root) => root.name === resolvedRoot.name);
    if (index < 0) throw new DrwnError("WORKER_ROOT_NOT_INSTALLED", `Worker root is not installed: ${resolvedRoot.name}`);
    const specs = [...current.config.workers];
    specs[index] = spec;
    return { specs, select: (before) => before.config.activeWorker };
  }, options);
}

export async function updateProjectWorkerGraph(
  projectRoot: string,
  agentsDir: string,
  name?: string,
  options: WorkerMutationOptions = {},
) {
  return mutateRoots(projectRoot, agentsDir, async (current) => {
    if (name && !current.graph.roots.some((root) => cardNamesEqual(root.name, parseCardRef(name).name))) {
      throw new DrwnError("WORKER_ROOT_NOT_INSTALLED", `Worker root is not installed: ${name}`);
    }
    return { specs: [...current.config.workers], select: (before) => before.config.activeWorker };
  }, options);
}

function prepareSelectionMutation(
  projectRoot: string,
  snapshot: ProjectStateSnapshot,
  current: CurrentProjectState,
  activeWorker: string | null,
  dryRun: boolean | undefined,
) {
  if (activeWorker !== null) assertRootInstalled(current.graph, activeWorker);
  const configBytes = `${JSON.stringify(validateProjectConfig({
    ...current.config,
    activeWorker,
  }), null, 2)}\n`;
  const lockBytes = snapshot.lockBytes ?? serializeCardLock({
    workerRoots: current.graph.roots,
    cards: current.graph.cards,
  });
  return {
    bytes: { configBytes, lockBytes },
    value: {
      projectConfigPath: projectConfigPath(projectRoot),
      lockPath: cardLockPath(projectRoot),
      workers: [...current.config.workers],
      roots: current.graph.roots,
      locked: current.graph.cards,
      activeWorker,
      ...(dryRun ? { dryRun: true as const } : {}),
      configBytes,
      lockBytes,
    } satisfies WorkerProjectMutation,
  };
}

export async function useProjectWorker(
  projectRoot: string,
  agentsDir: string,
  ref: string | null,
  options: WorkerMutationOptions = {},
) {
  return mutateProjectState(projectRoot, async (snapshot) => {
    const current = parseSnapshot(snapshot);
    if (ref === null) {
      return prepareSelectionMutation(projectRoot, snapshot, current, null, options.dryRun);
    }

    const requestedName = parseCardRef(ref).name;
    const installedRoot = current.graph.roots.find((root) => cardNamesEqual(root.name, requestedName));
    if (installedRoot) {
      return prepareSelectionMutation(projectRoot, snapshot, current, installedRoot.name, options.dryRun);
    }
    if (current.graph.cards.some((card) => cardNamesEqual(card.name, requestedName))) {
      throw new DrwnError(
        "WORKER_MEMBER_NOT_SELECTABLE",
        `${requestedName} is a Blueprint member, not an installed Worker root`,
      );
    }

    return prepareMutation(
      projectRoot,
      agentsDir,
      snapshot,
      [...current.config.workers, ref],
      (_before, next) => {
        const added = next.roots.find((root) => cardNamesEqual(root.name, requestedName));
        if (!added) throw new DrwnError("WORKER_ROOT_NOT_RESOLVED", `Could not resolve Worker root ${ref}`);
        return added.name;
      },
      options,
    );
  }, { dryRun: options.dryRun });
}
