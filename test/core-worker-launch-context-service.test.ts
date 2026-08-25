// ABOUTME: Verifies the public launch planning service is target-neutral and zero-write.
// ABOUTME: Protects dry-run automation from target execution and generated/shared state mutation.

import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROJECT_WORKER_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { runGit } from "../cli/core/git";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("project launch planning returns a deterministic full assigned closure and writes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-service-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const cardRoot = join(root, "card");
  const stateDir = join(projectRoot, ".agents", "drwn");
  await mkdir(join(cardRoot, "skills", "review"), { recursive: true });
  await writeFile(join(cardRoot, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: review\n---\n");
  await mkdir(stateDir, { recursive: true });
  const configBytes = `${JSON.stringify({
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: ["@test/reviewer@1.0.0"],
    activeWorker: null,
  }, null, 2)}\n`;
  const lockBytes = `${JSON.stringify({
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: PROJECT_WORKER_MIN_DRWN_VERSION },
    workerRoots: [{ name: "@test/reviewer", requested: "@test/reviewer@1.0.0", kind: "card", members: [] }],
    cards: [{
      name: "@test/reviewer",
      requested: "@test/reviewer@1.0.0",
      version: "1.0.0",
      path: cardRoot,
      integrity: `sha256-${"a".repeat(64)}`,
      manifest: { name: "@test/reviewer", version: "1.0.0", skills: { include: ["review"] } },
      skills: ["review"],
      hooks: [],
      registry: null,
      origin: "file",
    }],
  }, null, 2)}\n`;
  await writeFile(join(stateDir, "config.json"), configBytes);
  await writeFile(join(stateDir, "card.lock"), lockBytes);
  const beforeEntries = await readdir(stateDir);
  const service = await import("../cli/core/worker-launch-context/service").catch(() => ({} as any));
  expect(typeof service.planProjectWorkerLaunchContext).toBe("function");

  const first = await service.planProjectWorkerLaunchContext({
    projectRoot,
    assignedRoot: "@test/reviewer",
    target: "codex",
    repoRoot: process.cwd(),
    agentsDir,
    homeDir,
  });
  const second = await service.planProjectWorkerLaunchContext({
    projectRoot,
    assignedRoot: "@test/reviewer",
    target: "codex",
    repoRoot: process.cwd(),
    agentsDir,
    homeDir,
  });

  expect(first.plan).toEqual(second.plan);
  expect(first.plan.baseRoot).toBeNull();
  expect(first.plan.capabilities.skills.map((entry: { id: string }) => entry.id)).toEqual(["review"]);
  expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(configBytes);
  expect(await readFile(join(stateDir, "card.lock"), "utf8")).toBe(lockBytes);
  expect(await readdir(stateDir)).toEqual(beforeEntries);
  await expect(access(join(stateDir, "generated", "launch-contexts"))).rejects.toThrow();
});

test("prepare service probes, renders, publishes, and then reuses the Codex context", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-prepare-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const cardRoot = join(root, "card");
  const stateDir = join(projectRoot, ".agents", "drwn");
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
  const service = await import("../cli/core/worker-launch-context/service") as any;
  expect(typeof service.prepareProjectWorkerLaunchContext).toBe("function");
  const options = {
    projectRoot,
    assignedRoot: "@test/reviewer",
    target: "codex" as const,
    repoRoot: process.cwd(),
    agentsDir,
    homeDir,
  };
  const dependencies = {
    probe: async () => ({ minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" }),
  };

  const first = await service.prepareProjectWorkerLaunchContext(options, dependencies);
  const second = await service.prepareProjectWorkerLaunchContext(options, dependencies);

  expect(first.reused).toBe(false);
  expect(second.reused).toBe(true);
  expect(first.context.targetCompatibility).toEqual({ minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" });
  expect(await readFile(join(first.context.artifactDir, "codex", "workspace", ".agents", "skills", "review", "SKILL.md"), "utf8")).toContain("name: review");
});
