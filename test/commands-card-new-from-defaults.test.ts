// ABOUTME: Verifies card new --from-defaults captures the active machine Worker closure.
// ABOUTME: Guards plain Card scaffolding from inactive roots, ambient inventory, and Blueprint identity.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  installMachineBlueprint,
  publishCardWithSkills,
  publishMachineBlueprint,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card new --from-defaults captures active machine Worker skills into a capability Card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collectionDir = join(fixture.root, "cards");
  await installMachineBlueprint(fixture, { skills: ["alpha"] });

  const result = await runAgentsCli(["card", "new", "everyday", "--scope", "@me", "--from-defaults", "--into", collectionDir, "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@me/everyday");

  const sourceDir = join(collectionDir, "everyday");
  expect(existsSync(join(sourceDir, "skills", "alpha", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.skills?.include).toEqual(["alpha"]);
  expect(result.stdout).toContain(`drwn card publish --from ${sourceDir}`);
});

test("card new --from-defaults flattens only the active closure without Blueprint identity", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collectionDir = join(fixture.root, "cards");
  const activeRef = await publishMachineBlueprint(fixture, {
    rootName: "@me/active-worker",
    memberName: "@me/active-capabilities",
    skills: ["alpha"],
  });
  const inactiveRef = await publishMachineBlueprint(fixture, {
    rootName: "@me/inactive-worker",
    memberName: "@me/inactive-capabilities",
    skills: ["inactive-skill"],
  });
  const { applyMachineWorkerRoots } = await import("../cli/core/worker-machine");
  await applyMachineWorkerRoots(fixture.agentsDir, [activeRef, inactiveRef], {
    active: "@me/active-worker",
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--scope", "@me", "--from-defaults", "--into", collectionDir, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const sourceDir = join(collectionDir, "everyday");
  const manifestText = await readFile(join(sourceDir, "card.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  expect(manifest.skills?.include).toEqual(["alpha"]);
  expect(existsSync(join(sourceDir, "skills", "alpha", "SKILL.md"))).toBe(true);
  expect(existsSync(join(sourceDir, "skills", "inactive-skill", "SKILL.md"))).toBe(false);
  expect(manifest.kind).toBeUndefined();
  expect(manifest.composedFrom).toBeUndefined();
  expect(manifest.instructions).toBeUndefined();
  expect(manifest.hooks).toBeUndefined();
  expect(manifestText).not.toContain("active-worker");
  expect(manifestText).not.toContain("inactive-worker");
});

test("card new --from-defaults captures effective MCP definitions with secret references preserved", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collectionDir = join(fixture.root, "cards");
  await installMachineBlueprint(fixture, {
    servers: {
      notion: {
        description: "Notion",
        transport: "stdio",
        command: "npx",
        env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
        optional: false,
      },
    },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--scope", "@me", "--from-defaults", "--into", collectionDir, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const sourceDir = join(collectionDir, "everyday");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.servers?.notion?.env?.NOTION_TOKEN).toBe("${NOTION_TOKEN}");
  expect(JSON.parse(await readFile(join(sourceDir, "mcp-servers", "notion.json"), "utf8"))).toEqual(manifest.servers.notion);
});

test("card new --from-defaults fails when no machine capabilities are configured", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const result = await runAgentsCli(["card", "new", "everyday", "--scope", "@me", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("machine capabilities");
});

test("card new --from-defaults rejects incompatible active-closure MCP definitions", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  for (const [name, command] of [
    ["@me/first-capabilities", "first-server"],
    ["@me/second-capabilities", "second-server"],
  ] as const) {
    await publishCardWithSkills(fixture, {
      name,
      skills: [],
      servers: {
        shared: {
          description: "Shared server",
          transport: "stdio",
          command,
          optional: false,
        },
      },
    });
  }
  const rootSource = await createCatalogCardSource(fixture, "@me/conflicting-worker", {
    kind: "blueprint",
  });
  const rootManifestPath = join(rootSource, "card.json");
  const rootManifest = JSON.parse(await readFile(rootManifestPath, "utf8"));
  rootManifest.kind = "blueprint";
  rootManifest.composedFrom = [
    "@me/first-capabilities@1.0.0",
    "@me/second-capabilities@1.0.0",
  ];
  await writeFile(rootManifestPath, `${JSON.stringify(rootManifest, null, 2)}\n`);
  expect(
    (await runAgentsCli(["card", "publish", "@me/conflicting-worker"], envFor(fixture))).exitCode,
  ).toBe(0);
  const { applyMachineWorkerRoots } = await import("../cli/core/worker-machine");
  await applyMachineWorkerRoots(fixture.agentsDir, ["@me/conflicting-worker@1.0.0"]);
  const collectionDir = join(fixture.root, "cards");

  const result = await runAgentsCli(
    ["card", "new", "captured", "--scope", "@me", "--from-defaults", "--into", collectionDir, "--no-git"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Worker capability mcp:shared has incompatible definitions");
  expect(existsSync(join(collectionDir, "captured"))).toBe(false);
});
