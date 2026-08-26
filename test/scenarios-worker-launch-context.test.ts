// ABOUTME: Exercises three per-agent launch contexts over one project worktree and shared active base.
// ABOUTME: Proves target/root identity, verified reuse, and no assigned-capability leakage.

import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardLockEntry, WorkerRootLockEntry } from "../cli/core/card-lock";
import { PROJECT_WORKER_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { runGit } from "../cli/core/git";
import { createExecutable, runAgentsCli } from "./helpers";

const roots: string[] = [];
const hash = (char: string) => `sha256-${char.repeat(64)}`;
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("Claude reviewer and two Codex agents share one worktree with isolated assigned Worker additions", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-scenario-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const cardSources = join(root, "cards");
  const stateDir = join(projectRoot, ".agents", "drwn");
  const binDir = join(root, "bin");
  await mkdir(stateDir, { recursive: true });
  expect((await runGit(["init", "-q"], { cwd: projectRoot })).exitCode).toBe(0);

  const card = async (name: string, char: string, skill?: string, kind: "card" | "blueprint" = "card", members: string[] = []): Promise<CardLockEntry> => {
    const path = join(cardSources, name.split("/").at(-1)!);
    await mkdir(path, { recursive: true });
    if (skill) {
      await mkdir(join(path, "skills", skill), { recursive: true });
      await writeFile(join(path, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
    }
    return {
      name,
      requested: `${name}@1.0.0`,
      version: "1.0.0",
      path,
      integrity: hash(char),
      manifest: {
        name,
        version: "1.0.0",
        ...(skill ? { skills: { include: [skill] } } : {}),
        ...(kind === "blueprint" ? { kind: "blueprint" as const, composedFrom: members } : {}),
      },
      skills: skill ? [skill] : [],
      hooks: [],
      registry: null,
      origin: "file",
    };
  };
  const shared = await card("@test/shared", "a", "shared-skill");
  const baseOnly = await card("@test/base-only", "b", "base-skill");
  const reviewOnly = await card("@test/review-only", "c", "review-skill");
  const implementationOnly = await card("@test/implementation-only", "d", "implementation-skill");
  const base = await card("@test/base", "e", undefined, "blueprint", [shared.requested, baseOnly.requested]);
  const reviewer = await card("@test/reviewer", "f", undefined, "blueprint", [shared.requested, reviewOnly.requested]);
  const implementation = await card("@test/implementation", "1", undefined, "blueprint", [shared.requested, implementationOnly.requested]);
  const workerRoots: WorkerRootLockEntry[] = [
    { name: base.name, requested: base.requested, kind: "blueprint", members: [shared.name, baseOnly.name] },
    { name: reviewer.name, requested: reviewer.requested, kind: "blueprint", members: [shared.name, reviewOnly.name] },
    { name: implementation.name, requested: implementation.requested, kind: "blueprint", members: [shared.name, implementationOnly.name] },
  ];
  const configBytes = `${JSON.stringify({
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: workerRoots.map((entry) => entry.requested),
    activeWorker: base.name,
  }, null, 2)}\n`;
  const lockBytes = `${JSON.stringify({
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: PROJECT_WORKER_MIN_DRWN_VERSION },
    workerRoots,
    cards: [base, shared, baseOnly, reviewer, reviewOnly, implementation, implementationOnly],
  }, null, 2)}\n`;
  await writeFile(join(stateDir, "config.json"), configBytes);
  await writeFile(join(stateDir, "card.lock"), lockBytes);
  await createExecutable(binDir, "codex", `if [ "\${1:-}" = "--version" ]; then echo 'codex-cli 0.149.0'; exit 0; fi\nexit 64`);
  await createExecutable(binDir, "claude", `if [ "\${1:-}" = "--version" ]; then echo '2.1.212 (Claude Code)'; exit 0; fi\nif [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "validate" ]; then exit 0; fi\nexit 64`);
  const env = {
    AGENTS_REPO_ROOT: process.cwd(),
    AGENTS_HOME_DIR: homeDir,
    AGENTS_DIR: agentsDir,
    PATH: `${binDir}:${process.env.PATH}`,
  };
  const write = await runAgentsCli(["write"], env, projectRoot);
  expect(write.exitCode, write.stderr).toBe(0);
  const configAfterWrite = await readFile(join(stateDir, "config.json"), "utf8");
  const lockAfterWrite = await readFile(join(stateDir, "card.lock"), "utf8");

  const prepare = async (rootName: string, target: "claude" | "codex") => {
    const result = await runAgentsCli(["worker", "launch-context", "prepare", rootName, "--target", target, "--json"], env, projectRoot);
    expect(result.exitCode, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const claudeReviewer = await prepare(reviewer.name, "claude");
  const codexReviewer = await prepare(reviewer.name, "codex");
  const codexReviewerReuse = await prepare(reviewer.name, "codex");
  const codexImplementation = await prepare(implementation.name, "codex");

  expect(codexReviewerReuse.reused).toBe(true);
  expect(new Set([
    claudeReviewer.context.contextId,
    codexReviewer.context.contextId,
    codexImplementation.context.contextId,
  ]).size).toBe(3);
  const claudeSkills = join(claudeReviewer.context.artifactDir, "claude", "skills");
  const codexReviewSkills = join(codexReviewer.context.artifactDir, "codex", "workspace", ".agents", "skills");
  const codexImplementationSkills = join(codexImplementation.context.artifactDir, "codex", "workspace", ".agents", "skills");
  expect(await access(join(claudeSkills, "review-skill")).then(() => true)).toBe(true);
  expect(await access(join(codexReviewSkills, "review-skill")).then(() => true)).toBe(true);
  expect(await access(join(codexImplementationSkills, "implementation-skill")).then(() => true)).toBe(true);
  for (const path of [join(claudeSkills, "shared-skill"), join(codexReviewSkills, "shared-skill"), join(codexImplementationSkills, "shared-skill")]) {
    await expect(access(path)).rejects.toThrow();
  }
  await expect(access(join(codexReviewSkills, "implementation-skill"))).rejects.toThrow();
  await expect(access(join(codexImplementationSkills, "review-skill"))).rejects.toThrow();
  expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(configAfterWrite);
  expect(await readFile(join(stateDir, "card.lock"), "utf8")).toBe(lockAfterWrite);
});
