// ABOUTME: Verifies machine capability resolution flattens only the active verified Worker closure.
// ABOUTME: Protects Card provenance and exclusion of packaged or standalone inventory defaults.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveMachineCapabilities } from "../cli/core/defaults";
import { writeMachineConfig } from "../cli/core/card-store";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { applyMachineWorkerRoots } from "../cli/core/worker-machine";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function writeCard(
  dir: string,
  manifest: Record<string, unknown>,
  skills: string[] = [],
) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const skill of skills) {
    const skillDir = join(dir, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: fixture\n---\n`);
  }
}

describe("machine capability resolution", () => {
  test("empty intent activates nothing despite packaged defaults and curated directories", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);
    await writeMachineConfig(fixture.agentsDir, createEmptyMachineConfig());

    const resolved = await resolveMachineCapabilities({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
    });

    expect(resolved.activeWorker).toBeNull();
    expect(resolved.activeCards).toEqual([]);
    expect(resolved.skills).toEqual([]);
    expect(resolved.mcpServers).toEqual([]);
  });

  test("flattens skills and MCP with exact Card provenance from the selected closure", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const memberDir = join(fixture.root, "member");
    const workerDir = join(fixture.root, "worker");
    await writeCard(memberDir, {
      name: "@me/member",
      version: "1.0.0",
      skills: { include: ["alpha"] },
      servers: {
        notion: {
          description: "Notion",
          transport: "stdio",
          command: "notion-mcp",
          optional: false,
        },
      },
    }, ["alpha"]);
    await writeCard(workerDir, {
      name: "@me/worker",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: [`file:${memberDir}`],
    });
    await applyMachineWorkerRoots(fixture.agentsDir, [`file:${workerDir}`], {
      allowUntrustedSource: true,
      repoRoot: fixture.repoRoot,
    });

    const resolved = await resolveMachineCapabilities({
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
    });

    expect(resolved.activeCards.map((card) => card.name)).toEqual(["@me/worker", "@me/member"]);
    expect(resolved.skills).toEqual([{
      id: "alpha",
      source: "worker",
      cardName: "@me/member",
      cardVersion: "1.0.0",
      path: join(memberDir, "skills", "alpha"),
      scope: "shared",
    }]);
    expect(resolved.mcpServers).toEqual([expect.objectContaining({
      id: "notion",
      source: "worker",
      cardName: "@me/member",
      cardVersion: "1.0.0",
      server: expect.objectContaining({ command: "notion-mcp" }),
    })]);
  });

  test("a null selection retains installed Cards without resolving their bytes as active", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const workerDir = join(fixture.root, "worker");
    await writeCard(workerDir, {
      name: "@me/worker",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: [],
    });
    await applyMachineWorkerRoots(fixture.agentsDir, [`file:${workerDir}`], {
      none: true,
      allowUntrustedSource: true,
      repoRoot: fixture.repoRoot,
    });

    const resolved = await resolveMachineCapabilities({ repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir });
    expect(resolved.installedCards.map((card) => card.name)).toEqual(["@me/worker"]);
    expect(resolved.activeCards).toEqual([]);
    expect(resolved.contentRootsByCard).toEqual({});
  });
});
