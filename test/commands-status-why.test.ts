// ABOUTME: Verifies `drwn status --why` and `--explain` provenance output.
// ABOUTME: Protects the cards-era diagnostics command surface.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, createCatalogCardSource, envFor, installMachineBlueprint, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishDiagnosticCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await publishCardWithSkills(fixture, {
    name: "@me/backend",
    skills: ["alpha"],
    servers: {
      "card-server": {
        description: "From card",
        transport: "stdio",
        command: "card-run",
        optional: false,
      },
    },
  });
}

test("status --why answers typed and unique bare queries", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishDiagnosticCard(fixture);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["apply", "@me/backend@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const skill = await runAgentsCli(["status", "--why", "skill:alpha"], envFor(fixture), projectDir);
  const server = await runAgentsCli(["status", "--why", "card-server"], envFor(fixture), projectDir);

  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("card @me/backend@1.0.0");
  expect(server.exitCode).toBe(0);
  expect(server.stdout).toContain("server:card-server");
});

test("status --why bare query fails when ambiguous and --explain includes provenance", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await writeSupportedProjectConfig(projectDir, {
    skills: { include: ["alpha"] },
    mcpServers: { alpha: { enabled: true } },
  });

  const ambiguous = await runAgentsCli(["status", "--why", "alpha"], envFor(fixture), projectDir);
  const explain = await runAgentsCli(["status", "--explain"], envFor(fixture), projectDir);

  expect(ambiguous.exitCode).not.toBe(0);
  expect(ambiguous.stderr).toContain("ambiguous");
  expect(explain.exitCode).toBe(0);
  expect(explain.stdout).toContain("Skills");
  expect(explain.stdout).toContain("Targets");
});

test("status --why uses machine inventory provenance terminology", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const skill = await runAgentsCli(["status", "--why", "skill:alpha"], envFor(fixture));
  const server = await runAgentsCli(["status", "--why", "server:context7"], envFor(fixture));

  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("repo or installed skill inventory");
  expect(skill.stdout).not.toContain("library");
  expect(server.exitCode).toBe(0);
  expect(server.stdout).toContain("registry or standalone machine inventory");
  expect(server.stdout).not.toContain("library");
});

test("status --why attributes active machine capabilities to their Worker Card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineBlueprint(fixture, {
    skills: ["closure-skill"],
    servers: {
      "closure-server": {
        description: "Closure server",
        transport: "stdio",
        command: "closure-server",
        optional: false,
      },
    },
  });

  const skill = await runAgentsCli(["status", "--why", "skill:closure-skill"], envFor(fixture));
  const server = await runAgentsCli(["status", "--why", "server:closure-server"], envFor(fixture));

  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("machine Worker Card @me/machine-capabilities@1.0.0");
  expect(server.exitCode).toBe(0);
  expect(server.stdout).toContain("machine Worker Card @me/machine-capabilities@1.0.0");
});

test("status --why and --explain expose machine Worker roots and active Card closure", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineBlueprint(fixture, { skills: ["closure-skill"] });

  const member = await runAgentsCli(
    ["status", "--why", "card:@me/machine-capabilities"],
    envFor(fixture),
  );
  const root = await runAgentsCli(
    ["status", "--why", "card:@me/machine-worker"],
    envFor(fixture),
  );
  const explain = await runAgentsCli(["status", "--explain"], envFor(fixture));

  expect(member.exitCode, member.stderr).toBe(0);
  expect(member.stdout).toContain("machine Worker Card @me/machine-capabilities@1.0.0");
  expect(root.exitCode, root.stderr).toBe(0);
  expect(root.stdout).toContain("active machine Worker root @me/machine-worker@1.0.0");
  expect(explain.exitCode, explain.stderr).toBe(0);
  expect(explain.stdout).toContain("@me/machine-worker@1.0.0");
  expect(explain.stdout).toContain("@me/machine-capabilities@1.0.0");
  expect(explain.stdout).toContain("closure-skill from @me/machine-capabilities@1.0.0");
});

test("machine status and --why use the last Card for colliding MCP definitions", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  for (const name of [
    "@me/first-capabilities",
    "@me/second-capabilities",
  ] as const) {
    await publishCardWithSkills(fixture, {
      name,
      skills: [],
      servers: {
        shared: {
          description: "Shared server",
          transport: "stdio",
          command: "shared-server",
          optional: false,
        },
      },
    });
  }
  const sourceDir = await createCatalogCardSource(fixture, "@me/collision-worker", {
    kind: "blueprint",
  });
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.kind = "blueprint";
  manifest.composedFrom = [
    "@me/first-capabilities@1.0.0",
    "@me/second-capabilities@1.0.0",
  ];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect(
    (await runAgentsCli(["card", "publish", "@me/collision-worker"], envFor(fixture))).exitCode,
  ).toBe(0);
  const { applyMachineWorkerRoots } = await import("../cli/core/worker-machine");
  await applyMachineWorkerRoots(fixture.agentsDir, ["@me/collision-worker@1.0.0"]);

  const status = await runAgentsCli(["status", "--json"], envFor(fixture));
  const why = await runAgentsCli(["status", "--why", "server:shared"], envFor(fixture));

  expect(status.exitCode, status.stderr).toBe(0);
  expect(JSON.parse(status.stdout).capabilities.mcpServers).toEqual([
    expect.objectContaining({
      id: "shared",
      cardName: "@me/second-capabilities",
      status: "resolved",
    }),
  ]);
  expect(why.exitCode, why.stderr).toBe(0);
  expect(why.stdout).toContain("machine Worker Card @me/second-capabilities@1.0.0");
});
