// ABOUTME: Freezes deterministic generation and provenance for the Rust plugin consumer fixture pack.
// ABOUTME: Proves volatile paths/timestamps normalize without changing ordered semantic arrays.

import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertConsumerFixtureSourceClean,
  generateWorkerLaunchConsumerFixtures,
  normalizeConsumerFixture,
} from "../scripts/generate-worker-launch-consumer-fixtures";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("consumer fixture normalization replaces only declared volatile values and sorts object keys", () => {
  const normalized = normalizeConsumerFixture({
    z: ["second", "first"],
    createdAt: "2026-08-25T12:34:56.000Z",
    nested: {
      projectRoot: "/private/tmp/drwn-consumer-abcd/project",
      artifactDir: "/private/tmp/drwn-consumer-abcd/project/.agents/drwn/generated/launch-contexts/sha256-a",
      repoRoot: "/Users/example/darwinian-worker",
      stable: "2026-08-25T12:34:56.000Z",
    },
    a: true,
  }, {
    fixtureRoot: "/private/tmp/drwn-consumer-abcd",
    projectRoot: "/private/tmp/drwn-consumer-abcd/project",
    repoRoot: "/Users/example/darwinian-worker",
  });

  expect(Object.keys(normalized)).toEqual(["a", "createdAt", "nested", "z"]);
  expect(normalized).toEqual({
    a: true,
    createdAt: "2000-01-01T00:00:00.000Z",
    nested: {
      artifactDir: "/fixture/project/.agents/drwn/generated/launch-contexts/sha256-a",
      projectRoot: "/fixture/project",
      repoRoot: "/fixture/repository",
      stable: "2026-08-25T12:34:56.000Z",
    },
    z: ["second", "first"],
  });
});

test("clean-source guard rejects any porcelain entry and accepts an empty status", () => {
  expect(() => assertConsumerFixtureSourceClean("")).not.toThrow();
  expect(() => assertConsumerFixtureSourceClean(" M package.json\n")).toThrow("clean Git source");
  expect(() => assertConsumerFixtureSourceClean("?? fixtures.json\n")).toThrow("clean Git source");
});

test("generator produces the complete normalized plugin-facing pack with verified provenance", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "drwn-consumer-pack-test-"));
  roots.push(outputDir);
  const result = await generateWorkerLaunchConsumerFixtures({
    repoRoot: join(import.meta.dir, ".."),
    outputDir,
    requireCleanSource: false,
  });

  const required = [
    "status/project.json",
    "no-op/plan.codex.json",
    "no-op/prepare.codex.json",
    "claude/plan.json",
    "claude/prepare.json",
    "codex/plan.json",
    "codex/prepare.json",
    "optional-mcp/plan.codex.json",
    "optional-mcp/prepare.codex.json",
    "list/current.json",
    "doctor/healthy.json",
    "errors/missing-root.json",
    "errors/unsupported-target.json",
  ];
  expect(result.files).toEqual(required);

  const provenance = JSON.parse(await readFile(join(outputDir, "provenance.json"), "utf8"));
  expect(provenance).toMatchObject({
    schema: "drwn.worker-launch-consumer-fixtures",
    schemaVersion: 1,
    source: { version: "1.4.0" },
    generator: { path: "scripts/generate-worker-launch-consumer-fixtures.ts", version: 1 },
  });
  expect(provenance.source.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(Object.keys(provenance.files)).toEqual(required);
  expect(provenance.files).toEqual(result.hashes);

  for (const path of required) {
    const bytes = await readFile(join(outputDir, path), "utf8");
    expect(bytes.endsWith("\n")).toBe(true);
    expect(bytes).not.toContain(outputDir);
    expect(bytes).not.toContain("/private/tmp/");
    expect(bytes).not.toContain(join(import.meta.dir, ".."));
    expect(() => JSON.parse(bytes)).not.toThrow();
  }
});
