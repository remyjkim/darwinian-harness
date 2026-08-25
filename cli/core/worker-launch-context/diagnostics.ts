// ABOUTME: Scans, verifies, and classifies generated Worker launch contexts without a mutable index.
// ABOUTME: Recomputes currentness from recorded request inputs while retaining corrupt or drifted evidence.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DrwnError } from "../errors";
import { parseWorkerLaunchContextBytes, WORKER_LAUNCH_MAX_CONTEXTS, type WorkerLaunchContextV1 } from "./contracts";
import { planProjectWorkerLaunchContext } from "./service";
import { resolveConcreteWorkerLaunchStoreRoot, verifyWorkerLaunchContext } from "./store";

export type WorkerLaunchContextState = "current" | "obsolete" | "drifted" | "corrupt" | "foreign";

export interface WorkerLaunchContextInventoryItem {
  contextId?: string;
  target?: "claude" | "codex";
  assignedRoot?: string;
  artifactDir: string;
  state: WorkerLaunchContextState;
  localOnly?: boolean;
  createdAt?: string;
  issue?: { code: string; message: string };
}

export interface WorkerLaunchContextInventory {
  schema: "drwn.worker-launch-context-list";
  schemaVersion: 1;
  root: string;
  count: number;
  current: number;
  obsolete: number;
  drifted: number;
  corrupt: number;
  foreign: number;
  contexts: WorkerLaunchContextInventoryItem[];
}

async function readManifest(path: string): Promise<WorkerLaunchContextV1 | null> {
  try {
    return parseWorkerLaunchContextBytes(await readFile(join(path, "manifest.json")));
  } catch {
    return null;
  }
}

async function candidateDirectories(root: string): Promise<Array<{ target?: "claude" | "codex"; path: string }>> {
  let targets;
  try {
    targets = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const candidates: Array<{ target?: "claude" | "codex"; path: string }> = [];
  for (const targetEntry of targets.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    if (targetEntry.name.startsWith(".")) continue;
    const target = targetEntry.name === "claude" || targetEntry.name === "codex" ? targetEntry.name : undefined;
    const targetPath = join(root, targetEntry.name);
    if (!targetEntry.isDirectory() || targetEntry.isSymbolicLink() || !target) {
      candidates.push({ path: targetPath });
      continue;
    }
    for (const entry of (await readdir(targetPath, { withFileTypes: true })).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      candidates.push({ target, path: join(targetPath, entry.name) });
    }
  }
  if (candidates.length > WORKER_LAUNCH_MAX_CONTEXTS) {
    throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", `Worker launch context store exceeds ${WORKER_LAUNCH_MAX_CONTEXTS} entries`);
  }
  return candidates;
}

export async function listProjectWorkerLaunchContexts(input: {
  projectRoot: string;
  repoRoot?: string;
  agentsDir?: string;
  homeDir?: string;
}): Promise<WorkerLaunchContextInventory> {
  const root = join(input.projectRoot, ".agents", "drwn", "generated", "launch-contexts", "v1");
  const items: WorkerLaunchContextInventoryItem[] = [];
  const currentPlans = new Map<string, Promise<string | null>>();
  const concreteRoot = await resolveConcreteWorkerLaunchStoreRoot(input.projectRoot, { create: false });
  for (const candidate of await candidateDirectories(concreteRoot ?? root)) {
    const manifest = await readManifest(candidate.path);
    try {
      const verified = await verifyWorkerLaunchContext(candidate.path);
      const context = verified.context;
      const key = JSON.stringify([context.target, context.assignedRoot.name, context.request.enabledOptionalMcp, context.request.strict]);
      let plannedId = currentPlans.get(key);
      if (!plannedId) {
        plannedId = planProjectWorkerLaunchContext({
          projectRoot: input.projectRoot,
          assignedRoot: context.assignedRoot.name,
          target: context.target,
          enabledOptionalMcp: context.request.enabledOptionalMcp,
          strict: context.request.strict,
          repoRoot: input.repoRoot,
          agentsDir: input.agentsDir,
          homeDir: input.homeDir,
        }).then((plan) => plan.plan.plannedContextId).catch(() => null);
        currentPlans.set(key, plannedId);
      }
      const current = await plannedId;
      items.push({
        contextId: context.contextId,
        target: context.target,
        assignedRoot: context.assignedRoot.name,
        artifactDir: candidate.path,
        state: current === context.contextId ? "current" : "obsolete",
        localOnly: context.provenance.localOnly,
        createdAt: verified.receipt.createdAt,
      });
    } catch (error) {
      const code = error instanceof DrwnError ? error.code : "LAUNCH_CONTEXT_CORRUPT";
      const state: WorkerLaunchContextState = code === "LAUNCH_CONTEXT_DRIFT"
        ? "drifted"
        : code === "LAUNCH_CONTEXT_FOREIGN"
          ? "foreign"
          : "corrupt";
      items.push({
        ...(manifest ? {
          contextId: manifest.contextId,
          target: manifest.target,
          assignedRoot: manifest.assignedRoot.name,
          localOnly: manifest.provenance.localOnly,
        } : candidate.target ? { target: candidate.target } : {}),
        artifactDir: candidate.path,
        state,
        issue: { code, message: error instanceof Error ? error.message : "Worker launch context is invalid" },
      });
    }
  }
  items.sort((left, right) =>
    (left.target ?? "").localeCompare(right.target ?? "") ||
    (left.contextId ?? left.artifactDir).localeCompare(right.contextId ?? right.artifactDir)
  );
  const count = (state: WorkerLaunchContextState) => items.filter((item) => item.state === state).length;
  return {
    schema: "drwn.worker-launch-context-list",
    schemaVersion: 1,
    root,
    count: items.length,
    current: count("current"),
    obsolete: count("obsolete"),
    drifted: count("drifted"),
    corrupt: count("corrupt"),
    foreign: count("foreign"),
    contexts: items,
  };
}
