// ABOUTME: Captures an existing project's effective harness state as a card source.
// ABOUTME: Provides the Wave 2 authoring entry point shared by core tests and CLI.

import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createCardSource } from "./card-store";
import { type CardManifest } from "./card-manifest";
import { resolveSkillSource } from "./card-skill-resolver";
import { buildEffectiveState } from "./effective-state";
import { writeAtomically } from "./fs";
import { sanitizeMcpServerSecrets } from "./mcp-secret-policy";
import type { SyncOptions } from "./types";

export interface CaptureProjectOptions {
  agentsDir: string;
  repoRoot: string;
  homeDir: string;
  projectPath: string;
  name: string;
  sourceDir: string;
  scope?: string;
  noGit?: boolean;
}

export interface CaptureProjectResult {
  name: string;
  sourceDir: string;
  manifestPath: string;
  skillCount: number;
  hookCount: number;
  serverCount: number;
  extensionCount: number;
  targetCount: number;
}

function uniqueSelectedSkills(include: string[] = [], exclude: string[] = []) {
  const excluded = new Set(exclude);
  return [...new Set(include)].filter((name) => !excluded.has(name));
}

export const sanitizeServerForCapture = sanitizeMcpServerSecrets;

export async function captureProjectAsCard(options: CaptureProjectOptions): Promise<CaptureProjectResult> {
  const state = await buildEffectiveState({
    repoRoot: options.repoRoot,
    agentsDir: options.agentsDir,
    homeDir: options.homeDir,
    cwd: options.projectPath,
  } satisfies SyncOptions);
  if (!state.projectRoot) {
    throw new Error(`Not a drwn project: ${options.projectPath} (no .agents/drwn/config.json)`);
  }
  if (!state.workerSelection?.selectedRoot) {
    throw new Error("ACTIVE_WORKER_REQUIRED: select an active Worker before capturing a project");
  }

  const source = await createCardSource({
    sourceDir: options.sourceDir,
    name: options.name,
    scope: options.scope,
    noGit: options.noGit,
  });

  try {
    const skillNames = uniqueSelectedSkills(state.skillSelection?.include, state.skillSelection?.exclude);
    for (const skillName of skillNames) {
      const resolved = await resolveSkillSource(
        skillName,
        state.skillApplyOrderCards,
        options.repoRoot,
        options.agentsDir,
        state.contentRootsByCard,
      );
      if (resolved.layer === "missing") {
        throw new Error(resolved.reason);
      }
      await cp(resolved.path, join(source.sourceDir, "skills", skillName), {
        recursive: true,
        verbatimSymlinks: false,
      });
    }

    const excludedHooks = new Set(state.projectConfig?.hooks?.exclude ?? []);
    const hookSources = new Map<string, string>();
    for (const card of state.activeCards) {
      const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
      for (const hook of card.hooks) {
        if (!excludedHooks.has(hook)) hookSources.set(hook, join(contentRoot, "hooks", hook));
      }
    }
    for (const [hook, hookSource] of hookSources) {
      await cp(hookSource, join(source.sourceDir, "hooks", hook), {
        recursive: true,
        verbatimSymlinks: false,
      });
    }

    const extensions = state.projectConfigWithCards?.extensions ?? {};
    const targets = state.projectConfigWithCards?.targets ?? {};
    const servers = Object.fromEntries(
      Object.entries(state.activeServers).map(([name, server]) => [name, sanitizeMcpServerSecrets(name, server)]),
    );
    const selectedCard = state.activeCards.find((card) => card.name === state.workerSelection!.selectedRoot!.name);
    const closure = state.activeCards.map((card) => `${card.name}@${card.version}`).join(", ");
    const manifest: CardManifest = {
      name: source.name,
      version: "0.1.0",
      description: `Captured from selected Worker ${selectedCard?.name ?? state.workerSelection.selectedRoot.name}@${selectedCard?.version ?? "unknown"}; closure: ${closure}`,
      ...(skillNames.length > 0 ? { skills: { include: skillNames } } : {}),
      ...(hookSources.size > 0 ? { hooks: { include: [...hookSources.keys()] } } : {}),
      ...(Object.keys(servers).length > 0 ? { servers } : {}),
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
      ...(Object.keys(targets).length > 0 ? { targets } : {}),
    };
    await writeAtomically(source.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    return {
      name: source.name,
      sourceDir: source.sourceDir,
      manifestPath: source.manifestPath,
      skillCount: skillNames.length,
      hookCount: hookSources.size,
      serverCount: Object.keys(servers).length,
      extensionCount: Object.keys(extensions).length,
      targetCount: Object.keys(targets).length,
    };
  } catch (error) {
    await rm(source.sourceDir, { recursive: true, force: true });
    throw error;
  }
}
