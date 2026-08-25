// ABOUTME: Builds one isolated Git project with base, reviewer, and implementation Worker roots for opt-in live qualification.
// ABOUTME: Keeps drwn state and target outputs disposable while retaining the caller's real target authentication.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardLockEntry, WorkerRootLockEntry } from "../../../cli/core/card-lock";
import { PROJECT_WORKER_MIN_DRWN_VERSION } from "../../../cli/core/card-lock";
import { runGit } from "../../../cli/core/git";
import { resolveExplicitInstructionContribution } from "../../../cli/core/instruction-contribution";
import { runProcess } from "../../../cli/core/process";
import { runAgentsCli } from "../../helpers";

const hash = (char: string) => `sha256-${char.repeat(64)}`;

export interface LiveWorkerLaunchFixture {
  root: string;
  projectRoot: string;
  homeDir: string;
  agentsDir: string;
  env: Record<string, string>;
  roots: { base: string; reviewer: string; implementation: string };
  hookLogs: { base: string; reviewer: string; implementation: string };
  configBytes: string;
  lockBytes: string;
}

async function makeCapabilityCard(input: {
  sources: string;
  name: string;
  char: string;
  skill: string;
  mcp: string;
  optionalMcp?: string;
  instruction: string;
  hookLog: string;
}): Promise<CardLockEntry> {
  const path = join(input.sources, input.name.split("/").at(-1)!);
  await mkdir(join(path, "skills", input.skill), { recursive: true });
  await mkdir(join(path, "hooks", "sentinel"), { recursive: true });
  await writeFile(join(path, "skills", input.skill, "SKILL.md"), [
    "---",
    `name: ${input.skill}`,
    `description: Live qualification marker ${input.skill}.`,
    "---",
    "",
    `MARKER_${input.skill.toUpperCase().replaceAll("-", "_")}`,
    "",
  ].join("\n"));
  await writeFile(join(path, "hooks", "sentinel", "policy.ts"), [
    'import { appendFileSync } from "node:fs";',
    "export default {",
    '  policyKind: "observer",',
    `  beforeToolCall() { appendFileSync(${JSON.stringify(input.hookLog)}, "hit\\n"); return { action: "allow" }; },`,
    "};",
    "",
  ].join("\n"));
  const card: CardLockEntry = {
    name: input.name,
    requested: `${input.name}@1.0.0`,
    version: "1.0.0",
    path,
    integrity: hash(input.char),
    manifest: {
      name: input.name,
      version: "1.0.0",
      skills: { include: [input.skill] },
      servers: {
        [input.mcp]: { description: input.mcp, transport: "stdio", command: "/usr/bin/true", optional: false },
        ...(input.optionalMcp
          ? { [input.optionalMcp]: { description: input.optionalMcp, transport: "stdio" as const, command: "/usr/bin/true", optional: true } }
          : {}),
      },
      instructions: { text: input.instruction },
    },
    skills: [input.skill],
    hooks: ["sentinel"],
    hookConsent: { consentedAt: "2026-08-24T00:00:00.000Z", consentedRange: "^1.0.0" },
    registry: null,
    origin: "file",
  };
  const contribution = resolveExplicitInstructionContribution(card, path);
  if (!contribution) throw new Error(`Unable to compose live instructions for ${input.name}`);
  card.instructionConsent = {
    consentedAt: "2026-08-24T00:00:00.000Z",
    consentedRange: "^1.0.0",
    contentDigest: contribution.contentDigest,
  };
  return card;
}

async function makeBlueprint(
  sources: string,
  name: string,
  char: string,
  members: CardLockEntry[],
): Promise<CardLockEntry> {
  const path = join(sources, name.split("/").at(-1)!);
  await mkdir(path, { recursive: true });
  return {
    name,
    requested: `${name}@1.0.0`,
    version: "1.0.0",
    path,
    integrity: hash(char),
    manifest: { name, version: "1.0.0", kind: "blueprint", composedFrom: members.map((member) => member.requested) },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
}

export async function createLiveWorkerLaunchFixture(): Promise<LiveWorkerLaunchFixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "drwn-launch-live-")));
  const projectRoot = join(root, "project");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const stateDir = join(projectRoot, ".agents", "drwn");
  const sources = join(root, "cards");
  const hookLogs = {
    base: join(root, "base-hooks.log"),
    reviewer: join(root, "reviewer-hooks.log"),
    implementation: join(root, "implementation-hooks.log"),
  };
  await mkdir(stateDir, { recursive: true });
  if ((await runGit(["init", "-q"], { cwd: projectRoot })).exitCode !== 0) throw new Error("Unable to initialize live fixture Git worktree");

  const shared = await makeCapabilityCard({
    sources, name: "@live/shared", char: "a", skill: "shared-live", mcp: "shared_live_mcp",
    instruction: "SHARED_LIVE_INSTRUCTION", hookLog: join(root, "shared-hooks.log"),
  });
  const baseOnly = await makeCapabilityCard({
    sources, name: "@live/base-only", char: "b", skill: "base-live", mcp: "base_live_mcp",
    instruction: "BASE_LIVE_INSTRUCTION", hookLog: hookLogs.base,
  });
  const reviewOnly = await makeCapabilityCard({
    sources, name: "@live/review-only", char: "c", skill: "review-live", mcp: "review_live_mcp",
    optionalMcp: "review_optional_mcp", instruction: "REVIEW_LIVE_INSTRUCTION", hookLog: hookLogs.reviewer,
  });
  const implementationOnly = await makeCapabilityCard({
    sources, name: "@live/implementation-only", char: "d", skill: "implementation-live", mcp: "implementation_live_mcp",
    instruction: "IMPLEMENTATION_LIVE_INSTRUCTION", hookLog: hookLogs.implementation,
  });
  const base = await makeBlueprint(sources, "@live/base", "e", [shared, baseOnly]);
  const reviewer = await makeBlueprint(sources, "@live/reviewer", "f", [shared, reviewOnly]);
  const implementation = await makeBlueprint(sources, "@live/implementation", "1", [shared, implementationOnly]);
  const workerRoots: WorkerRootLockEntry[] = [base, reviewer, implementation].map((rootCard) => ({
    name: rootCard.name,
    requested: rootCard.requested,
    kind: "blueprint",
    members: rootCard.manifest.kind === "blueprint"
      ? (rootCard.manifest.composedFrom ?? []).map((requested) => requested.replace(/@1\.0\.0$/, ""))
      : [],
  }));
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
  const env = {
    AGENTS_REPO_ROOT: process.cwd(),
    AGENTS_HOME_DIR: homeDir,
    AGENTS_DIR: agentsDir,
    PATH: process.env.PATH ?? "",
  };
  const written = await runDrwn(["write"], env, projectRoot);
  if (written.exitCode !== 0) throw new Error(`Unable to materialize live base Worker: ${written.stderr}`);
  return {
    root,
    projectRoot,
    homeDir,
    agentsDir,
    env,
    roots: { base: base.name, reviewer: reviewer.name, implementation: implementation.name },
    hookLogs,
    configBytes,
    lockBytes,
  };
}

export async function runDrwn(
  args: string[],
  env: Record<string, string>,
  cwd: string,
) {
  const binary = process.env.DRWN_LIVE_DRWN_BIN;
  return binary
    ? runProcess([binary, ...args], { cwd, env: { ...env, AGENTS_REPO_ROOT: undefined }, timeoutMs: 120_000 })
    : runAgentsCli(args, env, cwd);
}

export async function prepareLiveContext(
  fixture: LiveWorkerLaunchFixture,
  root: string,
  target: "claude" | "codex",
) {
  const result = await runDrwn(
    ["worker", "launch-context", "prepare", root, "--target", target, "--strict", "--json"],
    fixture.env,
    fixture.projectRoot,
  );
  if (result.exitCode !== 0) throw new Error(`Unable to prepare ${target}/${root}: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout).context as {
    contextId: string;
    artifactDir: string;
    launch: { args: string[]; env: Record<string, string> };
  };
}

export async function assertIntentUnchanged(fixture: LiveWorkerLaunchFixture) {
  const stateDir = join(fixture.projectRoot, ".agents", "drwn");
  if (await readFile(join(stateDir, "config.json"), "utf8") !== fixture.configBytes) throw new Error("Live qualification changed project config");
  if (await readFile(join(stateDir, "card.lock"), "utf8") !== fixture.lockBytes) throw new Error("Live qualification changed project lock");
}

export async function removeLiveWorkerLaunchFixture(fixture: LiveWorkerLaunchFixture | undefined) {
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
}

export async function waitForPath(path: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch {
      await Bun.sleep(50);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

export async function startHerdrServer(session: string): Promise<ChildProcess> {
  const child = spawn("herdr", ["--session", session, "server"], { stdio: "ignore" });
  const socket = join(process.env.HOME ?? "", ".config", "herdr", "sessions", session, "herdr.sock");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const probe = await runProcess(["herdr", "--session", session, "api", "snapshot"], { timeoutMs: 1_000 });
    if (probe.exitCode === 0 && probe.stdout.includes('"session_snapshot"')) return child;
    if (child.exitCode !== null) throw new Error("Herdr server exited during live qualification startup");
    await Bun.sleep(100);
  }
  child.kill("SIGKILL");
  throw new Error(`Herdr server did not become ready at ${socket}`);
}

export async function stopHerdrServer(session: string, child: ChildProcess | undefined) {
  await runProcess(["herdr", "session", "stop", session, "--json"], { timeoutMs: 5_000 }).catch(() => undefined);
  child?.kill("SIGKILL");
  await runProcess(["herdr", "session", "delete", session, "--json"], { timeoutMs: 5_000 }).catch(() => undefined);
}
