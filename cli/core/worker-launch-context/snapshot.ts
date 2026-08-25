// ABOUTME: Captures bounded no-write project intent snapshots for Worker launch planning.
// ABOUTME: Uses before/after digest equality to reject torn committed or local Worker state.

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { buildEffectiveState, type EffectiveState } from "../effective-state";
import { DrwnError } from "../errors";
import { canonicalJsonHash } from "../managed-fields";
import { planRepositoryProjection, type RepositoryProjectionPlan } from "../sync";
import type { SyncOptions } from "../types";

export interface WorkerLaunchSourceSnapshot {
  projectRoot: string;
  configBytes: string;
  lockBytes: string;
  localConfigBytes?: string;
  localLockBytes?: string;
  sourceProjectConfigDigest: `sha256-${string}`;
  sourceProjectLockDigest: `sha256-${string}`;
  sourceLocalConfigDigest?: `sha256-${string}`;
  sourceLocalLockDigest?: `sha256-${string}`;
  inputDigest: `sha256-${string}`;
}

export interface StableWorkerLaunchInput {
  snapshot: WorkerLaunchSourceSnapshot;
  state: EffectiveState;
  projection: RepositoryProjectionPlan;
}

interface StableInputDependencies {
  capture: (projectRoot: string) => Promise<WorkerLaunchSourceSnapshot>;
  buildState: (options: SyncOptions) => Promise<EffectiveState>;
  planProjection: (options: SyncOptions) => Promise<RepositoryProjectionPlan>;
}

const defaultDependencies: StableInputDependencies = {
  capture: captureWorkerLaunchSourceSnapshot,
  buildState: buildEffectiveState,
  planProjection: planRepositoryProjection,
};

function contentDigest(bytes: string): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function captureWorkerLaunchSourceSnapshot(projectRoot: string): Promise<WorkerLaunchSourceSnapshot> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(projectRoot);
  } catch (error) {
    throw new DrwnError("PROJECT_NOT_INITIALIZED", `Project root is unavailable: ${projectRoot}`, undefined, error);
  }
  const stateDir = join(canonicalRoot, ".agents", "drwn");
  const [configBytes, lockBytes, localConfigBytes, localLockBytes] = await Promise.all([
    readOptional(join(stateDir, "config.json")),
    readOptional(join(stateDir, "card.lock")),
    readOptional(join(stateDir, "config.local.json")),
    readOptional(join(stateDir, "card.lock.local")),
  ]);
  if (configBytes === undefined || lockBytes === undefined) {
    throw new DrwnError(
      "PROJECT_NOT_INITIALIZED",
      `Worker launch contexts require ${join(stateDir, "config.json")} and card.lock`,
      ["Initialize the project and install its Worker graph before preparing a launch context."],
    );
  }
  const sourceProjectConfigDigest = contentDigest(configBytes);
  const sourceProjectLockDigest = contentDigest(lockBytes);
  const sourceLocalConfigDigest = localConfigBytes === undefined ? undefined : contentDigest(localConfigBytes);
  const sourceLocalLockDigest = localLockBytes === undefined ? undefined : contentDigest(localLockBytes);
  const inputDigest = canonicalJsonHash({
    projectRoot: canonicalRoot,
    sourceProjectConfigDigest,
    sourceProjectLockDigest,
    sourceLocalConfigDigest: sourceLocalConfigDigest ?? null,
    sourceLocalLockDigest: sourceLocalLockDigest ?? null,
  }) as `sha256-${string}`;
  return {
    projectRoot: canonicalRoot,
    configBytes,
    lockBytes,
    ...(localConfigBytes === undefined ? {} : { localConfigBytes }),
    ...(localLockBytes === undefined ? {} : { localLockBytes }),
    sourceProjectConfigDigest,
    sourceProjectLockDigest,
    ...(sourceLocalConfigDigest ? { sourceLocalConfigDigest } : {}),
    ...(sourceLocalLockDigest ? { sourceLocalLockDigest } : {}),
    inputDigest,
  };
}

export async function collectStableWorkerLaunchInput(input: {
  projectRoot: string;
  syncOptions: SyncOptions;
  maxAttempts?: number;
  dependencies?: Partial<StableInputDependencies>;
}): Promise<StableWorkerLaunchInput> {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const maxAttempts = input.maxAttempts ?? 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const before = await dependencies.capture(input.projectRoot);
    const state = await dependencies.buildState({
      ...input.syncOptions,
      cwd: before.projectRoot,
      scope: "project",
      forceMachineScope: false,
    });
    if (!state.projectRoot || !state.workerSelection) {
      throw new DrwnError("PROJECT_NOT_INITIALIZED", "No effective project Worker state is available");
    }
    const projection = state.workerSelection.activeWorker === null
      ? { current: true, issues: [], recordPresent: false, result: null }
      : await dependencies.planProjection({
          ...input.syncOptions,
          cwd: before.projectRoot,
          scope: "project",
          forceMachineScope: false,
        });
    const after = await dependencies.capture(input.projectRoot);
    if (before.inputDigest === after.inputDigest) {
      return { snapshot: after, state, projection };
    }
  }
  throw new DrwnError(
    "LAUNCH_PROJECT_STATE_CHANGED",
    `Project Worker input changed during ${maxAttempts} launch-context planning attempt(s)`,
    ["Retry after project Worker mutations have settled."],
  );
}

export async function assertWorkerLaunchSourceUnchanged(
  projectRoot: string,
  expectedInputDigest: string,
  dependencies: { capture?: (projectRoot: string) => Promise<Pick<WorkerLaunchSourceSnapshot, "inputDigest">> } = {},
): Promise<void> {
  const current = await (dependencies.capture ?? captureWorkerLaunchSourceSnapshot)(projectRoot);
  if (current.inputDigest !== expectedInputDigest) {
    throw new DrwnError(
      "LAUNCH_PROJECT_STATE_CHANGED",
      "Project Worker input changed after launch-context planning",
      ["Prepare the launch context again from the current project state."],
    );
  }
}
