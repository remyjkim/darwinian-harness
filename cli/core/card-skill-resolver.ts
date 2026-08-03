// ABOUTME: Resolves skill names to their authoritative source: card store first, user-defaults second.
// ABOUTME: Single attribution authority shared by syncSkills, diagnostics, and dry-run planning.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import { findAvailableSkill, type SkillScope } from "./skills";
import { hashManagedDirectory } from "./write-record";
import { canonicalJsonHash } from "./managed-fields";
import { DrwnError } from "./errors";
import type { ResolvedMachineSkill } from "./defaults";

export type ResolvedSkillSource =
  | {
      layer: "card";
      cardName: string;
      cardVersion: string;
      path: string;
    }
  | {
      layer: "user-default";
      path: string;
      scope: SkillScope;
    }
  | {
      layer: "machine-worker";
      path: string;
      scope: SkillScope;
      cardName: string;
      cardVersion: string;
    }
  | {
      layer: "missing";
      reason: string;
    };

export function assertWorkerCapabilityCompatibility(cards: CardLockEntry[]): void {
  const skills = new Map<string, { hash: string; card: string }>();
  const servers = new Map<string, { hash: string; card: string }>();
  for (const card of cards) {
    for (const skill of card.skills) {
      const skillPath = join(card.path, "skills", skill);
      if (!existsSync(skillPath)) continue;
      const hash = hashManagedDirectory(skillPath);
      const previous = skills.get(skill);
      if (previous && previous.hash !== hash) {
        throw new DrwnError(
          "WORKER_CAPABILITY_CONFLICT",
          `Worker capability skill:${skill} has incompatible definitions from ${previous.card} and ${card.name}`,
        );
      }
      skills.set(skill, { hash, card: card.name });
    }
    for (const [serverName, server] of Object.entries(card.manifest.servers ?? {})) {
      const hash = canonicalJsonHash(server);
      const previous = servers.get(serverName);
      if (previous && previous.hash !== hash) {
        throw new DrwnError(
          "WORKER_CAPABILITY_CONFLICT",
          `Worker capability mcp:${serverName} has incompatible definitions from ${previous.card} and ${card.name}`,
        );
      }
      servers.set(serverName, { hash, card: card.name });
    }
  }
}

export async function resolveSkillSource(
  name: string,
  activeCards: CardLockEntry[],
  repoRoot: string,
  agentsDir: string,
  contentRoots?: Record<string, string>,
  machineSources?: Record<string, ResolvedMachineSkill>,
): Promise<ResolvedSkillSource> {
  for (let index = activeCards.length - 1; index >= 0; index -= 1) {
    const card = activeCards[index]!;
    if (!card.skills.includes(name)) {
      continue;
    }
    const root = contentRoots ? contentRoots[card.name] : card.path;
    if (!root) {
      return {
        layer: "missing",
        reason: contentRoots
          ? `no content root resolved for ${card.name} in project scope`
          : `card inventory is corrupt for ${card.name}@${card.version}: missing content root. Run \`drwn install --no-write\` to hydrate locked Card bytes.`,
      };
    }
    const path = join(root, "skills", name);
    if (!existsSync(path)) {
      return {
        layer: "missing",
        reason: `card inventory is corrupt for ${card.name}@${card.version}: missing skills/${name}. Run \`drwn install --no-write\` to hydrate locked Card bytes.`,
      };
    }
    return {
      layer: "card",
      cardName: card.name,
      cardVersion: card.version,
      path,
    };
  }

  const machineSource = machineSources?.[name];
  if (machineSource) {
    return {
      layer: "machine-worker",
      path: machineSource.path,
      scope: machineSource.scope,
      cardName: machineSource.cardName,
      cardVersion: machineSource.cardVersion,
    };
  }

  const userDefault = await findAvailableSkill(repoRoot, agentsDir, name);
  if (userDefault) {
    return {
      layer: "user-default",
      path: userDefault.path,
      scope: userDefault.scope,
    };
  }

  return {
    layer: "missing",
    reason: `skill '${name}' is not provided by the selected Worker closure and is not available as a user-default; check spelling or select a Worker that provides it.`,
  };
}
