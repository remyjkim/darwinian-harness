// ABOUTME: Verifies write-watch path collection, ignore rules, and debounce semantics.
// ABOUTME: Guards linked-root normalization and single-flight write serialization.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collectWriteWatchPaths,
  createRecursiveWatcher,
  linkedRootOverlapsProject,
  normalizeWatchPath,
  shouldIgnoreWatchEvent,
  startWriteWatch,
} from "../cli/core/write-watch";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function waitForCondition(predicate: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await Bun.sleep(20);
  }
  return predicate();
}

async function writeUntilObserved(
  path: string,
  content: (attempt: number) => string,
  predicate: () => boolean,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    await writeFile(path, content(attempt));
    attempt += 1;
    if (await waitForCondition(predicate, 250)) {
      return true;
    }
  }
  return predicate();
}

async function waitForStableValue<T>(read: () => T, stableMs = 150, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let previous = read();
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await Bun.sleep(20);
    const current = read();
    if (!Object.is(current, previous)) {
      previous = current;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= stableMs) {
      return true;
    }
  }
  return false;
}

function localConfigText(overrides: Record<string, string>, watchNonce: number) {
  return `${JSON.stringify({
    schema: "drwn.project-local",
    schemaVersion: 1,
    activeWorker: watchNonce % 2 === 0 ? null : "@watch/placeholder",
    sourceOverrides: overrides,
  }, null, 2)}\n`;
}

describe("write-watch helpers", () => {
  test("normalizeWatchPath strips file: prefix", () => {
    expect(normalizeWatchPath("file:/tmp/source")).toBe("/tmp/source");
    expect(normalizeWatchPath("/tmp/source")).toBe("/tmp/source");
  });

  test("collectWriteWatchPaths includes drwn dir and existing linked roots", async () => {
    const root = await createTempRoot("write-watch-");
    tempRoots.push(root);
    const linked = join(root, "linked");
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    await mkdir(linked, { recursive: true });
    const paths = collectWriteWatchPaths(root, [`file:${linked}`]);
    expect(paths).toContain(join(root, ".agents", "drwn"));
    expect(paths).toContain(join(root, "AGENTS.md"));
    expect(paths).toContain(join(root, ".claude", "CLAUDE.md"));
    expect(paths).toContain(linked);
    expect(paths.some((path) => path.startsWith("file:"))).toBe(false);
  });

  test("shouldIgnoreWatchEvent ignores generated output under overlapping linked root", async () => {
    const root = await createTempRoot("write-watch-ignore-");
    tempRoots.push(root);
    const linked = join(root, "linked");
    const generated = join(root, ".agents", "drwn", "generated", "workers", "x");
    expect(linkedRootOverlapsProject(root, [linked])).toBe(true);
    expect(shouldIgnoreWatchEvent(root, generated, [linked])).toBe(true);
    expect(shouldIgnoreWatchEvent(root, join(linked, "skills", "a", "SKILL.md"), [linked])).toBe(false);
  });
});

describe("startWriteWatch", () => {
  test("rejects --watch with --json at command layer", async () => {
    const { runAgentsCli, scaffoldCliFixture } = await import("./helpers");
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
    await writeFile(join(projectDir, ".agents", "drwn", "config.json"), "{}\n");
    const result = await runAgentsCli(["write", "--watch", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir, { skipWriteScopeAuto: true });
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toMatch(/--watch is incompatible/i);
  });

  test("debounces rapid triggers into one follow-up run", async () => {
    const root = await createTempRoot("write-watch-debounce-");
    tempRoots.push(root);
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    let runs = 0;
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 50,
      onTrigger: async () => {
        runs += 1;
      },
    });
    const configPath = join(root, ".agents", "drwn", "config.json");
    expect(
      await writeUntilObserved(configPath, (attempt) => `{"ready":${attempt}}\n`, () => runs > 0),
    ).toBe(true);
    expect(await waitForStableValue(() => runs)).toBe(true);
    runs = 0;
    await writeFile(configPath, '{"version":2}\n');
    await writeFile(configPath, '{"version":3}\n');
    await Bun.sleep(120);
    stop();
    expect(runs).toBe(1);
  });

  test("single-flight queues one follow-up during in-progress write", async () => {
    const root = await createTempRoot("write-watch-flight-");
    tempRoots.push(root);
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    let runs = 0;
    let activeRuns = 0;
    let maxActiveRuns = 0;
    let release: (() => void) | undefined;
    let exerciseSingleFlight = false;
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 10,
      onTrigger: async () => {
        activeRuns += 1;
        maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
        try {
          runs += 1;
          if (exerciseSingleFlight && runs === 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
        } finally {
          activeRuns -= 1;
        }
      },
    });
    const configPath = join(root, ".agents", "drwn", "config.json");
    expect(
      await writeUntilObserved(configPath, (attempt) => `{"ready":${attempt}}\n`, () => runs > 0),
    ).toBe(true);
    expect(await waitForStableValue(() => runs)).toBe(true);
    runs = 0;
    exerciseSingleFlight = true;
    await writeFile(configPath, '{"version":2}\n');
    // Wait until run 1 has started and is blocked on the release promise (activeRuns
    // is 1 and release is set), instead of guessing with a fixed sleep. A fixed sleep
    // races the watcher's debounce: if run 1 has not started when the next write lands,
    // the two writes coalesce into one trigger and the follow-up never queues.
    expect(
      await waitForCondition(() => activeRuns === 1 && release !== undefined),
    ).toBe(true);
    await writeFile(configPath, '{"version":3}\n');
    // The second write arrives while run 1 is still in flight; single-flight must queue
    // exactly one follow-up. Release run 1, then wait for the follow-up to complete
    // rather than assuming a fixed 150 ms is enough under load.
    release?.();
    expect(await waitForCondition(() => runs >= 2)).toBe(true);
    expect(await waitForStableValue(() => runs)).toBe(true);
    stop();
    expect(runs).toBeGreaterThanOrEqual(2);
    expect(maxActiveRuns).toBe(1);
  });

  test("creates config.local.json after watch starts and triggers write", async () => {
    const root = await createTempRoot("write-watch-overlay-");
    tempRoots.push(root);
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    let runs = 0;
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 50,
      onTrigger: async () => {
        runs += 1;
      },
    });
    try {
      const configPath = join(root, ".agents", "drwn", "config.json");
      expect(
        await writeUntilObserved(configPath, (attempt) => `{"version":${attempt + 2}}\n`, () => runs > 0),
      ).toBe(true);
      expect(await waitForStableValue(() => runs)).toBe(true);
      runs = 0;
      const localConfigPath = join(root, ".agents", "drwn", "config.local.json");
      expect(
        await writeUntilObserved(
          localConfigPath,
          (attempt) => localConfigText({}, attempt),
          () => runs > 0,
        ),
      ).toBe(true);
    } finally {
      stop();
    }
  });

  test("picks up linked-root override changes after startup", async () => {
    const root = await createTempRoot("write-watch-linked-swap-");
    tempRoots.push(root);
    const firstLinked = join(root, "linked-a");
    const secondLinked = join(root, "linked-b");
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    await mkdir(firstLinked, { recursive: true });
    await mkdir(secondLinked, { recursive: true });
    await writeFile(join(firstLinked, "touch.txt"), "a\n");
    await writeFile(join(secondLinked, "touch.txt"), "b\n");
    const events: string[] = [];
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 50,
      onTrigger: async () => {
        events.push("run");
      },
    });
    try {
      const configPath = join(root, ".agents", "drwn", "config.json");
      expect(
        await writeUntilObserved(configPath, (attempt) => `{"ready":${attempt}}\n`, () => events.length >= 1),
      ).toBe(true);
      expect(await waitForStableValue(() => events.length)).toBe(true);
      events.length = 0;
      const localConfigPath = join(root, ".agents", "drwn", "config.local.json");
      expect(
        await writeUntilObserved(
          localConfigPath,
          (attempt) => localConfigText({ "@me/x": `file:${firstLinked}` }, attempt),
          () => events.length >= 1,
        ),
      ).toBe(true);
      expect(
        await writeUntilObserved(
          join(firstLinked, "touch.txt"),
          (attempt) => `a${attempt + 2}\n`,
          () => events.length >= 2,
        ),
      ).toBe(true);
      expect(
        await writeUntilObserved(
          localConfigPath,
          (attempt) => localConfigText({ "@me/x": `file:${secondLinked}` }, attempt),
          () => events.length >= 3,
        ),
      ).toBe(true);
      expect(
        await writeUntilObserved(
          join(secondLinked, "touch.txt"),
          (attempt) => `b${attempt + 2}\n`,
          () => events.length >= 4,
        ),
      ).toBe(true);
    } finally {
      stop();
    }
    expect(events.length).toBeGreaterThan(1);
  });
});

describe("createRecursiveWatcher", () => {
  test("nested skill edits trigger callback", async () => {
    const root = await createTempRoot("write-watch-nested-");
    tempRoots.push(root);
    const skillDir = join(root, "skills", "nested");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "v1\n");
    const events: string[] = [];
    const watcher = createRecursiveWatcher(root, (eventPath) => events.push(eventPath));
    const skillPath = join(skillDir, "SKILL.md");
    expect(
      await writeUntilObserved(
        skillPath,
        (attempt) => `v${attempt + 2}\n`,
        () => events.some((event) => event.includes("SKILL.md")),
      ),
    ).toBe(true);
    watcher.close();
    expect(events.some((event) => event.includes("SKILL.md"))).toBe(true);
  });
});
