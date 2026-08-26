// ABOUTME: Verifies no-write project input snapshots and bounded stable-state collection.
// ABOUTME: Prevents launch contexts from publishing from torn committed/local Worker intent.

import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
const loadSnapshot = async () => await import("../cli/core/worker-launch-context/snapshot").catch(() => ({} as any));

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("source snapshot hashes committed and local bytes without creating transaction state", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-snapshot-"));
  roots.push(root);
  const stateDir = join(root, ".agents", "drwn");
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, "config.json"), '{"schema":"drwn.project-config"}\n');
  await writeFile(join(stateDir, "card.lock"), '{"schema":"drwn.project-lock"}\n');
  await writeFile(join(stateDir, "config.local.json"), '{"schema":"drwn.project-local"}\n');
  const before = await readdir(stateDir);
  const snapshot = await loadSnapshot();
  expect(typeof snapshot.captureWorkerLaunchSourceSnapshot).toBe("function");

  const result = await snapshot.captureWorkerLaunchSourceSnapshot(root);

  expect(result.projectRoot).toBe(await realpath(root));
  expect(result.sourceProjectConfigDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(result.sourceProjectLockDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(result.sourceLocalConfigDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(result.sourceLocalLockDigest).toBeUndefined();
  expect(result.inputDigest).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(await readdir(stateDir)).toEqual(before);
  await expect(access(join(stateDir, ".transactions"))).rejects.toThrow();
});

test("stable collector retries a changed collection and returns only matching before/after input", async () => {
  const snapshot = await loadSnapshot();
  expect(typeof snapshot.collectStableWorkerLaunchInput).toBe("function");
  const make = (char: string) => ({
    projectRoot: "/project",
    configBytes: "{}",
    lockBytes: "{}",
    sourceProjectConfigDigest: `sha256-${char.repeat(64)}`,
    sourceProjectLockDigest: `sha256-${char.repeat(64)}`,
    inputDigest: `sha256-${char.repeat(64)}`,
  });
  const captures = [make("a"), make("b"), make("b"), make("b")];
  let builds = 0;

  const result = await snapshot.collectStableWorkerLaunchInput({
    projectRoot: "/project",
    syncOptions: {},
    dependencies: {
      capture: async () => captures.shift()!,
      buildState: async () => {
        builds += 1;
        return { projectRoot: "/project", workerSelection: { activeWorker: null } };
      },
      planProjection: async () => ({ current: true, issues: [], recordPresent: true, result: null }),
    },
  });

  expect(builds).toBe(2);
  expect(result.snapshot.inputDigest).toBe(`sha256-${"b".repeat(64)}`);
});

test("pre-publication recheck fails with a stable code when project input changed", async () => {
  const snapshot = await loadSnapshot();
  expect(typeof snapshot.assertWorkerLaunchSourceUnchanged).toBe("function");
  await expect(snapshot.assertWorkerLaunchSourceUnchanged("/project", `sha256-${"a".repeat(64)}`, {
    capture: async () => ({ inputDigest: `sha256-${"b".repeat(64)}` }),
  })).rejects.toMatchObject({ code: "LAUNCH_PROJECT_STATE_CHANGED" });
});
