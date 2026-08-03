// ABOUTME: Verifies project-to-card capture creates self-contained card sources.
// ABOUTME: Protects Wave 2's adoption entry point before the CLI wrapper is added.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureProjectAsCard } from "../cli/core/card-capture";
import { assertValidCardManifest } from "../cli/core/card-manifest";
import { sanitizeMcpServerSecrets } from "../cli/core/mcp-secret-policy";
import {
  cleanupTempRoots,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

afterEach(async () => {
  delete process.env.DRWN_STORE_READONLY;
  delete process.env.DRWN_CAPTURE_SECRET;
  await cleanupTempRoots(tempRoots);
});

test("shared MCP secret policy preserves environment references without resolving them", () => {
  const server = sanitizeMcpServerSecrets("notion", {
    description: "Notion",
    transport: "http",
    url: "https://mcp.notion.com/mcp",
    headers: { Authorization: "${NOTION_TOKEN}" },
    optional: true,
  });

  expect(server.headers).toEqual({ Authorization: "${NOTION_TOKEN}" });
});

test("captureProjectAsCard snapshots only the selected closure and explicit overlays", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  process.env.DRWN_CAPTURE_SECRET = "super-secret-value";
  await publishCardWithSkills(fixture, {
    name: "@me/base",
    skills: ["card-alpha"],
    servers: {
      "card-server": {
        description: "Card server",
        transport: "stdio",
        command: "card-server",
        optional: false,
      },
      connector: {
        description: "Platform connector",
        transport: "platform-provided",
        provider: "platform",
        optional: false,
      },
    },
  });
  await publishCardWithSkills(fixture, {
    name: "@me/inactive",
    skills: ["inactive-skill"],
    servers: {
      "inactive-server": {
        description: "Inactive server",
        transport: "stdio",
        command: "inactive-server",
        optional: false,
      },
    },
  });
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(
    projectDir,
    fixture.agentsDir,
    ["@me/base@1.0.0", "@me/inactive@1.0.0"],
    "@me/base",
    {
      skills: { include: ["beta"] },
      mcpServers: {
        "project-server": {
          description: "Project server",
          transport: "stdio",
          command: "project-server",
          args: ["--token", "super-secret-value"],
          env: { API_KEY: "super-secret-value" },
          optional: false,
        },
      },
      extensions: { custom: { enabled: true, flavor: "test" } },
      targets: { cursor: { enabled: false } },
    },
  );
  const machinePath = join(fixture.agentsDir, "drwn", "machine.json");
  const machine = JSON.parse(await readFile(machinePath, "utf8"));
  machine.capabilities = { profile: null, skills: ["alpha"], mcpServers: ["context7"] };
  await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  await writeFile(fixture.codexConfig, '[mcp_servers.ambient]\ncommand = "ambient"\n');
  const generatedSecret = "generated-secret-value";
  await mkdir(join(projectDir, ".agents", "drwn", "generated"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "generated", "do-not-capture.txt"), generatedSecret);

  const result = await captureProjectAsCard({
    agentsDir: fixture.agentsDir,
    repoRoot: fixture.repoRoot,
    homeDir: fixture.homeDir,
    projectPath: projectDir,
    name: "@me/captured",
    sourceDir: join(fixture.root, "card-sources", "captured"),
  });

  expect(result.name).toBe("@me/captured");
  expect(result.skillCount).toBe(2);
  expect(result.serverCount).toBe(2);
  expect(result.extensionCount).toBe(1);
  expect(result.targetCount).toBe(1);
  expect(existsSync(join(result.sourceDir, "skills", "card-alpha", "SKILL.md"))).toBe(true);
  expect(existsSync(join(result.sourceDir, "skills", "beta", "SKILL.md"))).toBe(true);

  const manifest = JSON.parse(await readFile(join(result.sourceDir, "card.json"), "utf8"));
  assertValidCardManifest(manifest);
  expect(manifest.name).toBe("@me/captured");
  expect(manifest.version).toBe("0.1.0");
  expect(manifest.skills?.include).toEqual(["card-alpha", "beta"]);
  expect(manifest.description).toContain("selected Worker @me/base@1.0.0");
  expect((manifest.servers?.["card-server"] as { command?: string } | undefined)?.command).toBe("card-server");
  expect((manifest.servers?.["project-server"] as { env?: Record<string, string> } | undefined)?.env?.API_KEY).toBe("${DRWN_CAPTURE_SECRET}");
  expect((manifest.servers?.["project-server"] as { args?: string[] } | undefined)?.args).toEqual([
    "--token",
    "${DRWN_CAPTURE_SECRET}",
  ]);
  const serialized = JSON.stringify(manifest);
  expect(serialized).not.toContain("super-secret-value");
  expect(serialized).not.toContain("generated-secret-value");
  expect(serialized).not.toContain("inactive-skill");
  expect(serialized).not.toContain("inactive-server");
  expect(serialized).not.toContain("context7");
  expect(serialized).not.toContain("ambient");
  expect(serialized).not.toContain("connector");
  expect(manifest.extensions?.custom).toEqual({ enabled: true, flavor: "test" });
  expect(manifest.targets?.cursor?.enabled).toBe(false);
});

test("captureProjectAsCard refuses to overwrite an existing source", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await publishCardWithSkills(fixture, { name: "@me/base", skills: [] });
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base");
  const sourceDir = join(fixture.root, "card-sources", "captured");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), "{}\n");

  await expect(
    captureProjectAsCard({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      homeDir: fixture.homeDir,
      projectPath: projectDir,
      name: "@me/captured",
      sourceDir,
    }),
  ).rejects.toThrow(/Card source destination already exists/);
});

test("captureProjectAsCard copies selected hooks after applying project exclusions", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const { createCatalogCardSource } = await import("./helpers");
  await createCatalogCardSource(fixture, "@me/policy");
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "audit"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "blocked"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "hook-project");
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/policy@1.0.0"], "@me/policy", {
    hooks: { exclude: ["blocked"] },
  });

  const result = await captureProjectAsCard({
    agentsDir: fixture.agentsDir,
    repoRoot: fixture.repoRoot,
    homeDir: fixture.homeDir,
    projectPath: projectDir,
    name: "@me/captured-policy",
    sourceDir: join(fixture.root, "card-sources", "captured-policy"),
    noGit: true,
  });
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));

  expect(result.hookCount).toBe(1);
  expect(manifest.hooks?.include).toEqual(["audit"]);
  expect(existsSync(join(result.sourceDir, "hooks", "audit", "policy.ts"))).toBe(true);
  expect(existsSync(join(result.sourceDir, "hooks", "blocked"))).toBe(false);
});

test("captureProjectAsCard respects DRWN_STORE_READONLY", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await publishCardWithSkills(fixture, { name: "@me/base", skills: [] });
  await installProjectWorkers(projectDir, fixture.agentsDir, ["@me/base@1.0.0"], "@me/base");
  process.env.DRWN_STORE_READONLY = "1";

  await expect(
    captureProjectAsCard({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      homeDir: fixture.homeDir,
      projectPath: projectDir,
      name: "@me/captured",
      sourceDir: join(fixture.root, "card-sources", "captured"),
    }),
  ).rejects.toThrow(/read-only/);
});

test("captureProjectAsCard requires an active Worker without creating a source", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  const sourceDir = join(fixture.root, "card-sources", "captured");

  await expect(captureProjectAsCard({
    agentsDir: fixture.agentsDir,
    repoRoot: fixture.repoRoot,
    homeDir: fixture.homeDir,
    projectPath: projectDir,
    name: "@me/captured",
    sourceDir,
  })).rejects.toThrow(/active Worker/i);

  expect(existsSync(sourceDir)).toBe(false);
});
