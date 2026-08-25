// ABOUTME: Publishes and verifies immutable self-identifying Worker launch-context directories.
// ABOUTME: Stages concrete trees on one filesystem, flushes, atomically renames, reuses winners, and refuses drift.

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DrwnError } from "../errors";
import { flushDirectoryTree, syncDirectory } from "../fs";
import { acquireOwnerLock, releaseOwnerLock } from "../owner-lock";
import { DRWN_VERSION } from "../version";
import { hashManagedContent, hashManagedDirectory } from "../write-record";
import { canonicalJsonHash } from "../managed-fields";
import {
  parseWorkerLaunchContext,
  parseWorkerLaunchContextBytes,
  parseWorkerLaunchReceipt,
  parseWorkerLaunchReceiptBytes,
  type WorkerLaunchContextV1,
  type WorkerLaunchReceiptV1,
} from "./contracts";
import type { RenderedWorkerLaunchTarget } from "./materializer-types";
import { WORKER_LAUNCH_RENDERER_VERSION, type PlannedWorkerLaunchContext } from "./plan";
import { assertWorkerLaunchSourceUnchanged } from "./snapshot";
import type { WorkerLaunchMaterializationSource } from "./plan";

export type WorkerLaunchStoreCheckpoint = "after-stage-flush" | "before-source-recheck" | "before-rename" | "after-rename";

function isCode(error: unknown, codes: string[]) {
  return Boolean(error && typeof error === "object" && "code" in error && codes.includes(String(error.code)));
}

async function assertConcreteTree(root: string): Promise<void> {
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Worker launch context contains a non-concrete directory: ${root}`);
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Worker launch context contains a symlink: ${path}`);
    if (entry.isDirectory()) await assertConcreteTree(path);
    else if (!entry.isFile()) throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Worker launch context contains unsupported content: ${path}`);
  }
}

function contained(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel);
}

const STORE_SEGMENTS = [".agents", "drwn", "generated", "launch-contexts", "v1"] as const;
const STORE_LOCK_WAIT_MS = 60_000;
const STORE_LOCK_RETRY_MS = 25;

async function concreteDirectory(path: string, code: string): Promise<void> {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    throw new DrwnError(code, `Worker launch context path is unavailable: ${path}`, undefined, error);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(path) !== resolve(path)) {
    throw new DrwnError(code, `Worker launch context path is not a concrete canonical directory: ${path}`);
  }
}

export async function resolveConcreteWorkerLaunchStoreRoot(
  projectRoot: string,
  options: { create: boolean },
): Promise<string | null> {
  const canonicalProject = await realpath(projectRoot).catch((error) => {
    throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", `Project root is unavailable: ${projectRoot}`, undefined, error);
  });
  if (canonicalProject !== resolve(projectRoot)) {
    throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", `Project root is not canonical: ${projectRoot}`);
  }
  let current = canonicalProject;
  for (const segment of STORE_SEGMENTS) {
    current = join(current, segment);
    try {
      await concreteDirectory(current, "LAUNCH_CONTEXT_STORE_INVALID");
    } catch (error) {
      if (!(error instanceof DrwnError) || !error.cause || typeof error.cause !== "object" || !("code" in error.cause) || error.cause.code !== "ENOENT") {
        throw error;
      }
      if (!options.create) return null;
      try {
        await mkdir(current, { recursive: false });
      } catch (mkdirError) {
        if (!isCode(mkdirError, ["EEXIST"])) throw mkdirError;
      }
      await concreteDirectory(current, "LAUNCH_CONTEXT_STORE_INVALID");
    }
  }
  return current;
}

export async function withWorkerLaunchContextLock<T>(
  projectRoot: string,
  contextId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!/^sha256-[a-f0-9]{64}$/.test(contextId)) {
    throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", `Invalid Worker launch context lock identity: ${contextId}`);
  }
  const storeRoot = await resolveConcreteWorkerLaunchStoreRoot(projectRoot, { create: true });
  if (!storeRoot) throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", "Worker launch context store could not be created");
  const locksRoot = join(storeRoot, ".locks");
  try {
    await mkdir(locksRoot, { recursive: false });
  } catch (error) {
    if (!isCode(error, ["EEXIST"])) throw error;
  }
  await concreteDirectory(locksRoot, "LAUNCH_CONTEXT_STORE_INVALID");
  const options = {
    path: join(locksRoot, `${contextId}.lock`),
    label: `Worker launch context ${contextId} mutation`,
    busyCode: "LAUNCH_CONTEXT_STORE_BUSY",
    unrecoverableCode: "LAUNCH_CONTEXT_STORE_LOCK_UNRECOVERABLE",
  };
  const deadline = Date.now() + STORE_LOCK_WAIT_MS;
  while (true) {
    try {
      const owner = await acquireOwnerLock(options);
      try {
        return await operation();
      } finally {
        await releaseOwnerLock(options, owner);
      }
    } catch (error) {
      if (!(error instanceof DrwnError) || error.code !== "LAUNCH_CONTEXT_STORE_BUSY" || Date.now() >= deadline) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, STORE_LOCK_RETRY_MS));
    }
  }
}

async function assertMaterializationSourcesUnchanged(sources: WorkerLaunchMaterializationSource[]): Promise<void> {
  for (const source of sources) {
    let currentHash: string | null = null;
    try {
      const stats = await lstat(source.path);
      if (source.kind === "file" && stats.isFile() && !stats.isSymbolicLink()) {
        currentHash = hashManagedContent(await readFile(source.path));
      } else if (source.kind === "directory" && stats.isDirectory() && !stats.isSymbolicLink()) {
        await assertConcreteTree(source.path);
        currentHash = hashManagedDirectory(source.path);
      }
    } catch {
      currentHash = null;
    }
    if (currentHash !== source.contentHash) {
      throw new DrwnError(
        "LAUNCH_PROJECT_STATE_CHANGED",
        `Worker launch capability source changed after planning: ${source.path}`,
        ["Prepare the launch context again from the current project state."],
      );
    }
  }
}

function stagePublicationBytes(contextId: string) {
  return `${JSON.stringify({
    schema: "drwn.worker-launch-publication",
    schemaVersion: 1,
    contextId,
  }, null, 2)}\n`;
}

function isOwnedStagePublication(value: unknown, contextId: string): boolean {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "contextId,schema,schemaVersion" &&
    (value as Record<string, unknown>).schema === "drwn.worker-launch-publication" &&
    (value as Record<string, unknown>).schemaVersion === 1 &&
    (value as Record<string, unknown>).contextId === contextId
  );
}

async function recoverOwnedStages(targetRoot: string, contextId: string): Promise<void> {
  const prefix = `.stage-${contextId}-`;
  const entries = (await readdir(targetRoot, { withFileTypes: true }))
    .filter((entry) => entry.name.startsWith(prefix));
  if (entries.length > 1_024) {
    throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", "Worker launch context stage recovery exceeds its bounded entry limit");
  }
  for (const entry of entries) {
    const stageDir = join(targetRoot, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      await concreteDirectory(stageDir, "LAUNCH_CONTEXT_STORE_INVALID");
      const publicationPath = join(stageDir, "publication.json");
      const publicationStats = await lstat(publicationPath);
      if (!publicationStats.isFile() || publicationStats.isSymbolicLink()) continue;
      const publication = JSON.parse(await readFile(publicationPath, "utf8")) as unknown;
      if (!isOwnedStagePublication(publication, contextId)) continue;
      await rm(stageDir, { recursive: true, force: false });
      await syncDirectory(targetRoot);
    } catch (error) {
      if (isCode(error, ["ENOENT"])) continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
}

function expectedContextDigest(input: {
  planned: PlannedWorkerLaunchContext;
  launch: WorkerLaunchContextV1["launch"];
}) {
  const { plan } = input.planned;
  return canonicalJsonHash({
    contextId: plan.plannedContextId,
    target: plan.target,
    kind: plan.target,
    baseRoot: plan.baseRoot,
    assignedRoot: plan.assignedRoot,
    artifactDir: plan.plannedArtifactDir,
    request: { enabledOptionalMcp: plan.optionalMcp.requested, strict: plan.consent.strict },
    launch: input.launch,
    capabilities: {
      skills: plan.capabilities.skills.map((entry) => entry.id),
      mcpServers: plan.capabilities.mcpServers.map((entry) => entry.id),
      hooks: plan.capabilities.hooks.map((entry) => entry.id),
      instructions: plan.capabilities.instructions.present,
    },
    sourceState: input.planned.sourceState,
    provenance: {
      drwnVersion: DRWN_VERSION,
      localOnly: plan.assignedRoot.localOnly,
    },
    warnings: plan.warnings,
  });
}

function actualContextDigest(context: WorkerLaunchContextV1) {
  return canonicalJsonHash({
    contextId: context.contextId,
    target: context.target,
    kind: context.kind,
    baseRoot: context.baseRoot,
    assignedRoot: context.assignedRoot,
    artifactDir: context.artifactDir,
    request: context.request,
    launch: context.launch,
    capabilities: context.capabilities,
    sourceState: context.sourceState,
    provenance: {
      drwnVersion: context.provenance.drwnVersion,
      localOnly: context.provenance.localOnly,
    },
    warnings: context.warnings,
  });
}

export async function verifyWorkerLaunchContext(
  artifactDir: string,
  expected?: {
    planned: PlannedWorkerLaunchContext;
    launch: WorkerLaunchContextV1["launch"];
  },
): Promise<{ context: WorkerLaunchContextV1; receipt: WorkerLaunchReceiptV1 }> {
  let rootStats;
  try {
    rootStats = await lstat(artifactDir);
  } catch (error) {
    if (isCode(error, ["ENOENT"])) throw new DrwnError("LAUNCH_CONTEXT_FOREIGN", `Worker launch context is absent: ${artifactDir}`);
    throw error;
  }
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new DrwnError("LAUNCH_CONTEXT_FOREIGN", `Worker launch context path is not an owned directory: ${artifactDir}`);
  }
  await concreteDirectory(artifactDir, "LAUNCH_CONTEXT_FOREIGN");
  let context: WorkerLaunchContextV1;
  let receipt: WorkerLaunchReceiptV1;
  try {
    [context, receipt] = await Promise.all([
      readFile(join(artifactDir, "manifest.json")).then(parseWorkerLaunchContextBytes),
      readFile(join(artifactDir, "receipt.json")).then(parseWorkerLaunchReceiptBytes),
    ]);
  } catch (error) {
    if (isCode(error, ["ENOENT"])) throw new DrwnError("LAUNCH_CONTEXT_FOREIGN", `Worker launch context lacks ownership evidence: ${artifactDir}`);
    if (error instanceof DrwnError) throw error;
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", `Worker launch context evidence is unreadable: ${artifactDir}`, undefined, error);
  }
  if (context.artifactDir !== artifactDir || receipt.contextId !== context.contextId) {
    throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", "Worker launch manifest, receipt, and artifact path disagree");
  }
  if (expected && expectedContextDigest(expected) !== actualContextDigest(context)) {
    throw new DrwnError("LAUNCH_CONTEXT_FOREIGN", "Existing Worker launch context does not match the requested plan");
  }
  if (receipt.rendererVersion !== WORKER_LAUNCH_RENDERER_VERSION) {
    throw new DrwnError("LAUNCH_CONTEXT_FOREIGN", "Worker launch context renderer version does not match this Worker");
  }
  const receiptStats = await lstat(join(artifactDir, "receipt.json"));
  if (!receiptStats.isFile() || receiptStats.isSymbolicLink()) {
    throw new DrwnError("LAUNCH_CONTEXT_DRIFT", "Worker launch receipt is not a concrete file");
  }
  const expectedTopLevel = new Set(["receipt.json", ...receipt.files.map((entry) => entry.path.split("/")[0]!) ]);
  const actualTopLevel = (await readdir(artifactDir)).sort();
  if (actualTopLevel.length !== expectedTopLevel.size || actualTopLevel.some((entry) => !expectedTopLevel.has(entry))) {
    throw new DrwnError("LAUNCH_CONTEXT_DRIFT", "Worker launch context contains unowned or missing top-level content");
  }
  for (const entry of receipt.files) {
    const path = resolve(artifactDir, entry.path);
    if (!contained(artifactDir, path)) throw new DrwnError("LAUNCH_CONTEXT_CORRUPT", `Receipt path escapes context root: ${entry.path}`);
    let stats;
    try {
      stats = await lstat(path);
    } catch (error) {
      throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Owned Worker launch path is missing: ${entry.path}`, undefined, error);
    }
    if (stats.isSymbolicLink()) throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Owned Worker launch path became a symlink: ${entry.path}`);
    const currentHash = entry.kind === "file"
      ? stats.isFile() ? hashManagedContent(await readFile(path)) : null
      : stats.isDirectory() ? (await assertConcreteTree(path), hashManagedDirectory(path)) : null;
    if (currentHash !== entry.contentHash) {
      throw new DrwnError("LAUNCH_CONTEXT_DRIFT", `Owned Worker launch content drifted: ${entry.path}`);
    }
  }
  return { context, receipt };
}

async function publishWorkerLaunchContextUnlocked(input: {
  planned: PlannedWorkerLaunchContext;
  compatibility: { minimumVersion: string; probed: true; observedVersion: string };
  expectedLaunch: WorkerLaunchContextV1["launch"];
  render: (stageDir: string) => Promise<RenderedWorkerLaunchTarget>;
  assertSourceUnchanged?: () => Promise<void>;
  assertBaseProjectionCurrent?: () => Promise<void>;
  now?: () => Date;
  checkpoint?: (checkpoint: WorkerLaunchStoreCheckpoint) => void | Promise<void>;
}): Promise<{ context: WorkerLaunchContextV1; receipt: WorkerLaunchReceiptV1; reused: boolean }> {
  const { plan } = input.planned;
  const artifactDir = plan.plannedArtifactDir;
  const storeRoot = await resolveConcreteWorkerLaunchStoreRoot(plan.projectRoot, { create: true });
  if (!storeRoot) throw new DrwnError("LAUNCH_CONTEXT_STORE_INVALID", "Worker launch context store could not be created");
  const targetRoot = join(storeRoot, plan.target);
  if (!contained(targetRoot, artifactDir) || relative(targetRoot, artifactDir) !== plan.plannedContextId) {
    throw new DrwnError("LAUNCH_MATERIALIZATION_FAILED", "Planned Worker launch artifact path escapes its target root");
  }
  try {
    await mkdir(targetRoot, { recursive: false });
  } catch (error) {
    if (!isCode(error, ["EEXIST"])) throw error;
  }
  await concreteDirectory(targetRoot, "LAUNCH_CONTEXT_STORE_INVALID");
  await recoverOwnedStages(targetRoot, plan.plannedContextId);
  if (existsSync(artifactDir)) {
    await assertMaterializationSourcesUnchanged(input.planned.materializationSources);
    await input.assertBaseProjectionCurrent?.();
    await (input.assertSourceUnchanged ?? (() => assertWorkerLaunchSourceUnchanged(plan.projectRoot, input.planned.sourceInputDigest)))();
    return { ...await verifyWorkerLaunchContext(artifactDir, { planned: input.planned, launch: input.expectedLaunch }), reused: true };
  }
  const stageDir = join(targetRoot, `.stage-${plan.plannedContextId}-${randomBytes(8).toString("hex")}`);
  await mkdir(stageDir, { recursive: false });
  try {
    await writeFile(join(stageDir, "publication.json"), stagePublicationBytes(plan.plannedContextId));
    const rendered = await input.render(stageDir);
    if (canonicalJsonHash(rendered.launch) !== canonicalJsonHash(input.expectedLaunch)) {
      throw new DrwnError("LAUNCH_MATERIALIZATION_FAILED", "Target renderer returned an unexpected launch descriptor");
    }
    const context = parseWorkerLaunchContext({
      schema: "drwn.worker-launch-context",
      schemaVersion: 1,
      contextId: plan.plannedContextId,
      target: plan.target,
      kind: plan.target,
      baseRoot: plan.baseRoot,
      assignedRoot: plan.assignedRoot,
      artifactDir,
      request: { enabledOptionalMcp: plan.optionalMcp.requested, strict: plan.consent.strict },
      launch: rendered.launch,
      capabilities: {
        skills: plan.capabilities.skills.map((entry) => entry.id),
        mcpServers: plan.capabilities.mcpServers.map((entry) => entry.id),
        hooks: plan.capabilities.hooks.map((entry) => entry.id),
        instructions: plan.capabilities.instructions.present,
      },
      sourceState: input.planned.sourceState,
      targetCompatibility: input.compatibility,
      provenance: {
        drwnVersion: DRWN_VERSION,
        sourceProjectLockDigest: input.planned.sourceProvenance.sourceProjectLockDigest,
        ...(input.planned.sourceProvenance.sourceLocalLockDigest
          ? { sourceLocalLockDigest: input.planned.sourceProvenance.sourceLocalLockDigest }
          : {}),
        localOnly: plan.assignedRoot.localOnly,
      },
      warnings: plan.warnings,
    });
    await writeFile(join(stageDir, "manifest.json"), `${JSON.stringify(context, null, 2)}\n`);
    const owned = [
      ...(rendered.targetDir ? [{ path: plan.target, kind: "directory" as const, contentHash: hashManagedDirectory(rendered.targetDir) }] : []),
      { path: "manifest.json", kind: "file" as const, contentHash: hashManagedContent(await readFile(join(stageDir, "manifest.json"))) },
      { path: "publication.json", kind: "file" as const, contentHash: hashManagedContent(await readFile(join(stageDir, "publication.json"))) },
    ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const receipt = parseWorkerLaunchReceipt({
      schema: "drwn.worker-launch-receipt",
      schemaVersion: 1,
      contextId: plan.plannedContextId,
      createdAt: (input.now ?? (() => new Date()))().toISOString(),
      rendererVersion: WORKER_LAUNCH_RENDERER_VERSION,
      files: owned,
    });
    await writeFile(join(stageDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    await flushDirectoryTree(stageDir);
    await input.checkpoint?.("after-stage-flush");
    await input.checkpoint?.("before-source-recheck");
    await assertMaterializationSourcesUnchanged(input.planned.materializationSources);
    await input.assertBaseProjectionCurrent?.();
    await (input.assertSourceUnchanged ?? (() => assertWorkerLaunchSourceUnchanged(plan.projectRoot, input.planned.sourceInputDigest)))();
    await input.checkpoint?.("before-rename");
    try {
      await rename(stageDir, artifactDir);
      await syncDirectory(targetRoot);
      await input.checkpoint?.("after-rename");
      return { context, receipt, reused: false };
    } catch (error) {
      if (!isCode(error, ["EEXIST", "ENOTEMPTY"])) throw error;
      const winner = await verifyWorkerLaunchContext(artifactDir, { planned: input.planned, launch: input.expectedLaunch });
      return { ...winner, reused: true };
    }
  } finally {
    await rm(stageDir, { recursive: true, force: true });
    await syncDirectory(targetRoot);
  }
}

export async function publishWorkerLaunchContext(
  input: Parameters<typeof publishWorkerLaunchContextUnlocked>[0],
): ReturnType<typeof publishWorkerLaunchContextUnlocked> {
  return withWorkerLaunchContextLock(
    input.planned.plan.projectRoot,
    input.planned.plan.plannedContextId,
    () => publishWorkerLaunchContextUnlocked(input),
  );
}
