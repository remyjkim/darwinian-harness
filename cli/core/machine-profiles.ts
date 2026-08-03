// ABOUTME: Initializes machine V2 from the recommended immutable Worker Blueprint descriptor.
// ABOUTME: Keeps guided acceptance fail-closed and writes explicit empty intent when declined.

import { isDeepStrictEqual } from "node:util";
import type { CardLockEntry, WorkerRootLockEntry } from "./card-lock";
import type { CardManifest } from "./card-manifest";
import { DrwnError } from "./errors";
import { createEmptyMachineConfig, readMachineConfigFile, writeMachineConfigFile } from "./machine-config";
import {
  RECOMMENDED_MACHINE_WORKER,
  assertRecommendedMachineWorkerGraph,
  loadMachineWorkerRegistry,
} from "./machine-worker-contract";
import { resolveMachineConfigPath } from "./store-paths";
import { applyMachineWorkerRoots } from "./worker-machine";
import type { ResolvedWorkerGraph } from "./worker-graph";

export interface MachineWorkerInitDescriptor {
  source: string;
  name: string;
  version: string;
  minDrwnVersion: string;
  commit: string;
  treeSha: string;
  integrity: string;
  members: ReadonlyArray<{ name: string; source: string }>;
}

function initUnavailable(message: string, cause?: unknown): DrwnError {
  return new DrwnError(
    "MACHINE_WORKER_NOT_AVAILABLE",
    message,
    ["Retry when the immutable Worker release is reachable, or rerun guided init and decline it."],
    cause,
  );
}

export async function verifyMachineProfilePin(
  _agentsDir: string,
  _pin: unknown,
): Promise<{ dir: string; manifest: CardManifest }> {
  throw new DrwnError(
    "MACHINE_PROFILE_RETIRED",
    "Machine profiles are retired; select a machine Worker Blueprint with drwn apply --root or drwn use --root",
  );
}

function assertInitDescriptorGraph(
  graph: ResolvedWorkerGraph,
  descriptor: MachineWorkerInitDescriptor,
): void {
  if (
    descriptor.source === RECOMMENDED_MACHINE_WORKER.source
    && descriptor.name === RECOMMENDED_MACHINE_WORKER.name
  ) {
    assertRecommendedMachineWorkerGraph(graph);
    return;
  }

  const root = graph.roots[0] as WorkerRootLockEntry | undefined;
  const rootCard = graph.cards[0] as CardLockEntry | undefined;
  const memberNames = descriptor.members.map((member) => member.name);
  if (
    graph.roots.length !== 1
    || !root
    || root.name !== descriptor.name
    || root.requested !== descriptor.source
    || root.kind !== "blueprint"
    || !isDeepStrictEqual(root.members, memberNames)
    || !rootCard
    || rootCard.version !== descriptor.version
    || rootCard.integrity !== descriptor.integrity
    || rootCard.treeSha !== descriptor.treeSha
    || rootCard.git?.commit !== descriptor.commit
    || rootCard.manifest.harness?.minVersion !== descriptor.minDrwnVersion
    || !isDeepStrictEqual(rootCard.manifest.composedFrom ?? [], descriptor.members.map((member) => member.source))
  ) {
    throw initUnavailable("Resolved machine Worker does not match its immutable descriptor");
  }
}

export async function initializeMachineWorker(options: {
  agentsDir: string;
  repoRoot: string;
  guided: boolean;
  promptRecommended?: () => Promise<boolean>;
  descriptor?: MachineWorkerInitDescriptor;
}): Promise<{ created: boolean; selectedWorker: string | null }> {
  const path = resolveMachineConfigPath(options.agentsDir);
  const existing = await readMachineConfigFile(path);
  if (existing) {
    return { created: false, selectedWorker: existing.capabilities.activeWorker };
  }

  if (!options.guided || !(await (options.promptRecommended?.() ?? Promise.resolve(true)))) {
    const config = createEmptyMachineConfig();
    await writeMachineConfigFile(path, config);
    return { created: true, selectedWorker: null };
  }

  const descriptor = options.descriptor ?? (await loadMachineWorkerRegistry(options.repoRoot)).workers[0]!;
  try {
    const mutation = await applyMachineWorkerRoots(options.agentsDir, [descriptor.source], {
      allowUntrustedSource: true,
      repoRoot: options.repoRoot,
      validateGraph: (graph) => assertInitDescriptorGraph(graph, descriptor),
    });
    return { created: true, selectedWorker: mutation.activeWorker };
  } catch (error) {
    if (error instanceof DrwnError && error.code === "MACHINE_WORKER_NOT_AVAILABLE") throw error;
    throw initUnavailable(`Cannot resolve recommended machine Worker ${descriptor.name}`, error);
  }
}
