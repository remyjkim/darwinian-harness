// ABOUTME: Verifies launch closure resolution uses only effective installed Worker roots.
// ABOUTME: Protects ordered Blueprint members and local-only provenance without registry resolution.

import { expect, test } from "bun:test";
import type { CardLockEntry } from "../cli/core/card-lock";
import { selectProjectWorker } from "../cli/core/effective-state";

function card(name: string, kind: "card" | "blueprint" = "card"): CardLockEntry {
  return {
    name,
    requested: `${name}@1.0.0`,
    version: "1.0.0",
    path: `/cards/${name}`,
    integrity: `sha256-${name.replace(/[^a-z]/g, "a").padEnd(64, "a").slice(0, 64)}`,
    manifest: { name, version: "1.0.0", ...(kind === "blueprint" ? { kind, composedFrom: [] } : {}) },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
}

test("closure resolver returns root then ordered members for an installed alternative", async () => {
  const closure = await import("../cli/core/worker-launch-context/closure").catch(() => ({} as any));
  expect(typeof closure.resolveInstalledWorkerClosure).toBe("function");
  const base = card("@test/base");
  const reviewer = card("@test/reviewer", "blueprint");
  const member = card("@test/review-tools");
  reviewer.manifest.composedFrom = [member.requested];
  const selection = selectProjectWorker({
    projectConfig: { schema: "drwn.project-config", schemaVersion: 1, workers: [base.requested, reviewer.requested], activeWorker: base.name },
    committedLock: {
      schema: "drwn.project-lock",
      schemaVersion: 1,
      store: { minDrwnVersion: "1.1.0" },
      workerRoots: [
        { name: base.name, requested: base.requested, kind: "card", members: [] },
        { name: reviewer.name, requested: reviewer.requested, kind: "blueprint", members: [member.name] },
      ],
      cards: [base, reviewer, member],
    },
    configLocal: null,
    localLock: null,
  });

  const result = closure.resolveInstalledWorkerClosure(selection, reviewer.name);

  expect(result.cards.map((entry: CardLockEntry) => entry.name)).toEqual([reviewer.name, member.name]);
  expect(result.rootIdentity).toMatchObject({ name: reviewer.name, kind: "blueprint", localOnly: false });
});

test("closure resolver rejects absent roots without treating the input as a Card ref", async () => {
  const closure = await import("../cli/core/worker-launch-context/closure") as any;
  const one = card("@test/one");
  const selection = selectProjectWorker({
    projectConfig: { schema: "drwn.project-config", schemaVersion: 1, workers: [one.requested], activeWorker: one.name },
    committedLock: {
      schema: "drwn.project-lock",
      schemaVersion: 1,
      store: { minDrwnVersion: "1.1.0" },
      workerRoots: [{ name: one.name, requested: one.requested, kind: "card", members: [] }],
      cards: [one],
    },
    configLocal: null,
    localLock: null,
  });
  expect(() => closure.resolveInstalledWorkerClosure(selection, "github:other/root")).toThrow(expect.objectContaining({ code: "LAUNCH_ROOT_NOT_INSTALLED" }));
});
