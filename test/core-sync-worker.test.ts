// ABOUTME: Verifies per-worker generated bundles and registry materialization.
// ABOUTME: Protects isolated worker output, symlinks, and stale bundle cleanup.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateCardManifest } from "../cli/core/card-manifest";
import { syncRepository } from "../cli/core/sync";
import { cleanupTempRoots, envFor, installProjectWorkers, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";
import { applyProjectCardSpecs } from "../cli/core/card-project";
import { buildProjectStatusV1 } from "../cli/core/diagnostics";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishWorkerFixture(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { instructions?: unknown; identity?: unknown; kind?: "card" | "blueprint"; skillBody?: string } = {},
) {
  expect((await runAgentsCli(["card", "new", "@me/mind", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "mind");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  if (options.kind) manifest.kind = options.kind;
  if (options.instructions !== undefined) manifest.instructions = options.instructions;
  if (options.identity !== undefined) manifest.identity = options.identity;
  manifest.skills = { include: ["alpha"] };
  manifest.servers = {
    "mind-server": {
      description: "Mind server",
      transport: "stdio",
      command: "mind-server",
      optional: false,
    },
  };
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(
    join(sourceDir, "skills", "alpha", "SKILL.md"),
    `---\nname: alpha\ndescription: alpha\n---\n${options.skillBody ?? ""}`,
  );
  expect((await runAgentsCli(["card", "publish", "@me/mind"], envFor(fixture))).exitCode).toBe(0);
}

async function createProjectWithCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/mind@1.0.0"], "@me/mind");
  return {
    projectDir,
    configPath,
    syncOptions: {
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      cwd: projectDir,
    },
  };
}

test("card manifest validates explicit instructions sources", () => {
  const base = { name: "@me/mind", version: "1.0.0" };

  expect(validateCardManifest({ ...base, instructions: { text: "Use concise answers." } }).ok).toBe(true);
  expect(validateCardManifest({ ...base, instructions: { path: "instructions.md" } }).ok).toBe(true);
  expect(validateCardManifest({ ...base, instructions: {} }).errors).toContain(
    "instructions must specify exactly one of text or path",
  );
  expect(validateCardManifest({ ...base, instructions: { text: "x", path: "instructions.md" } }).errors).toContain(
    "instructions must specify exactly one of text or path",
  );
  expect(validateCardManifest({ ...base, instructions: { path: "../instructions.md" } }).errors).toContain(
    "instructions.path must be a relative path inside the card content root",
  );
});

test("syncRepository emits explicit card instructions at the canonical project path", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorkerFixture(fixture, { instructions: { text: "Use compact worker instructions." } });
  const { projectDir, configPath, syncOptions } = await createProjectWithCard(fixture);
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/mind", "--instructions"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  await writeFile(join(projectDir, "AGENTS.md"), "# User-owned project notes\n");

  const result = await syncRepository(syncOptions);
  const instructionsPath = join(projectDir, ".agents", "drwn", "generated", "instructions.md");
  const content = await readFile(instructionsPath, "utf8");

  expect(content).toBe("Use compact worker instructions.\n");
  expect(result.managedPaths?.some((entry) =>
    entry.kind === "managed-content" && entry.path === ".agents/drwn/generated/instructions.md"
  )).toBe(true);
  const agents = await readFile(join(projectDir, "AGENTS.md"), "utf8");
  expect(agents).toContain("<!-- drwn:instructions:start -->");
  expect(agents).toContain("Use compact worker instructions.");
  expect(agents).toEndWith("# User-owned project notes\n");
  expect(await readFile(join(projectDir, ".claude", "CLAUDE.md"), "utf8")).toBe(
    "@../AGENTS.md\n",
  );
  const repeated = await syncRepository(syncOptions);
  expect(repeated.changes.some((change) => change.includes("AGENTS.md"))).toBe(false);
  const status = await buildProjectStatusV1({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    projectConfigPath: configPath,
  });
  expect(status?.instructionDelivery).toMatchObject({
    state: "current",
    adapter: "owned",
    issues: [],
  });
});

test("syncRepository never falls back to bundled skill instructions", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorkerFixture(fixture, { skillBody: "\nFollow alpha task handling.\n" });
  const { projectDir, syncOptions } = await createProjectWithCard(fixture);

  const result = await syncRepository(syncOptions);
  expect(
    existsSync(join(projectDir, ".agents", "drwn", "generated", "instructions.md")),
  ).toBe(false);
  expect(existsSync(join(projectDir, "AGENTS.md"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude", "CLAUDE.md"))).toBe(false);
  expect(result.warnings.join("\n")).not.toContain("Follow alpha task handling.");
});

test("syncRepository materializes isolated worker bundles and cleans removed workers", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorkerFixture(fixture);
  const { projectDir, configPath, syncOptions } = await createProjectWithCard(fixture);
  const first = await syncRepository(syncOptions);
  const workerDir = join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "mind");
  const registry = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "generated", "workers.json"), "utf8"));
  const workerJson = JSON.parse(await readFile(join(workerDir, "worker.json"), "utf8"));

  expect(first.cardModes?.["@me/mind"]?.mode).toBe("vendored");
  expect(registry.workers.map((worker: { name: string }) => worker.name)).toEqual(["@me/mind"]);
  expect(workerJson.name).toBe("@me/mind");
  expect(workerJson.schema).toBe("drwn.generated-worker");
  expect(registry).toMatchObject({ schema: "drwn.generated-workers", schemaVersion: 1 });
  expect(workerJson.skills).toEqual(["alpha"]);
  expect(workerJson.persona).toBeUndefined();
  expect(workerJson.beliefs).toBeUndefined();
  expect(workerJson.memory).toBeUndefined();
  expect(existsSync(join(workerDir, "persona.md"))).toBe(false);
  expect(lstatSync(join(workerDir, "skills", "alpha")).isDirectory()).toBe(true);
  expect(lstatSync(join(workerDir, "skills", "alpha")).isSymbolicLink()).toBe(false);
  expect(JSON.parse(await readFile(join(workerDir, "mcp", "servers.json"), "utf8")).mcpServers["mind-server"].command).toBe("mind-server");
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "mind"))).toBe(false);

  await applyProjectCardSpecs(projectDir, fixture.agentsDir, []);
  await writeSupportedProjectConfig(projectDir);
  const second = await syncRepository(syncOptions);

  expect(second.changes.some((change) => change.includes(`remove ${workerDir}`))).toBe(true);
  expect(existsSync(workerDir)).toBe(false);
});

async function publishAggregateFixture(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  for (const [name, skill, server, hook] of [
    ["@me/member-a", "alpha", "server-a", "guard"],
    ["@me/member-b", "beta", "server-b", null],
    ["@me/other", "other", "server-other", null],
  ] as const) {
    expect((await runAgentsCli(["card", "new", name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
    const [, scope, cardName] = name.match(/^(@[^/]+)\/(.+)$/)!;
    const sourceDir = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!);
    const manifestPath = join(sourceDir, "card.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.skills = { include: [skill] };
    manifest.servers = {
      [server]: { description: server, transport: "stdio", command: server, optional: false },
    };
    await mkdir(join(sourceDir, "skills", skill), { recursive: true });
    await writeFile(join(sourceDir, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n# ${skill}\n`);
    if (hook) {
      manifest.hooks = { include: [hook] };
      await mkdir(join(sourceDir, "hooks", hook), { recursive: true });
      await writeFile(join(sourceDir, "hooks", hook, "policy.ts"), "export default () => ({ decision: 'allow' });\n");
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
  }

  expect((await runAgentsCli(["card", "new", "@me/aggregate", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const blueprintPath = join(fixture.agentsDir, "drwn", "sources", "@me", "aggregate", "card.json");
  const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
  blueprint.kind = "blueprint";
  blueprint.composedFrom = ["@me/member-a@1.0.0", "@me/member-b@1.0.0"];
  blueprint.identity = { instructions: "Coordinate the aggregate Worker." };
  await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/aggregate"], envFor(fixture))).exitCode).toBe(0);
}

test("syncRepository materializes one aggregate bundle per Worker root", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishAggregateFixture(fixture);
  await mkdir(join(fixture.repoRoot, "skills", "shared", "project-only"), { recursive: true });
  await writeFile(
    join(fixture.repoRoot, "skills", "shared", "project-only", "SKILL.md"),
    "---\nname: project-only\ndescription: project-only\n---\n",
  );
  const projectDir = join(fixture.root, "aggregate-project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await writeSupportedProjectConfig(projectDir, {
    skills: { include: ["project-only"] },
    mcpServers: { "project-only": { description: "project", transport: "stdio", command: "project", optional: false } },
  });
  await applyProjectCardSpecs(projectDir, fixture.agentsDir, ["@me/aggregate@1.0.0", "@me/other@1.0.0"]);
  const selected = JSON.parse(await readFile(configPath, "utf8"));
  selected.activeWorker = "@me/aggregate";
  selected.skills = { include: ["project-only"] };
  selected.mcpServers = { "project-only": { description: "project", transport: "stdio", command: "project", optional: false } };
  await writeFile(configPath, `${JSON.stringify(selected, null, 2)}\n`);
  expect((await runAgentsCli(["card", "trust", "@me/member-a", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const syncOptions = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  };
  await syncRepository(syncOptions);

  const generated = join(projectDir, ".agents", "drwn", "generated");
  const aggregateDir = join(generated, "workers", "@me", "aggregate");
  const otherDir = join(generated, "workers", "@me", "other");
  expect(existsSync(aggregateDir)).toBe(true);
  expect(existsSync(otherDir)).toBe(true);
  expect(existsSync(join(generated, "workers", "@me", "member-a"))).toBe(false);
  expect(existsSync(join(generated, "workers", "@me", "member-b"))).toBe(false);
  expect(existsSync(join(aggregateDir, "skills", "alpha"))).toBe(true);
  expect(existsSync(join(aggregateDir, "skills", "beta"))).toBe(true);
  expect(existsSync(join(aggregateDir, "skills", "project-only"))).toBe(false);
  expect(existsSync(join(otherDir, "skills", "alpha"))).toBe(false);
  expect(existsSync(join(otherDir, "skills", "other"))).toBe(true);
  expect(existsSync(join(aggregateDir, "hooks", "claude", "composer.mjs"))).toBe(true);
  expect(existsSync(join(aggregateDir, "instructions.md"))).toBe(false);
  const aggregateMcp = JSON.parse(await readFile(join(aggregateDir, "mcp", "servers.json"), "utf8"));
  expect(Object.keys(aggregateMcp.mcpServers).sort()).toEqual(["server-a", "server-b"]);
  expect(aggregateMcp.mcpServers["project-only"]).toBeUndefined();
  const worker = JSON.parse(await readFile(join(aggregateDir, "worker.json"), "utf8"));
  expect(worker.name).toBe("@me/aggregate");
  expect(worker.members.map((member: { name: string }) => member.name)).toEqual(["@me/member-a", "@me/member-b"]);
  expect(worker.members.every((member: { version?: string; integrity?: string }) => member.version && member.integrity)).toBe(true);
  const workers = JSON.parse(await readFile(join(generated, "workers.json"), "utf8"));
  expect(workers).toMatchObject({ schema: "drwn.generated-workers", schemaVersion: 1 });
  expect(workers.workers.map((entry: { name: string }) => entry.name).sort()).toEqual(["@me/aggregate", "@me/other"]);
  expect(workers.workers.find((entry: { name: string }) => entry.name === "@me/aggregate").active).toBe(true);
  expect(JSON.parse(await readFile(join(generated, "active-worker.json"), "utf8")))
    .toMatchObject({ schema: "drwn.generated-active-worker", schemaVersion: 1, name: "@me/aggregate" });

  selected.activeWorker = "@me/other";
  await writeFile(configPath, `${JSON.stringify(selected, null, 2)}\n`);
  await syncRepository(syncOptions);
  expect(existsSync(aggregateDir)).toBe(true);
  expect(existsSync(otherDir)).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "other"))).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(false);

  selected.activeWorker = null;
  await writeFile(configPath, `${JSON.stringify(selected, null, 2)}\n`);
  await syncRepository(syncOptions);
  expect(existsSync(join(generated, "active-worker.json"))).toBe(false);
  expect(existsSync(join(generated, "instructions.md"))).toBe(false);
  expect(existsSync(aggregateDir)).toBe(true);
  expect(existsSync(otherDir)).toBe(true);

  await applyProjectCardSpecs(projectDir, fixture.agentsDir, ["@me/other@1.0.0"]);
  await syncRepository(syncOptions);
  expect(existsSync(aggregateDir)).toBe(false);
  expect(existsSync(otherDir)).toBe(true);
});
