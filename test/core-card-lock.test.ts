// ABOUTME: Verifies the first supported project lock schema and graph invariants.
// ABOUTME: Rejects prototype locks and malformed Worker graphs without migration.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  PROJECT_WORKER_MIN_DRWN_VERSION,
  WORKER_MIND_MIN_DRWN_VERSION,
  cardLockPath,
  createCardLockfile,
  loadCardLock,
  persistCardLock,
  validateCardLockfile,
  writeCardLock,
  type CardLockEntry,
  type ProjectLockV1,
} from "../cli/core/card-lock";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
const TREE_SHA = "a".repeat(40);

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function card(
  name = "@me/backend",
  overrides: Partial<CardLockEntry> = {},
): CardLockEntry {
  const version = overrides.version ?? "1.0.0";
  return {
    name,
    requested: `${name}@^${version}`,
    version,
    path: `/cards/${name}/${version}`,
    integrity: `sha256-${name}-${version}`,
    treeSha: TREE_SHA,
    manifest: { name, version },
    skills: [],
    hooks: [],
    registry: null,
    origin: "store",
    git: { commit: "b".repeat(40) },
    ...overrides,
  };
}

function lock(overrides: Partial<ProjectLockV1> = {}): ProjectLockV1 {
  const entry = card();
  return {
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: PROJECT_WORKER_MIN_DRWN_VERSION },
    workerRoots: [
      { name: entry.name, requested: entry.requested, kind: "card", members: [] },
    ],
    cards: [entry],
    ...overrides,
  };
}

test("writeCardLock writes and reads the namespaced V1 Worker graph", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  const graph = lock();

  const path = await writeCardLock(root, graph);

  expect(path).toBe(cardLockPath(root));
  expect(existsSync(path)).toBe(true);
  const raw = JSON.parse(await readFile(path, "utf8"));
  expect(raw.schema).toBe("drwn.project-lock");
  expect(raw.schemaVersion).toBe(1);
  expect(raw.store.minDrwnVersion).toBe(PROJECT_WORKER_MIN_DRWN_VERSION);
  expect(raw.lockfileVersion).toBeUndefined();
  expect(await loadCardLock(root)).toEqual(graph);
});

test("prototype and unknown project lock schemas are rejected without rewriting bytes", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  const path = cardLockPath(root);
  const prototype = `${JSON.stringify({ lockfileVersion: 5, cards: [] }, null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, prototype);

  await expect(loadCardLock(root)).rejects.toMatchObject({ code: "PROJECT_LOCK_INVALID" });
  expect(await readFile(path, "utf8")).toBe(prototype);
  expect(() => validateCardLockfile({ ...lock(), schema: "other.project-lock" })).toThrow();
  expect(() => validateCardLockfile({ ...lock(), schemaVersion: 2 })).toThrow();
  expect(() => validateCardLockfile({ ...lock(), unexpected: true })).toThrow();
});

test("project lock rejects duplicate roots, Cards, and Blueprint members", () => {
  const entry = card();
  const blueprint = card("@me/worker", {
    manifest: {
      name: "@me/worker",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: [entry.requested],
    },
  });
  const root = {
    name: blueprint.name,
    requested: blueprint.requested,
    kind: "blueprint" as const,
    members: [entry.name],
  };
  expect(() => validateCardLockfile(lock({ workerRoots: [root, root], cards: [blueprint, entry] }))).toThrow(
    /root.*more than once/i,
  );
  expect(() => validateCardLockfile(lock({ workerRoots: [root], cards: [blueprint, entry, entry] }))).toThrow(
    /card.*more than once/i,
  );
  expect(() =>
    validateCardLockfile(lock({ workerRoots: [{ ...root, members: [entry.name, entry.name] }], cards: [blueprint, entry] })),
  ).toThrow(/member.*more than once/i);
});

test("project lock rejects missing root and member Card references", () => {
  const entry = card();
  expect(() => validateCardLockfile(lock({ cards: [] }))).toThrow(/root.*missing/i);

  const blueprint = card("@me/worker", {
    manifest: {
      name: "@me/worker",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: [entry.requested],
    },
  });
  expect(() =>
    validateCardLockfile(lock({
      workerRoots: [{ name: blueprint.name, requested: blueprint.requested, kind: "blueprint", members: [entry.name] }],
      cards: [blueprint],
    })),
  ).toThrow(/member.*missing/i);
});

test("project lock rejects root kind/request mismatches and member roots", () => {
  const entry = card();
  expect(() =>
    validateCardLockfile(lock({ workerRoots: [{ name: entry.name, requested: "@me/backend@2", kind: "card", members: [] }] })),
  ).toThrow(/requested/i);
  expect(() =>
    validateCardLockfile(lock({ workerRoots: [{ name: entry.name, requested: entry.requested, kind: "blueprint", members: [] }] })),
  ).toThrow(/kind/i);

  const blueprint = card("@me/worker", {
    manifest: {
      name: "@me/worker",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: [entry.requested],
    },
  });
  expect(() =>
    validateCardLockfile(lock({
      workerRoots: [
        { name: blueprint.name, requested: blueprint.requested, kind: "blueprint", members: [entry.name] },
        { name: entry.name, requested: entry.requested, kind: "card", members: [] },
      ],
      cards: [blueprint, entry],
    })),
  ).toThrow(/member.*root/i);
});

test("project lock rejects plain roots with members, Blueprint members, and orphan Cards", () => {
  const entry = card();
  expect(() =>
    validateCardLockfile(lock({ workerRoots: [{ name: entry.name, requested: entry.requested, kind: "card", members: [entry.name] }] })),
  ).toThrow(/plain card root.*members/i);

  const child = card("@me/child", {
    manifest: { name: "@me/child", version: "1.0.0", kind: "blueprint", composedFrom: [] },
  });
  const parent = card("@me/parent", {
    manifest: { name: "@me/parent", version: "1.0.0", kind: "blueprint", composedFrom: [child.requested] },
  });
  expect(() => validateCardLockfile(lock({
    workerRoots: [{ name: parent.name, requested: parent.requested, kind: "blueprint", members: [child.name] }],
    cards: [parent, child],
  }))).toThrow(/member.*plain card/i);

  expect(() => validateCardLockfile(lock({ cards: [entry, card("@me/orphan")] }))).toThrow(/orphan/i);
});

test("Store and Git Cards require a tree SHA when a lock is written", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  const entry = card("@me/backend", { treeSha: undefined });

  await expect(writeCardLock(root, lock({ cards: [entry] }))).rejects.toMatchObject({
    code: "LOCK_TREE_SHA_REQUIRED",
  });
});

test("persistCardLock backfills tree SHA while preserving root edges", async () => {
  const { scaffoldCliFixture } = await import("./helpers");
  const { createLocalCardRepo } = await import("./fixtures/git-helpers");
  const { resolveCardBareRepoPath } = await import("../cli/core/store-paths");
  const git = await import("../cli/core/git");
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/persist", version: "1.0.0", skills: ["alpha"] });
  tempRoots.push(remote.tempDir);
  const root = await createTempRoot("card-lock-persist-");
  tempRoots.push(root);
  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@team/persist");
  await git.cloneBare(remote.url, barePath);
  const commit = await git.revParse(barePath, "refs/tags/v1.0.0");
  const treeSha = await git.getCommitTree(barePath, commit);
  const entry = card("@team/persist", {
    requested: `git+${remote.url}#v1.0.0`,
    path: join(fixture.agentsDir, "drwn", "extracted", treeSha),
    treeSha: undefined,
    origin: "git",
    git: { url: remote.url, ref: "v1.0.0", commit },
  });
  const graph = lock({
    workerRoots: [{ name: entry.name, requested: entry.requested, kind: "card", members: [] }],
    cards: [entry],
  });

  await persistCardLock(root, fixture.agentsDir, graph);

  const loaded = await loadCardLock(root);
  expect(loaded?.cards[0]?.treeSha).toBe(treeSha);
  expect(loaded?.workerRoots).toEqual(graph.workerRoots);
});

test("lock metadata preserves skills, hooks, consent, and mind sections", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  const entry = card("@me/mind", {
    manifest: {
      name: "@me/mind",
      version: "1.0.0",
      skills: { include: ["alpha"] },
      hooks: { include: ["audit"] },
      persona: { include: ["voice"], visibility: "internal" },
      beliefs: { include: ["engineering"], visibility: "public" },
      memory: { observations: { format: "jsonl" } },
      instructions: { text: "Reviewed instructions." },
    },
    skills: ["alpha"],
    hooks: ["audit"],
    hookConsent: { consentedAt: "2026-06-12T00:00:00.000Z", consentedRange: "^1.0.0" },
    instructionConsent: {
      consentedAt: "2026-06-12T00:00:00.000Z",
      consentedRange: "^1.0.0",
      contentDigest: `sha256-${"a".repeat(64)}`,
    },
  });
  const graph = lock({
    workerRoots: [{ name: entry.name, requested: entry.requested, kind: "card", members: [] }],
    cards: [entry],
  });

  await writeCardLock(root, graph);

  const loaded = await loadCardLock(root);
  expect(loaded?.store.minDrwnVersion).toBe(WORKER_MIND_MIN_DRWN_VERSION);
  expect(loaded?.cards[0]?.skills).toEqual(["alpha"]);
  expect(loaded?.cards[0]?.hooks).toEqual(["audit"]);
  expect(loaded?.cards[0]?.hookConsent?.consentedRange).toBe("^1.0.0");
  expect(loaded?.cards[0]?.instructionConsent?.contentDigest).toBe(
    `sha256-${"a".repeat(64)}`,
  );
  expect(loaded?.cards[0]?.memory?.observations).toEqual({ format: "jsonl" });
});

test("lock floor covers Mind capability in any installed root", () => {
  const plain = card("@me/plain");
  const mind = card("@me/mind", {
    manifest: { name: "@me/mind", version: "1.0.0", memory: { insights: { format: "md" } } },
  });
  const graph = {
    workerRoots: [
      { name: plain.name, requested: plain.requested, kind: "card" as const, members: [] },
      { name: mind.name, requested: mind.requested, kind: "card" as const, members: [] },
    ],
    cards: [plain, mind],
  };

  expect(createCardLockfile(graph).store.minDrwnVersion).toBe(WORKER_MIND_MIN_DRWN_VERSION);
  expect(createCardLockfile({ workerRoots: graph.workerRoots.slice(0, 1), cards: [plain] }).store.minDrwnVersion)
    .toBe(PROJECT_WORKER_MIN_DRWN_VERSION);
});

test("lock rejects inconsistent or prototype memory copies", () => {
  const nested = card("@me/mind", {
    manifest: { name: "@me/mind", version: "1.0.0", memory: { observations: { format: "jsonl" } } },
    memory: { insights: { format: "md" } },
  });
  expect(() => validateCardLockfile(lock({
    store: { minDrwnVersion: WORKER_MIND_MIN_DRWN_VERSION },
    workerRoots: [{ name: nested.name, requested: nested.requested, kind: "card", members: [] }],
    cards: [nested],
  }))).toThrow(/memory.*match/i);

  const prototype = card("@me/prototype", {
    manifest: { name: "@me/prototype", version: "1.0.0" },
    memory: { l5: { format: "jsonl" } } as never,
  });
  expect(() => validateCardLockfile(lock({
    workerRoots: [{ name: prototype.name, requested: prototype.requested, kind: "card", members: [] }],
    cards: [prototype],
  }))).toThrow(/memory kind/i);
});

test("loadCardLock returns null when no lockfile exists", async () => {
  const root = await createTempRoot("card-lock-");
  tempRoots.push(root);
  expect(await loadCardLock(root)).toBeNull();
});
