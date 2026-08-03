// ABOUTME: Materializes installed cards as isolated generated worker bundles.
// ABOUTME: Writes workers.json plus per-worker skills, hooks, and MCP indexes.

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import type { CardLockEntry, WorkerRootLockEntry } from "../card-lock";
import { isRegistryServerDefinition } from "../card-mcp";
import type { EffectiveState } from "../effective-state";
import { ensureParentDir, lstatSafe, realpathSafe } from "../fs";
import { materializeDir } from "../materialize";
import { bundleHookComposer, type HookPolicyBundleInput } from "../hook-generator/bundle-composer";
import { resolveHookRuntimes } from "../hook-generator/runtime-selection";
import { isHookConsentValid } from "../hook-consent";
import { renderJsonMcpConfig } from "../mcp";
import { writeManagedFile } from "../managed-file";
import {
  resolveGeneratedWorkerDir,
  resolveGeneratedWorkersDir,
  resolveStoreGeneratedDir,
} from "../store-paths";
import type { RegistryServer, SyncResult } from "../types";
import { hashManagedContent, hashManagedDirectory, ownManagedPath, type ManagedPath } from "../write-record";
import { assertWorkerCapabilityCompatibility } from "../card-skill-resolver";
import { composeConsentedInstructions } from "../sync-instructions";

function managedPath(scopeRoot: string, absolutePath: string) {
  return relative(scopeRoot, absolutePath).replace(/\\/g, "/");
}

function recordManagedContent(scopeRoot: string, pathValue: string, content: string): ManagedPath {
  return ownManagedPath(
    { path: managedPath(scopeRoot, pathValue), kind: "managed-content", contentHash: hashManagedContent(content) },
    { surface: "worker" },
  );
}

function recordManagedDirectory(scopeRoot: string, pathValue: string, dryRun: boolean): ManagedPath {
  return ownManagedPath({
    path: managedPath(scopeRoot, pathValue),
    kind: "managed-directory",
    contentHash: dryRun ? "sha256-dry-run" : hashManagedDirectory(pathValue),
  }, { surface: "worker" });
}

function recordGeneratedSymlink(scopeRoot: string, linkPath: string, targetPath: string): ManagedPath {
  return ownManagedPath(
    { path: managedPath(scopeRoot, linkPath), kind: "generated-symlink", generatedPath: targetPath },
    { surface: "worker" },
  );
}

function ensureDirSymlink(linkPath: string, targetPath: string, dryRun: boolean, result: SyncResult) {
  const stats = lstatSafe(linkPath);
  if (stats) {
    if (stats.isSymbolicLink() && realpathSafe(linkPath) === realpathSafe(targetPath)) {
      return;
    }
    result.changes.push(`replace ${linkPath}`);
    if (!dryRun) {
      rmSync(linkPath, { recursive: true, force: true });
    }
  }

  ensureParentDir(linkPath, dryRun);
  result.changes.push(`symlink ${linkPath} -> ${targetPath}`);
  if (!dryRun) {
    symlinkSync(targetPath, linkPath, "dir");
  }
}

function writeJson(pathValue: string, value: unknown, state: EffectiveState, result: SyncResult) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeManagedFile(pathValue, content, state.scopedOptions.dryRun, result);
  result.managedPaths?.push(recordManagedContent(state.scopeRoot, pathValue, content));
}

function writeInstructionsArtifact(pathValue: string, state: EffectiveState, cards: CardLockEntry[], result: SyncResult) {
  const composition = composeConsentedInstructions({
    cards,
    contentRootsByCard: state.contentRootsByCard,
  });
  result.warnings.push(
    ...composition.excluded.map(
      (item) =>
        `${item.card} explicit instructions excluded: ${item.reason}. Run drwn card trust ${item.card} --instructions.`,
    ),
  );
  if (!composition.bytes) {
    if (existsSync(pathValue)) {
      result.changes.push(`remove ${pathValue}`);
      if (!state.scopedOptions.dryRun) rmSync(pathValue, { force: true });
    }
    return;
  }
  const content = new TextDecoder().decode(composition.bytes);
  writeManagedFile(pathValue, content, state.scopedOptions.dryRun, result);
  result.managedPaths?.push(recordManagedContent(state.scopeRoot, pathValue, content));
}

function cardServers(card: CardLockEntry): Record<string, RegistryServer> {
  return Object.fromEntries(
    Object.entries(card.manifest.servers ?? {})
      .filter(([, server]) => isRegistryServerDefinition(server))
      .map(([name, server]) => [name, server as RegistryServer]),
  );
}

function hookPolicies(card: CardLockEntry, contentRoot: string): HookPolicyBundleInput[] {
  if (card.hooks.length === 0 || !isHookConsentValid(card)) {
    return [];
  }
  return card.hooks.map((policyName) => ({
    cardName: card.name,
    policyName,
    policyTsPath: join(contentRoot, "hooks", policyName, "policy.ts"),
  }));
}

async function materializeWorkerHooks(
  state: EffectiveState,
  cards: CardLockEntry[],
  workerDir: string,
  result: SyncResult,
) {
  const policies = cards.flatMap((card) =>
    hookPolicies(card, state.contentRootsByCard[card.name] ?? card.path)
  );
  if (policies.length === 0) {
    return;
  }
  const runtimes = resolveHookRuntimes({
    effectiveConfig: state.effectiveConfig,
    projectConfig: state.projectConfigWithCards ?? state.projectConfig,
    target: state.scopedOptions.target,
  });

  for (const runtime of runtimes) {
    if (runtime !== "claude-code" && runtime !== "codex") {
      continue;
    }
    const runtimeDir = runtime === "claude-code" ? "claude" : runtime;
    const outputDir = join(workerDir, "hooks", runtimeDir);
    const composerPath = join(outputDir, "composer.mjs");
    if (!state.scopedOptions.dryRun) {
      await bundleHookComposer({ runtime, outputDir, policies });
    } else {
      result.changes.push(`write ${composerPath}`);
      result.managedPaths?.push(ownManagedPath(
        { path: managedPath(state.scopeRoot, composerPath), kind: "managed-content", contentHash: "sha256-dry-run" },
        { surface: "worker" },
      ));
    }
  }
}

async function materializeWorker(
  state: EffectiveState,
  root: WorkerRootLockEntry,
  cards: CardLockEntry[],
  result: SyncResult,
) {
  assertWorkerCapabilityCompatibility(cards);
  const rootCard = cards[0];
  if (!rootCard || rootCard.name !== root.name) {
    throw new Error(`Worker root closure for ${root.name} does not begin with its root Card`);
  }
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const workerDir = resolveGeneratedWorkerDir(generatedDir, root.name);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(workerDir, { recursive: true });
  }

  const skillNames: string[] = [];
  for (const card of cards) {
    const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
    for (const skill of card.skills) {
      const target = join(contentRoot, "skills", skill);
      const link = join(workerDir, "skills", skill);
      if (!existsSync(target)) {
        continue;
      }
      if (!skillNames.includes(skill)) skillNames.push(skill);
      result.managedPaths?.push(
        ownManagedPath(materializeDir(target, link, {
          dryRun: state.scopedOptions.dryRun,
          result,
          relPath: managedPath(state.scopeRoot, link),
          labelSuffix: ` ← ${card.name} skill ${skill}`,
        }), { surface: "worker" }),
      );
    }
  }

  const servers = Object.assign({}, ...cards.map(cardServers)) as Record<string, RegistryServer>;
  if (Object.keys(servers).length > 0) {
    const serversPath = join(workerDir, "mcp", "servers.json");
    const content = renderJsonMcpConfig(servers);
    writeManagedFile(serversPath, content, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, serversPath, content));
  }

  await materializeWorkerHooks(state, cards, workerDir, result);
  writeInstructionsArtifact(join(workerDir, "instructions.md"), state, cards, result);

  const index = {
    schema: "drwn.generated-worker",
    schemaVersion: 1,
    name: rootCard.name,
    version: rootCard.version,
    integrity: rootCard.integrity,
    kind: root.kind,
    path: workerDir,
    members: cards.slice(1).map((card) => ({
      name: card.name,
      version: card.version,
      integrity: card.integrity,
    })),
    skills: skillNames,
    hooks: cards.flatMap((card) => card.hooks),
    servers: Object.keys(servers),
  };
  writeJson(join(workerDir, "worker.json"), index, state, result);

  if (!state.scopedOptions.dryRun && existsSync(workerDir) && lstatSync(workerDir).isDirectory()) {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, workerDir, false));
  } else {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, workerDir, true));
  }

  return {
    name: rootCard.name,
    version: rootCard.version,
    integrity: rootCard.integrity,
    path: workerDir,
    closure: cards.map((card) => ({ name: card.name, version: card.version, integrity: card.integrity })),
    active: state.workerSelection?.selectedRoot?.name === root.name,
  };
}

export async function syncWorkers(state: EffectiveState): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const workersRoot = resolveGeneratedWorkersDir(generatedDir);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(workersRoot, { recursive: true });
  }
  const selection = state.workerSelection;
  if (!selection) {
    return result;
  }
  const workers = [];
  const byName = new Map(selection.installedCards.map((card) => [card.name, card]));
  for (const root of selection.installedRoots) {
    const closure = [root.name, ...root.members].map((name) => {
      const card = byName.get(name);
      if (!card) throw new Error(`Worker root ${root.name} references missing Card ${name}`);
      return card;
    });
    workers.push(await materializeWorker(state, root, closure, result));
  }
  writeJson(
    join(generatedDir, "workers.json"),
    { schema: "drwn.generated-workers", schemaVersion: 1, workers },
    state,
    result,
  );
  if (selection.selectedRoot) {
    const active = workers.find((worker) => worker.name === selection.selectedRoot!.name);
    if (!active) throw new Error(`Active Worker ${selection.selectedRoot.name} has no generated bundle`);
    writeJson(
      join(generatedDir, "active-worker.json"),
      { schema: "drwn.generated-active-worker", schemaVersion: 1, ...active },
      state,
      result,
    );
    writeInstructionsArtifact(join(generatedDir, "instructions.md"), state, state.activeCards, result);
  }
  return result;
}
