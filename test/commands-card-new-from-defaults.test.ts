// ABOUTME: Verifies card new --from-defaults captures machine skill defaults.
// ABOUTME: Guards profile card scaffolding from machine.json defaults.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeMachineConfig } from "../cli/core/card-store";
import { cleanupTempRoots, envFor, publishExactOperatorProfile, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { DARWINIAN_OPERATOR_SKILL_IDS } from "../cli/core/operator-profile-contract";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function installCaptureProfile(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return (await publishExactOperatorProfile(fixture)).profile;
}

test("card new --from-defaults captures explicit machine skills into a capability Card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collectionDir = join(fixture.root, "cards");
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile: null, skills: ["alpha"], mcpServers: [] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--into", collectionDir, "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@me/everyday");

  const sourceDir = join(collectionDir, "everyday");
  expect(existsSync(join(sourceDir, "skills", "alpha", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.skills?.include).toEqual(["alpha"]);
  expect(result.stdout).toContain(`drwn card publish --from ${sourceDir}`);
});

test("card new --from-defaults flattens profile and explicit skills without profile identity", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collectionDir = join(fixture.root, "cards");
  const profile = await installCaptureProfile(fixture);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile, skills: ["alpha"], mcpServers: [] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--into", collectionDir, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const sourceDir = join(collectionDir, "everyday");
  const manifestText = await readFile(join(sourceDir, "card.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  expect(manifest.skills?.include).toEqual([...DARWINIAN_OPERATOR_SKILL_IDS, "alpha"]);
  for (const skill of DARWINIAN_OPERATOR_SKILL_IDS) {
    expect(existsSync(join(sourceDir, "skills", skill, "SKILL.md"))).toBe(true);
  }
  expect(manifest.profile).toBeUndefined();
  expect(manifest.instructions).toBeUndefined();
  expect(manifest.hooks).toBeUndefined();
  expect(manifestText).not.toContain("darwinian-operator");
  expect(manifestText).not.toContain("@darwinian/operator");
});

test("card new --from-defaults captures effective MCP definitions with secret references preserved", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const collectionDir = join(fixture.root, "cards");
  const { ensureStoreInitialized } = await import("../cli/core/card-store");
  const { seedMcpInventory } = await import("./mcp-inventory-fixture");
  await ensureStoreInitialized(fixture.agentsDir);
  await seedMcpInventory(fixture.agentsDir, {
    version: 1,
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
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile: null, skills: [], mcpServers: ["notion"] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--into", collectionDir, "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const sourceDir = join(collectionDir, "everyday");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.servers?.notion?.env?.NOTION_TOKEN).toBe("${NOTION_TOKEN}");
  expect(JSON.parse(await readFile(join(sourceDir, "mcp-servers", "notion.json"), "utf8"))).toEqual(manifest.servers.notion);
});

test("card new --from-defaults fails when no machine capabilities are configured", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
  });
  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("machine capabilities");
});
