// ABOUTME: Verifies public Worker launch-context prepare CLI, JSON, errors, and no-write dry-run.
// ABOUTME: Freezes the machine handoff consumed by the Rust Herdr organization plugin.

import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECT_WORKER_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { runGit } from "../cli/core/git";
import { createExecutable, runAgentsCli } from "./helpers";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-command-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const cardRoot = join(root, "card");
  const stateDir = join(projectRoot, ".agents", "drwn");
  const binDir = join(root, "bin");
  const marker = join(root, "codex-invoked");
  await mkdir(join(cardRoot, "skills", "review"), { recursive: true });
  await writeFile(join(cardRoot, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: review\n---\n");
  await mkdir(stateDir, { recursive: true });
  expect((await runGit(["init", "-q"], { cwd: projectRoot })).exitCode).toBe(0);
  await writeFile(join(stateDir, "config.json"), `${JSON.stringify({
    schema: "drwn.project-config", schemaVersion: 1, workers: ["@test/reviewer@1.0.0"], activeWorker: null,
  })}\n`);
  await writeFile(join(stateDir, "card.lock"), `${JSON.stringify({
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: PROJECT_WORKER_MIN_DRWN_VERSION },
    workerRoots: [{ name: "@test/reviewer", requested: "@test/reviewer@1.0.0", kind: "card", members: [] }],
    cards: [{
      name: "@test/reviewer", requested: "@test/reviewer@1.0.0", version: "1.0.0", path: cardRoot,
      integrity: `sha256-${"a".repeat(64)}`, manifest: { name: "@test/reviewer", version: "1.0.0", skills: { include: ["review"] } },
      skills: ["review"], hooks: [], registry: null, origin: "file",
    }],
  })}\n`);
  await createExecutable(binDir, "codex", `printf invoked >> ${JSON.stringify(marker)}\nif [ "\${1:-}" = "--version" ]; then echo 'codex-cli 0.149.0'; exit 0; fi\nexit 64`);
  return {
    root, projectRoot, homeDir, agentsDir, stateDir, marker,
    env: {
      AGENTS_REPO_ROOT: process.cwd(),
      AGENTS_HOME_DIR: homeDir,
      AGENTS_DIR: agentsDir,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  };
}

test("prepare dry-run emits one plan document, executes no target, and writes nothing", async () => {
  const f = await fixture();
  const before = await readdir(f.stateDir);

  const result = await runAgentsCli([
    "worker", "launch-context", "prepare", "@test/reviewer", "--target", "codex", "--dry-run", "--json",
  ], f.env, f.projectRoot);

  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ schema: "drwn.worker-launch-plan", target: "codex", assignedRoot: { name: "@test/reviewer" } });
  expect(await readdir(f.stateDir)).toEqual(before);
  await expect(access(f.marker)).rejects.toThrow();
  await expect(access(join(f.stateDir, "generated", "launch-contexts"))).rejects.toThrow();
});

test("prepare publishes one strict result and reports verified reuse on the second call", async () => {
  const f = await fixture();
  const args = ["worker", "launch-context", "prepare", "@test/reviewer", "--target", "codex", "--json"];

  const first = await runAgentsCli(args, f.env, f.projectRoot);
  const second = await runAgentsCli(args, f.env, f.projectRoot);

  expect(first.exitCode, first.stderr).toBe(0);
  expect(second.exitCode, second.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({ schema: "drwn.worker-launch-prepare-result", reused: false, context: { target: "codex" } });
  expect(JSON.parse(second.stdout)).toMatchObject({ schema: "drwn.worker-launch-prepare-result", reused: true });
  expect(await readFile(f.marker, "utf8")).toBe("invokedinvoked");
});

test("prepare JSON failures use stable DrwnError output without human text on stdout", async () => {
  const f = await fixture();
  const result = await runAgentsCli([
    "worker", "launch-context", "prepare", "@test/missing", "--target", "codex", "--dry-run", "--json",
  ], f.env, f.projectRoot);

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "LAUNCH_ROOT_NOT_INSTALLED" });
  expect(result.stdout.trim().startsWith("{")).toBe(true);
});

test("prepare JSON normalizes unexpected materialization failures into one stable document", async () => {
  const f = await fixture();
  await rm(join(f.root, "card", "skills", "review"), { recursive: true, force: true });
  const result = await runAgentsCli([
    "worker", "launch-context", "prepare", "@test/reviewer", "--target", "codex", "--dry-run", "--json",
  ], f.env, f.projectRoot);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({ code: "LAUNCH_PREPARE_FAILED" });
});

test("list and doctor classify current then drifted contexts without changing their bytes", async () => {
  const f = await fixture();
  const prepare = await runAgentsCli([
    "worker", "launch-context", "prepare", "@test/reviewer", "--target", "codex", "--json",
  ], f.env, f.projectRoot);
  expect(prepare.exitCode, prepare.stderr).toBe(0);
  const context = JSON.parse(prepare.stdout).context;
  const manifestBefore = await readFile(join(context.artifactDir, "manifest.json"), "utf8");

  const current = await runAgentsCli(["worker", "launch-context", "list", "--json"], f.env, f.projectRoot);

  expect(current.exitCode, current.stderr).toBe(0);
  expect(JSON.parse(current.stdout)).toMatchObject({
    schema: "drwn.worker-launch-context-list",
    contexts: [{ contextId: context.contextId, state: "current", target: "codex" }],
  });
  expect(await readFile(join(context.artifactDir, "manifest.json"), "utf8")).toBe(manifestBefore);

  await writeFile(join(context.artifactDir, "codex", "workspace", ".agents", "skills", "review", "SKILL.md"), "drift\n");
  const drifted = await runAgentsCli(["worker", "launch-context", "list", "--json"], f.env, f.projectRoot);
  const doctor = await runAgentsCli(["doctor", "--json"], f.env, f.projectRoot);

  expect(JSON.parse(drifted.stdout)).toMatchObject({ contexts: [{ contextId: context.contextId, state: "drifted" }] });
  expect(doctor.exitCode).toBe(1);
  expect(JSON.parse(doctor.stdout)).toMatchObject({ launchContexts: { count: 1, drifted: 1 } });
});

test("prune reports by default and removes only after explicit execute plus age filter", async () => {
  const f = await fixture();
  const prepare = await runAgentsCli([
    "worker", "launch-context", "prepare", "@test/reviewer", "--target", "codex", "--json",
  ], f.env, f.projectRoot);
  const context = JSON.parse(prepare.stdout).context;

  const report = await runAgentsCli([
    "worker", "launch-context", "prune", "--older-than", "0s", "--json",
  ], f.env, f.projectRoot);
  expect(report.exitCode, report.stderr).toBe(0);
  expect(JSON.parse(report.stdout)).toMatchObject({ schema: "drwn.worker-launch-context-prune", execute: false, candidates: 1, removed: [] });
  expect(await access(context.artifactDir).then(() => true)).toBe(true);

  const unsafe = await runAgentsCli([
    "worker", "launch-context", "prune", "--execute", "--json",
  ], f.env, f.projectRoot);
  expect(unsafe.exitCode).toBe(1);
  expect(JSON.parse(unsafe.stdout)).toMatchObject({ code: "LAUNCH_PRUNE_AGE_REQUIRED" });

  const execute = await runAgentsCli([
    "worker", "launch-context", "prune", "--older-than", "0s", "--execute", "--json",
  ], f.env, f.projectRoot);
  expect(execute.exitCode, execute.stderr).toBe(0);
  expect(JSON.parse(execute.stdout)).toMatchObject({ execute: true, candidates: 1, removed: [context.contextId] });
  await expect(access(context.artifactDir)).rejects.toThrow();
});

test("list surfaces unowned crash-left stage paths instead of hiding them", async () => {
  const f = await fixture();
  const targetRoot = join(f.stateDir, "generated", "launch-contexts", "v1", "codex");
  const foreignStage = join(targetRoot, `.stage-sha256-${"f".repeat(64)}-0123456789abcdef`);
  await mkdir(foreignStage, { recursive: true });
  await writeFile(join(foreignStage, "partial.bin"), "unowned\n");

  const result = await runAgentsCli(["worker", "launch-context", "list", "--json"], f.env, f.projectRoot);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ count: 1, foreign: 1, contexts: [{ artifactDir: await realpath(foreignStage), state: "foreign" }] });
});
