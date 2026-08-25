// ABOUTME: Resolves ordered launch closures from effective installed Worker roots only.
// ABOUTME: Never resolves registry, Git, filesystem, or generated Worker references.

import type { CardLockEntry } from "../card-lock";
import type { EffectiveWorkerSelection } from "../effective-state";
import { DrwnError } from "../errors";
import type { WorkerLaunchCardIdentityV1, WorkerLaunchRootIdentityV1 } from "./contracts";
import { computeWorkerClosureDigest } from "./digest";

export interface InstalledWorkerClosure {
  root: EffectiveWorkerSelection["installedRoots"][number];
  cards: CardLockEntry[];
  rootIdentity: WorkerLaunchRootIdentityV1;
  cardIdentities: WorkerLaunchCardIdentityV1[];
}

function cardIdentity(card: CardLockEntry, selection: EffectiveWorkerSelection): WorkerLaunchCardIdentityV1 {
  return {
    name: card.name,
    version: card.version,
    integrity: card.integrity as `sha256-${string}`,
    ...(card.treeSha ? { treeSha: card.treeSha } : {}),
    local: selection.localCardNames.has(card.name),
  };
}

export function resolveInstalledWorkerClosure(
  selection: EffectiveWorkerSelection,
  rootName: string,
): InstalledWorkerClosure {
  const root = selection.installedRoots.find((entry) => entry.name === rootName);
  if (!root) {
    throw new DrwnError(
      "LAUNCH_ROOT_NOT_INSTALLED",
      `Worker launch root ${rootName} is not an effective installed project root`,
      ["Choose an exact root name from drwn status --json."],
    );
  }
  const cardsByName = new Map(selection.installedCards.map((card) => [card.name, card]));
  const cards = [root.name, ...root.members].map((name) => {
    const card = cardsByName.get(name);
    if (!card) {
      throw new DrwnError("LAUNCH_ROOT_CLOSURE_INVALID", `Installed root ${root.name} is missing locked Card ${name}`);
    }
    return card;
  });
  const cardIdentities = cards.map((card) => cardIdentity(card, selection));
  const closureDigest = computeWorkerClosureDigest({
    root: { name: root.name, requested: root.requested, kind: root.kind, members: root.members },
    cards: cardIdentities,
  });
  return {
    root,
    cards,
    cardIdentities,
    rootIdentity: {
      name: root.name,
      requested: root.requested,
      kind: root.kind,
      closureDigest,
      localOnly: selection.localOverrides.localOnlyRoots.includes(root.name),
    },
  };
}
