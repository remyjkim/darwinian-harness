// ABOUTME: Applies Card selections to per-project config and lockfiles.
// ABOUTME: Keeps card consumer commands consistent and side-effect-light.

import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { cardLockPath, loadCardLock, persistCardLock, backfillLockTreeShas, type CardLockEntry } from "./card-lock";
import { formatSuccessorSuggestion, readCardMeta } from "./card-meta";
import { buildEffectiveState } from "./effective-state";
import type { CardModeReadout } from "./types";
import {
  cardNamesEqual,
  formatCardSpec,
  isNewerVersion,
  listCards,
  parseCardRef,
  type ResolveCardOptions,
} from "./card-store";
import { loadProjectConfig, resolveProjectRootFromConfigPath } from "./project";
import { projectConfigPath, readProjectConfigForWrite, writeProjectConfigForWrite } from "./project-writes";
import { resolveCardBareRepoPath } from "./store-paths";
import type { CardManifest } from "./card-manifest";
import type { ProjectConfig } from "./types";
import { satisfies, validRange } from "./semver-utils";
import { resolveWorkerGraph } from "./worker-graph";
import { resolveExplicitInstructionContribution } from "./instruction-contribution";

export interface CardProjectMutation {
  projectConfigPath: string;
  lockPath: string;
  cards: string[];
  locked: CardLockEntry[];
  warnings?: string[];
}

export interface CardTrustMutation {
  lockPath: string;
  card: CardLockEntry;
}

export async function resolveProjectCards(
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<CardLockEntry[]> {
  return (await resolveWorkerGraph(agentsDir, specs, options)).cards;
}

export function mergeCardManifestsIntoProjectConfig(project: ProjectConfig, manifests: CardManifest[]): ProjectConfig {
  const next: ProjectConfig = JSON.parse(JSON.stringify(project));
  const skillIncludes = new Set<string>();

  for (const manifest of manifests) {
    for (const skill of manifest.skills?.include ?? []) {
      skillIncludes.add(skill);
    }
    if (manifest.servers) {
      next.mcpServers = {
        ...(next.mcpServers ?? {}),
        ...manifest.servers,
      };
    }
    if (manifest.extensions) {
      next.extensions = {
        ...(next.extensions ?? {}),
        ...manifest.extensions,
      };
    }
    if (manifest.targets) {
      next.targets = {
        ...(next.targets ?? {}),
        ...manifest.targets,
      };
    }
  }

  for (const skill of project.skills?.include ?? []) {
    skillIncludes.add(skill);
  }
  if (skillIncludes.size > 0 || project.skills?.exclude) {
    next.skills = {
      include: [...skillIncludes],
      exclude: project.skills?.exclude,
    };
  }
  next.mcpServers = {
    ...Object.assign({}, ...manifests.map((manifest) => manifest.servers ?? {})),
    ...(project.mcpServers ?? {}),
  };
  next.extensions = {
    ...Object.assign({}, ...manifests.map((manifest) => manifest.extensions ?? {})),
    ...(project.extensions ?? {}),
  };
  next.targets = {
    ...Object.assign({}, ...manifests.map((manifest) => manifest.targets ?? {})),
    ...(project.targets ?? {}),
  };
  return next;
}

export async function writeProjectCards(
  projectRoot: string,
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
): Promise<CardProjectMutation> {
  const config = await readProjectConfigForWrite(projectRoot);
  const previousLock = await loadCardLock(projectRoot);
  config.workers = [...specs];
  const configPath = await writeProjectConfigForWrite(projectRoot, config);
  const graph = await resolveWorkerGraph(agentsDir, config.workers, options);
  const warnings: string[] = [];
  const previousByName = new Map((previousLock?.cards ?? []).map((card) => [card.name, card]));
  const locked = graph.cards.map((card) => {
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
      const versionAllowed = satisfies(
        card.version,
        previous.instructionConsent.consentedRange,
        { includePrerelease: true },
      );
      if (
        contribution &&
        versionAllowed &&
        contribution.contentDigest === previous.instructionConsent.contentDigest
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
  warnings.push(...await collectCardMetaWarnings(agentsDir, await backfillLockTreeShas(agentsDir, locked), options));
  const lockPath = await persistCardLock(projectRoot, agentsDir, { workerRoots: graph.roots, cards: locked });
  const lockedWithTreeSha = (await loadCardLock(projectRoot))?.cards ?? locked;
  return { projectConfigPath: configPath, lockPath, cards: config.workers, locked: lockedWithTreeSha, warnings };
}

export async function getCurrentProjectCardSpecs(projectRoot: string) {
  const configPath = projectConfigPath(projectRoot);
  const config = await loadProjectConfig(configPath);
  return [...config.workers];
}

export async function applyProjectCardSpecs(
  projectRoot: string,
  agentsDir: string,
  specs: string[],
  options: ResolveCardOptions = {},
) {
  return await writeProjectCards(projectRoot, agentsDir, specs, options);
}

export async function addProjectCardSpec(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: ResolveCardOptions = {},
) {
  const current = await getCurrentProjectCardSpecs(projectRoot);
  const nextName = parseCardRef(spec).name;
  if (current.some((item) => cardNamesEqual(item, nextName))) {
    throw new Error(`Card already exists in project: ${nextName}`);
  }
  current.push(spec);
  return await writeProjectCards(projectRoot, agentsDir, current, options);
}

export async function pinProjectCardSpec(
  projectRoot: string,
  agentsDir: string,
  spec: string,
  options: ResolveCardOptions = {},
) {
  const parsed = parseCardRef(spec);
  const current = await getCurrentProjectCardSpecs(projectRoot);
  const next = current.map((item) => (cardNamesEqual(item, parsed.name) ? formatCardSpec(parsed.name, parsed.range) : item));
  if (!next.some((item) => cardNamesEqual(item, parsed.name))) {
    next.push(formatCardSpec(parsed.name, parsed.range));
  }
  return await writeProjectCards(projectRoot, agentsDir, next, options);
}

export async function removeProjectCard(projectRoot: string, agentsDir: string, refOrName: string) {
  const parsed = parseCardRef(refOrName);
  const current = await getCurrentProjectCardSpecs(projectRoot);
  if (!current.some((item) => cardNamesEqual(item, parsed.name))) {
    throw new Error(`Card is not in project: ${parsed.name}`);
  }
  const next = current.filter((item) => !cardNamesEqual(item, parsed.name));
  return await writeProjectCards(projectRoot, agentsDir, next);
}

export async function detachProjectCards(projectRoot: string, agentsDir: string) {
  return await writeProjectCards(projectRoot, agentsDir, []);
}

export async function updateProjectCardLock(
  projectRoot: string,
  agentsDir: string,
  options: ResolveCardOptions = {},
) {
  return await writeProjectCards(projectRoot, agentsDir, await getCurrentProjectCardSpecs(projectRoot), options);
}

function findLockedCard(cards: CardLockEntry[], cardNameOrRef: string) {
  const name = parseCardRef(cardNameOrRef).name;
  return cards.find((card) => cardNamesEqual(card.name, name)) ?? null;
}

export async function setHookConsent(
  projectRoot: string,
  agentsDir: string,
  cardNameOrRef: string,
  range?: string,
): Promise<CardTrustMutation> {
  const lock = await loadCardLock(projectRoot);
  if (!lock) {
    throw new Error("Card lockfile not found. Run drwn update first.");
  }
  const target = findLockedCard(lock.cards, cardNameOrRef);
  if (!target) {
    throw new Error(`Card is not in project lockfile: ${parseCardRef(cardNameOrRef).name}`);
  }
  const consentedRange = range ?? `^${target.version}`;
  if (!validRange(consentedRange)) {
    throw new Error(`Invalid hook consent range: ${consentedRange}`);
  }
  const nextCards = lock.cards.map((card) =>
    card === target
      ? {
          ...card,
          hookConsent: {
            consentedAt: new Date().toISOString(),
            consentedRange,
          },
        }
      : card,
  );
  await persistCardLock(projectRoot, agentsDir, { workerRoots: lock.workerRoots, cards: nextCards });
  return {
    lockPath: cardLockPath(projectRoot),
    card: nextCards.find((card) => cardNamesEqual(card.name, target.name))!,
  };
}

export async function setCardConsent(
  projectRoot: string,
  agentsDir: string,
  cardNameOrRef: string,
  surfaces: { hooks: boolean; instructions: boolean },
  range?: string,
): Promise<CardTrustMutation> {
  const lock = await loadCardLock(projectRoot);
  if (!lock) throw new Error("Card lockfile not found. Run drwn update first.");
  const target = findLockedCard(lock.cards, cardNameOrRef);
  if (!target) {
    throw new Error(`Card is not in project lockfile: ${parseCardRef(cardNameOrRef).name}`);
  }
  const consentedRange = range ?? `^${target.version}`;
  if (!validRange(consentedRange) || !satisfies(target.version, consentedRange, { includePrerelease: true })) {
    throw new Error(`Consent range must be valid and include locked version ${target.version}: ${consentedRange}`);
  }
  if (surfaces.hooks && target.hooks.length === 0) {
    throw new Error(`Card ${target.name} does not declare hooks`);
  }
  const contribution = surfaces.instructions
    ? resolveExplicitInstructionContribution(target, target.path)
    : null;
  if (surfaces.instructions && !contribution) {
    throw new Error(`Card ${target.name} does not declare explicit instructions`);
  }
  const nextCards = lock.cards.map((card) => {
    if (card !== target) return card;
    const now = new Date().toISOString();
    const hookConsent =
      surfaces.hooks
        ? card.hookConsent?.consentedRange === consentedRange
          ? card.hookConsent
          : { consentedAt: now, consentedRange }
        : card.hookConsent;
    const instructionConsent =
      surfaces.instructions && contribution
        ? card.instructionConsent?.consentedRange === consentedRange &&
          card.instructionConsent.contentDigest === contribution.contentDigest
          ? card.instructionConsent
          : {
              consentedAt: now,
              consentedRange,
              contentDigest: contribution.contentDigest,
            }
        : card.instructionConsent;
    return {
      ...card,
      ...(hookConsent ? { hookConsent } : {}),
      ...(instructionConsent ? { instructionConsent } : {}),
    };
  });
  await persistCardLock(projectRoot, agentsDir, {
    workerRoots: lock.workerRoots,
    cards: nextCards,
  });
  return {
    lockPath: cardLockPath(projectRoot),
    card: nextCards.find((card) => cardNamesEqual(card.name, target.name))!,
  };
}

export async function clearHookConsent(
  projectRoot: string,
  agentsDir: string,
  cardNameOrRef: string,
): Promise<CardTrustMutation> {
  const lock = await loadCardLock(projectRoot);
  if (!lock) {
    throw new Error("Card lockfile not found. Run drwn update first.");
  }
  const target = findLockedCard(lock.cards, cardNameOrRef);
  if (!target) {
    throw new Error(`Card is not in project lockfile: ${parseCardRef(cardNameOrRef).name}`);
  }
  const nextCards = lock.cards.map((card) => {
    if (card !== target) {
      return card;
    }
    const { hookConsent, ...rest } = card;
    void hookConsent;
    return rest;
  });
  await persistCardLock(projectRoot, agentsDir, { workerRoots: lock.workerRoots, cards: nextCards });
  return {
    lockPath: cardLockPath(projectRoot),
    card: nextCards.find((card) => cardNamesEqual(card.name, target.name))!,
  };
}

export async function clearCardConsent(
  projectRoot: string,
  agentsDir: string,
  cardNameOrRef: string,
  surfaces: { hooks: boolean; instructions: boolean },
): Promise<CardTrustMutation> {
  const lock = await loadCardLock(projectRoot);
  if (!lock) throw new Error("Card lockfile not found. Run drwn update first.");
  const target = findLockedCard(lock.cards, cardNameOrRef);
  if (!target) {
    throw new Error(`Card is not in project lockfile: ${parseCardRef(cardNameOrRef).name}`);
  }
  const nextCards = lock.cards.map((card) => {
    if (card !== target) return card;
    const next = { ...card };
    if (surfaces.hooks) delete next.hookConsent;
    if (surfaces.instructions) delete next.instructionConsent;
    return next;
  });
  await persistCardLock(projectRoot, agentsDir, {
    workerRoots: lock.workerRoots,
    cards: nextCards,
  });
  return {
    lockPath: cardLockPath(projectRoot),
    card: nextCards.find((card) => cardNamesEqual(card.name, target.name))!,
  };
}

export async function readProjectCardStatus(
  projectConfigPath: string,
  agentsDir: string,
  options: { repoRoot: string; homeDir: string },
) {
  const projectRoot = resolveProjectRootFromConfigPath(projectConfigPath);
  const config = await loadProjectConfig(projectConfigPath);
  const lock = await loadCardLock(projectRoot);
  const specs = config.workers;
  const locked = lock?.cards ?? [];
  const outdated = await findOutdatedProjectCards(projectRoot, agentsDir);
  const state = await buildEffectiveState({
    repoRoot: options.repoRoot,
    agentsDir,
    homeDir: options.homeDir,
    cwd: projectRoot,
  });
  const modes: Record<string, CardModeReadout> = {};
  for (const card of locked) {
    const mode = state.cardModes[card.name];
    if (!mode) {
      continue;
    }
    modes[card.name] = {
      mode: mode.mode,
      reason: mode.reason,
      lane: state.cardLanes[card.name] ?? "committed",
      ...(mode.sourcePath ? { sourcePath: mode.sourcePath } : {}),
    };
  }
  return { projectRoot, specs, locked, outdated, modes };
}

async function highestPublishedVersion(agentsDir: string, name: string) {
  const card = (await listCards(agentsDir)).find((entry) => entry.name === name);
  return card?.versions.at(-1) ?? null;
}

export async function findOutdatedProjectCards(
  projectRoot: string,
  agentsDir: string,
  options: ResolveCardOptions = {},
) {
  const outdated: Array<{
    name: string;
    current: string;
    latest: string;
    hookConsentRequiresRegrant?: boolean;
    instructionConsentRequiresRegrant?: boolean;
  }> = [];
  const lock = await loadCardLock(projectRoot);
  const currentByName = new Map((lock?.cards ?? []).map((entry) => [entry.name, entry]));
  const resolved = await resolveProjectCards(agentsDir, await getCurrentProjectCardSpecs(projectRoot), options);

  for (const next of resolved) {
    const current = currentByName.get(next.name);
    if (!current) {
      continue;
    }
    if (isNewerVersion(next.version, current.version)) {
      outdated.push({
        name: next.name,
        current: current.version,
        latest: next.version,
        ...(current.hookConsent && current.hooks.length > 0 && !satisfies(next.version, current.hookConsent.consentedRange, { includePrerelease: true })
          ? { hookConsentRequiresRegrant: true }
          : {}),
        ...(current.instructionConsent && !satisfies(next.version, current.instructionConsent.consentedRange, { includePrerelease: true })
          ? { instructionConsentRequiresRegrant: true }
          : {}),
      });
      continue;
    }

    const latest = await highestPublishedVersion(agentsDir, next.name);
    if (latest && isNewerVersion(latest, next.version)) {
      outdated.push({
        name: next.name,
        current: next.version,
        latest,
        ...(current.hookConsent && current.hooks.length > 0 && !satisfies(latest, current.hookConsent.consentedRange, { includePrerelease: true })
          ? { hookConsentRequiresRegrant: true }
          : {}),
        ...(current.instructionConsent && !satisfies(latest, current.instructionConsent.consentedRange, { includePrerelease: true })
          ? { instructionConsentRequiresRegrant: true }
          : {}),
      });
    }
  }
  return outdated;
}

export function projectRootFromConfigPath(configPath: string) {
  return dirname(dirname(dirname(configPath)));
}

export async function collectCardMetaWarnings(
  agentsDir: string,
  cards: CardLockEntry[],
  options: ResolveCardOptions = {},
): Promise<string[]> {
  const warnings: string[] = [];
  for (const card of cards) {
    const barePath = resolveCardBareRepoPath(agentsDir, card.name);
    if (!existsSync(barePath)) {
      continue;
    }
    const meta = await readCardMeta(barePath);
    const deprecation = meta?.deprecations?.[card.version];
    if (deprecation) {
      warnings.push(`${card.name}@${card.version} is deprecated: ${deprecation}`);
    }
    const suggestion = formatSuccessorSuggestion(card.name, meta, {
      acceptSuccessor: options.acceptSuccessor,
    });
    if (suggestion) {
      warnings.push(suggestion);
    }
  }
  return warnings;
}
