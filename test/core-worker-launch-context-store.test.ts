// ABOUTME: Verifies immutable Worker launch-context publication, reuse, drift refusal, and race handling.
// ABOUTME: Proves success is emitted only after a flushed self-identifying context becomes final.

import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWorkerLaunchPlan } from "../cli/core/worker-launch-context/contracts";
import { hashManagedContent } from "../cli/core/write-record";

const roots: string[] = [];
const hash = (char: string) => `sha256-${char.repeat(64)}` as const;
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function planned(projectRoot: string) {
  const contextId = hash("3");
  const artifactDir = join(projectRoot, ".agents", "drwn", "generated", "launch-contexts", "v1", "codex", contextId);
  const assignedRoot = { name: "@test/reviewer", requested: "@test/reviewer@1.0.0", kind: "card" as const, closureDigest: hash("b"), localOnly: false };
  return {
    plan: parseWorkerLaunchPlan({
      schema: "drwn.worker-launch-plan",
      schemaVersion: 1,
      target: "codex",
      projectRoot,
      baseRoot: null,
      assignedRoot,
      baseClosure: [],
      assignedClosure: [{ name: "@test/reviewer", version: "1.0.0", integrity: hash("b"), local: false }],
      deltaClosure: [{ name: "@test/reviewer", version: "1.0.0", integrity: hash("b"), local: false }],
      capabilities: { skills: [], mcpServers: [], hooks: [], instructions: { present: false } },
      optionalMcp: { requested: [], enabled: [], rejected: [] },
      consent: { strict: false, included: [], excluded: [] },
      targetCompatibility: { minimumVersion: "0.149.0", probed: false },
      warnings: [],
      plannedContextId: contextId,
      plannedArtifactDir: artifactDir,
    }),
    materialization: { skills: [], mcpServers: [], hooks: [], instructionBytes: null },
    sourceState: {
      projectRootHash: hash("4"),
      baseClosureDigest: null,
      assignedClosureDigest: hash("b"),
      projectOverlayDigest: hash("5"),
    },
    sourceProvenance: { sourceProjectLockDigest: hash("9") },
    sourceInputDigest: hash("6"),
    materializationSources: [],
  };
}

async function fakeRender(stageDir: string, artifactDir: string, delay = 0) {
  if (delay) await Bun.sleep(delay);
  const targetDir = join(stageDir, "codex");
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, "payload.txt"), "immutable payload\n");
  return { targetDir, launch: { args: ["-C", join(artifactDir, "codex")], env: {} } };
}

test("store publishes once, reuses an identical context, and refuses drift without repair", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store").catch(() => ({} as any));
  expect(typeof store.publishWorkerLaunchContext).toBe("function");
  const input = planned(projectRoot);
  let renders = 0;
  const publish = () => store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: async (stageDir: string) => {
      renders += 1;
      return fakeRender(stageDir, input.plan.plannedArtifactDir);
    },
    assertSourceUnchanged: async () => undefined,
    now: () => new Date("2026-08-24T00:00:00.000Z"),
  });

  const first = await publish();
  const second = await publish();

  expect(first.reused).toBe(false);
  expect(second.reused).toBe(true);
  expect(renders).toBe(1);
  expect(JSON.parse(await readFile(join(input.plan.plannedArtifactDir, "manifest.json"), "utf8"))).toEqual(first.context);
  expect(JSON.parse(await readFile(join(input.plan.plannedArtifactDir, "receipt.json"), "utf8"))).toEqual(first.receipt);

  await writeFile(join(input.plan.plannedArtifactDir, "codex", "payload.txt"), "drift\n");
  await expect(publish()).rejects.toMatchObject({ code: "LAUNCH_CONTEXT_DRIFT" });
  expect(await readFile(join(input.plan.plannedArtifactDir, "codex", "payload.txt"), "utf8")).toBe("drift\n");
});

test("concurrent identical publishers produce one final context and one verified reuse", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-race-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  const options = () => ({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir, 20),
    assertSourceUnchanged: async () => undefined,
    now: () => new Date("2026-08-24T00:00:00.000Z"),
  });

  const results = await Promise.all([store.publishWorkerLaunchContext(options()), store.publishWorkerLaunchContext(options())]);

  expect(results.map((result: { reused: boolean }) => result.reused).sort()).toEqual([false, true]);
  expect((await readdir(input.plan.plannedArtifactDir)).sort()).toEqual(["codex", "manifest.json", "publication.json", "receipt.json"]);
});

test("a failure before rename exposes no final context and cleans its own stage", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-crash-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  await expect(store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
    checkpoint: (name: string) => { if (name === "before-rename") throw new Error("crash"); },
  })).rejects.toThrow("crash");
  await expect(access(input.plan.plannedArtifactDir)).rejects.toThrow();
  const targetRoot = join(projectRoot, ".agents", "drwn", "generated", "launch-contexts", "v1", "codex");
  expect((await readdir(targetRoot)).filter((name) => name.startsWith(".stage-"))).toEqual([]);
});

test("store refuses a generated-root symlink before staging outside the project", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-symlink-")));
  const outside = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-outside-")));
  roots.push(projectRoot, outside);
  await mkdir(join(projectRoot, ".agents", "drwn"), { recursive: true });
  await symlink(outside, join(projectRoot, ".agents", "drwn", "generated"));
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);

  await expect(store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
  })).rejects.toMatchObject({ code: "LAUNCH_CONTEXT_STORE_INVALID" });
  expect(await readdir(outside)).toEqual([]);
});

test("verified reuse rejects a consistently rehashed but altered launch descriptor", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-descriptor-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  const expectedLaunch = { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} };
  const publish = () => store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch,
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
  });
  await publish();
  const manifestPath = join(input.plan.plannedArtifactDir, "manifest.json");
  const receiptPath = join(input.plan.plannedArtifactDir, "receipt.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.launch.args = ["--dangerously-altered"];
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestBytes);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.files.find((entry: { path: string }) => entry.path === "manifest.json").contentHash = hashManagedContent(manifestBytes);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  await expect(publish()).rejects.toMatchObject({ code: "LAUNCH_CONTEXT_FOREIGN" });
});

test("publication refuses capability source bytes that changed after planning", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-source-")));
  roots.push(projectRoot);
  const source = join(projectRoot, "source.txt");
  await writeFile(source, "planned\n");
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  (input as any).materializationSources = [{ path: source, kind: "file", contentHash: hashManagedContent("planned\n") }];

  await expect(store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
    checkpoint: async (name: string) => {
      if (name === "before-source-recheck") await writeFile(source, "changed\n");
    },
  })).rejects.toMatchObject({ code: "LAUNCH_PROJECT_STATE_CHANGED" });
  await expect(access(input.plan.plannedArtifactDir)).rejects.toThrow();
});

test("the store mutation lock prevents reuse from racing a prune removal", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-prune-race-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  const expectedLaunch = { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} };
  const publish = () => store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch,
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
  });
  await publish();

  let unlock!: () => void;
  let locked!: () => void;
  const lockHeld = new Promise<void>((resolve) => { locked = resolve; });
  const release = new Promise<void>((resolve) => { unlock = resolve; });
  const pruning = store.withWorkerLaunchContextLock(projectRoot, input.plan.plannedContextId, async () => {
    locked();
    await release;
    await rm(input.plan.plannedArtifactDir, { recursive: true, force: false });
  });
  await lockHeld;
  let settled = false;
  const republish = publish().then((result: unknown) => { settled = true; return result; });
  await Bun.sleep(75);
  expect(settled).toBe(false);
  unlock();
  await pruning;
  expect((await republish).reused).toBe(false);
  expect(await access(input.plan.plannedArtifactDir).then(() => true)).toBe(true);
});

test("distinct context IDs publish independently instead of sharing a store-wide lock", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-distinct-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const first = planned(projectRoot);
  const second = planned(projectRoot);
  second.plan = parseWorkerLaunchPlan({
    ...second.plan,
    plannedContextId: hash("7"),
    plannedArtifactDir: join(projectRoot, ".agents", "drwn", "generated", "launch-contexts", "v1", "codex", hash("7")),
  });
  let entered = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const publish = (input: ReturnType<typeof planned>) => store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: async (stageDir: string) => {
      entered += 1;
      if (entered === 2) release();
      await gate;
      return fakeRender(stageDir, input.plan.plannedArtifactDir);
    },
    assertSourceUnchanged: async () => undefined,
  });
  const results = await Promise.all([publish(first), publish(second)]);
  expect(results.every((result) => result.reused === false)).toBe(true);
  expect(entered).toBe(2);
});

test("reuse tolerates unrelated full-lock provenance rotation that identity intentionally excludes", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-provenance-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  const expectedLaunch = { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} };
  const publish = () => store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch,
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
  });
  await publish();
  input.sourceProvenance.sourceProjectLockDigest = hash("8");
  expect((await publish()).reused).toBe(true);
});

test("publication recovers bounded self-identified crash-left stages for the same context", async () => {
  const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-store-stage-recovery-")));
  roots.push(projectRoot);
  const store = await import("../cli/core/worker-launch-context/store") as any;
  const input = planned(projectRoot);
  const targetRoot = join(projectRoot, ".agents", "drwn", "generated", "launch-contexts", "v1", "codex");
  const staleStage = join(targetRoot, `.stage-${input.plan.plannedContextId}-0123456789abcdef`);
  await mkdir(staleStage, { recursive: true });
  await writeFile(join(staleStage, "publication.json"), `${JSON.stringify({
    schema: "drwn.worker-launch-publication",
    schemaVersion: 1,
    contextId: input.plan.plannedContextId,
  }, null, 2)}\n`);
  await writeFile(join(staleStage, "partial.bin"), "crash-left bytes");

  const result = await store.publishWorkerLaunchContext({
    planned: input,
    compatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    expectedLaunch: { args: ["-C", join(input.plan.plannedArtifactDir, "codex")], env: {} },
    render: (stageDir: string) => fakeRender(stageDir, input.plan.plannedArtifactDir),
    assertSourceUnchanged: async () => undefined,
  });
  expect(result.reused).toBe(false);
  await expect(access(staleStage)).rejects.toThrow();
});
