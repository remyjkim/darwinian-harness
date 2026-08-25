#!/usr/bin/env bun
// ABOUTME: Generates the deterministic Worker launch consumer fixture pack for non-TypeScript clients.
// ABOUTME: Binds normalized plugin-facing JSON bytes to one clean source commit and per-file hashes.

import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { runProcess } from "../cli/core/process";
import {
  createLiveWorkerLaunchFixture,
  removeLiveWorkerLaunchFixture,
  runDrwn,
  type LiveWorkerLaunchFixture,
} from "../test/live/helpers/worker-launch-context-fixture";

const FIXED_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const GENERATOR_PATH = "scripts/generate-worker-launch-consumer-fixtures.ts";
const OUTPUT_PATH = "test/fixtures/worker-launch-consumer-v1";
const VOLATILE_TIMESTAMP_KEYS = new Set(["createdAt", "generatedAt", "lastModifiedAt", "lastReconciledAt", "lastWriteAt", "updatedAt"]);

const REQUIRED_FILES = [
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
] as const;

interface NormalizationPaths {
  fixtureRoot: string;
  projectRoot: string;
  repoRoot: string;
  replacements?: ReadonlyMap<string, string>;
}

interface GenerateOptions {
  repoRoot: string;
  outputDir: string;
  requireCleanSource: boolean;
  sourceCommit?: string;
}

interface FixtureResult {
  files: string[];
  hashes: Record<string, string>;
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizeString(value: string, key: string | undefined, paths: NormalizationPaths): string {
  if (key && VOLATILE_TIMESTAMP_KEYS.has(key)) return FIXED_TIMESTAMP;
  if (key === "projectRootHash") return sha256("fixture:project-root");
  if (key === "sourceProjectLockDigest") return sha256("fixture:source-project-lock");
  let normalized = value;
  if (value === paths.projectRoot || value.startsWith(`${paths.projectRoot}/`)) {
    normalized = `/fixture/project${value.slice(paths.projectRoot.length)}`;
  } else if (value === paths.fixtureRoot || value.startsWith(`${paths.fixtureRoot}/`)) {
    normalized = `/fixture${value.slice(paths.fixtureRoot.length)}`;
  } else if (value === paths.repoRoot || value.startsWith(`${paths.repoRoot}/`)) {
    normalized = `/fixture/repository${value.slice(paths.repoRoot.length)}`;
  }
  for (const [from, to] of paths.replacements ?? []) normalized = normalized.replaceAll(from, to);
  return normalized;
}

export function normalizeConsumerFixture<T>(
  value: T,
  paths: NormalizationPaths,
  key?: string,
): T {
  if (typeof value === "string") return normalizeString(value, key, paths) as T;
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeConsumerFixture(item, paths));
    if (key === "contexts" && normalized.every((item) => item && typeof item === "object" && "contextId" in item)) {
      normalized.sort((a, b) => {
        const left = String(a.contextId);
        const right = String(b.contextId);
        return left < right ? -1 : left > right ? 1 : 0;
      });
    }
    return normalized as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([childKey, child]) => [childKey, normalizeConsumerFixture(child, paths, childKey)])) as T;
  }
  return value;
}

export function assertConsumerFixtureSourceClean(porcelain: string): void {
  if (porcelain.trim().length > 0) {
    throw new Error("Worker launch consumer fixtures require a clean Git source");
  }
}

async function git(repoRoot: string, args: string[]): Promise<string> {
  const result = await runProcess(["git", ...args], { cwd: repoRoot, timeoutMs: 30_000 });
  if (result.exitCode !== 0) throw new Error(`Git fixture provenance command failed: git ${args.join(" ")}`);
  return result.stdout.trim();
}

async function writeExecutable(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/bin/sh\nset -eu\n${source}\n`);
  await chmod(path, 0o755);
}

async function runJson(
  fixture: LiveWorkerLaunchFixture,
  args: string[],
  allowedExitCodes: number[] = [0],
): Promise<unknown> {
  const result = await runDrwn(args, fixture.env, fixture.projectRoot);
  if (!allowedExitCodes.includes(result.exitCode)) {
    throw new Error(`Fixture command failed (${result.exitCode}): drwn ${args.join(" ")}: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Fixture command returned invalid JSON: drwn ${args.join(" ")}`);
  }
}

async function writeCanonicalFixture(
  root: string,
  path: string,
  value: unknown,
  normalization: NormalizationPaths,
): Promise<string> {
  const bytes = `${JSON.stringify(normalizeConsumerFixture(value, normalization), null, 2)}\n`;
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return sha256(bytes);
}

async function scaffoldFakeTargets(fixture: LiveWorkerLaunchFixture): Promise<void> {
  const binDir = join(fixture.root, "bin");
  await writeExecutable(join(binDir, "claude"), [
    'if [ "${1:-}" = "--version" ]; then echo "2.1.212 (Claude Code)"; exit 0; fi',
    'if [ "${1:-}" = "plugin" ] && [ "${2:-}" = "validate" ]; then exit 0; fi',
    "exit 64",
  ].join("\n"));
  await writeExecutable(join(binDir, "codex"), [
    'if [ "${1:-}" = "--version" ]; then echo "codex-cli 0.149.0"; exit 0; fi',
    "exit 64",
  ].join("\n"));
  fixture.env.PATH = `${binDir}:${process.env.PATH ?? ""}`;
}

async function atomicReplaceDirectory(staging: string, outputDir: string): Promise<void> {
  const backup = `${outputDir}.previous`;
  await rm(backup, { recursive: true, force: true });
  let hadOutput = false;
  try {
    const outputStat = await stat(outputDir);
    if (!outputStat.isDirectory()) throw new Error("Fixture output path must be a directory");
    await rename(outputDir, backup);
    hadOutput = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await rename(staging, outputDir);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (hadOutput) await rename(backup, outputDir).catch(() => undefined);
    throw error;
  }
}

export async function generateWorkerLaunchConsumerFixtures(options: GenerateOptions): Promise<FixtureResult> {
  const repoRoot = resolve(options.repoRoot);
  const outputDir = resolve(options.outputDir);
  if (options.requireCleanSource) {
    assertConsumerFixtureSourceClean(await git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]));
  }
  const sourceCommit = options.sourceCommit ?? await git(repoRoot, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("Fixture source commit must be a full lowercase Git SHA");
  await git(repoRoot, ["cat-file", "-e", `${sourceCommit}^{commit}`]);
  const sourceTree = await git(repoRoot, ["rev-parse", `${sourceCommit}^{tree}`]);
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as { version?: unknown };
  if (packageJson.version !== "1.4.0") throw new Error("Worker launch consumer fixtures require package version 1.4.0");

  await mkdir(dirname(outputDir), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputDir), ".worker-launch-consumer-stage-"));
  let fixture: LiveWorkerLaunchFixture | undefined;
  try {
    fixture = await createLiveWorkerLaunchFixture({ deterministicHookPaths: true });
    await scaffoldFakeTargets(fixture);
    const normalization: NormalizationPaths = { fixtureRoot: fixture.root, projectRoot: fixture.projectRoot, repoRoot };
    const captures = new Map<string, unknown>();
    const prepareArgs = (root: string, target: "claude" | "codex", dryRun: boolean, extra: string[] = []) => [
      "worker", "launch-context", "prepare", root, "--target", target,
      ...(dryRun ? ["--dry-run"] : []), ...extra, "--json",
    ];

    captures.set("status/project.json", await runJson(fixture, ["status", "--json"]));
    captures.set("no-op/plan.codex.json", await runJson(fixture, prepareArgs(fixture.roots.base, "codex", true)));
    captures.set("no-op/prepare.codex.json", await runJson(fixture, prepareArgs(fixture.roots.base, "codex", false)));
    captures.set("claude/plan.json", await runJson(fixture, prepareArgs(fixture.roots.reviewer, "claude", true, ["--strict"])));
    captures.set("claude/prepare.json", await runJson(fixture, prepareArgs(fixture.roots.reviewer, "claude", false, ["--strict"])));
    captures.set("codex/plan.json", await runJson(fixture, prepareArgs(fixture.roots.reviewer, "codex", true, ["--strict"])));
    captures.set("codex/prepare.json", await runJson(fixture, prepareArgs(fixture.roots.reviewer, "codex", false, ["--strict"])));
    captures.set("optional-mcp/plan.codex.json", await runJson(fixture, prepareArgs(fixture.roots.reviewer, "codex", true, ["--strict", "--enable-mcp", "review_optional_mcp"])));
    captures.set("optional-mcp/prepare.codex.json", await runJson(fixture, prepareArgs(fixture.roots.reviewer, "codex", false, ["--strict", "--enable-mcp", "review_optional_mcp"])));
    captures.set("list/current.json", await runJson(fixture, ["worker", "launch-context", "list", "--json"]));
    captures.set("doctor/healthy.json", await runJson(fixture, ["doctor", "--json"], [0, 1]));
    captures.set("errors/missing-root.json", await runJson(fixture, prepareArgs("@live/missing", "codex", false), [1]));
    captures.set("errors/unsupported-target.json", await runJson(fixture, ["worker", "launch-context", "prepare", fixture.roots.reviewer, "--target", "cursor", "--json"], [1]));

    const plannedContextId = (path: string): string => {
      const value = captures.get(path) as { plannedContextId?: unknown } | undefined;
      if (typeof value?.plannedContextId !== "string") throw new Error(`Generated plan omitted its context ID: ${path}`);
      return value.plannedContextId;
    };
    normalization.replacements = new Map([
      [plannedContextId("no-op/plan.codex.json"), sha256("fixture-context:no-op:codex")],
      [plannedContextId("claude/plan.json"), sha256("fixture-context:reviewer:claude")],
      [plannedContextId("codex/plan.json"), sha256("fixture-context:reviewer:codex")],
      [plannedContextId("optional-mcp/plan.codex.json"), sha256("fixture-context:reviewer:codex:review_optional_mcp")],
    ]);

    const hashes: Record<string, string> = {};
    for (const path of REQUIRED_FILES) {
      const value = captures.get(path);
      if (value === undefined) throw new Error(`Missing generated fixture value for ${path}`);
      hashes[path] = await writeCanonicalFixture(staging, path, value, normalization);
    }
    const generatorBytes = await readFile(join(repoRoot, GENERATOR_PATH));
    const provenance = {
      schema: "drwn.worker-launch-consumer-fixtures",
      schemaVersion: 1,
      source: {
        version: packageJson.version,
        commit: sourceCommit,
        tree: sourceTree,
      },
      generator: {
        path: GENERATOR_PATH,
        version: 1,
        sha256: sha256(generatorBytes),
      },
      normalization: {
        projectRoot: "/fixture/project",
        fixtureRoot: "/fixture",
        repoRoot: "/fixture/repository",
        timestamp: FIXED_TIMESTAMP,
        timestampKeys: [...VOLATILE_TIMESTAMP_KEYS].sort(),
        objectKeys: "utf16-ascending",
        arrays: "preserved",
        contextIds: "sha256(fixture-context:<semantic-label>)",
        derivedDigests: ["projectRootHash", "sourceProjectLockDigest"],
        contextArrays: "normalized-context-id-ascending",
      },
      files: hashes,
    };
    await writeFile(join(staging, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
    await atomicReplaceDirectory(staging, outputDir);
    return { files: [...REQUIRED_FILES], hashes };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    await removeLiveWorkerLaunchFixture(fixture);
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else if (entry.isFile()) result.push(relative(root, path).replaceAll("\\", "/"));
    else throw new Error(`Fixture pack contains unsupported filesystem entry: ${relative(root, path)}`);
  }
  return result.sort();
}

async function compareFixtureDirectories(expected: string, actual: string): Promise<void> {
  const expectedFiles = await listFiles(expected);
  const actualFiles = await listFiles(actual);
  if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) throw new Error("Worker launch consumer fixture file list drifted");
  for (const path of expectedFiles) {
    const [expectedBytes, actualBytes] = await Promise.all([readFile(join(expected, path)), readFile(join(actual, path))]);
    if (!expectedBytes.equals(actualBytes)) throw new Error(`Worker launch consumer fixture drifted: ${path}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const outputDir = join(repoRoot, OUTPUT_PATH);
  const check = process.argv.slice(2).includes("--check");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
  if (unknown.length > 0) throw new Error(`Unknown generator option: ${unknown[0]}`);
  if (!check) {
    await generateWorkerLaunchConsumerFixtures({ repoRoot, outputDir, requireCleanSource: true });
    process.stdout.write(`${OUTPUT_PATH}\n`);
    return;
  }

  assertConsumerFixtureSourceClean(await git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]));
  const provenance = JSON.parse(await readFile(join(outputDir, "provenance.json"), "utf8")) as { source?: { commit?: unknown } };
  const sourceCommit = provenance.source?.commit;
  if (typeof sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("Fixture provenance is missing its source commit");
  const changed = (await git(repoRoot, ["diff", "--name-only", `${sourceCommit}..HEAD`])).split("\n").filter(Boolean);
  if (changed.some((path) => !path.startsWith(`${OUTPUT_PATH}/`))) {
    throw new Error("Fixture check requires HEAD to differ from the recorded source only by the fixture pack");
  }
  const temporary = await mkdtemp(join(dirname(outputDir), ".worker-launch-consumer-check-"));
  try {
    await generateWorkerLaunchConsumerFixtures({ repoRoot, outputDir: temporary, requireCleanSource: false, sourceCommit });
    await compareFixtureDirectories(outputDir, temporary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  process.stdout.write("Worker launch consumer fixtures are current.\n");
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Worker launch consumer fixture generation failed"}\n`);
    process.exitCode = 1;
  });
}
