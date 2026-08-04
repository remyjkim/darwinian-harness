// ABOUTME: Verifies fail-closed standalone inventory reference discovery.
// ABOUTME: Separates explicit machine/project intent from copied Card and inline MCP content.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  scanInventoryReferenceReport,
  scanInventoryReferences,
  withLockedInventoryReferenceReport,
} from "../cli/core/inventory-references";
import { registerProject, resolveProjectsIndexPath } from "../cli/core/project-registry";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { cleanupTempRoots, createTempRoot, writeSupportedProjectConfig } from "./helpers";

const roots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(roots.splice(0));
});

async function fixture() {
  const root = await createTempRoot("inventory-references-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  await mkdir(join(agentsDir, "drwn"), { recursive: true });
  return { root, agentsDir };
}

describe("standalone inventory reference discovery", () => {
  test("reports committed project references deterministically without V1 machine selections", async () => {
    const state = await fixture();
    const project = join(state.root, "project");
    await writeSupportedProjectConfig(project, {
      skills: { include: ["alpha"], exclude: ["beta"] },
      mcpServers: {
        notion: { enabled: true },
        inline: { description: "Inline", transport: "http", url: "https://example.test/mcp", optional: false },
      },
    });
    await registerProject(state.agentsDir, project);

    const references = await scanInventoryReferences({
      agentsDir: state.agentsDir,
      skillIds: ["alpha", "beta"],
      mcpIds: ["notion", "inline"],
      projectRoots: [project],
    });

    expect(references.map((entry) => [entry.surface, entry.kind, entry.id, entry.relation])).toEqual([
      ["project", "mcp", "notion", "mcp-toggle"],
      ["project", "skill", "alpha", "include"],
      ["project", "skill", "beta", "exclude"],
    ]);
    expect(references.filter((entry) => entry.id === "alpha" && entry.surface === "project")).toHaveLength(1);
    expect(references.some((entry) => entry.id === "inline")).toBe(false);
  });

  test("does not invent standalone references from machine scope", async () => {
    const state = await fixture();
    expect(await scanInventoryReferences({ agentsDir: state.agentsDir, skillIds: ["bootstrap-project"] })).toEqual([]);
  });

  test("reports the normalized registered and explicit roots in the declared known scope", async () => {
    const state = await fixture();
    const registered = join(state.root, "registered");
    const explicit = join(state.root, "explicit");
    await writeSupportedProjectConfig(registered, { skills: { include: ["alpha"], exclude: [] } });
    await writeSupportedProjectConfig(explicit);
    await registerProject(state.agentsDir, registered);

    const report = await scanInventoryReferenceReport({
      agentsDir: state.agentsDir,
      skillIds: ["alpha"],
      projectRoots: [explicit, registered],
    });

    expect(report.scope).toEqual({
      kind: "declared-known-scope",
      machineConfigPath: resolveMachineConfigPath(state.agentsDir),
      registeredProjectRoots: [registered],
      explicitProjectRoots: [explicit, registered].sort((a, b) => a.localeCompare(b)),
      projectRoots: [explicit, registered].sort((a, b) => a.localeCompare(b)),
    });
    expect(report.references).toEqual([
      {
        kind: "skill",
        id: "alpha",
        surface: "project",
        relation: "include",
        sourcePath: join(registered, ".agents", "drwn", "config.json"),
        projectRoot: registered,
      },
    ]);
  });

  test("locked reports revalidate the same deterministic scope under machine and project locks", async () => {
    const state = await fixture();
    const project = join(state.root, "project");
    await writeSupportedProjectConfig(project, { skills: { include: ["alpha"], exclude: [] } });
    await registerProject(state.agentsDir, project);

    const result = await withLockedInventoryReferenceReport(
      { agentsDir: state.agentsDir, skillIds: ["alpha"] },
      async (report) => ({ roots: report.scope.projectRoots, ids: report.references.map((entry) => entry.id) }),
    );

    expect(result).toEqual({ roots: [project], ids: ["alpha"] });
  });

  test.each([
    ["missing registered root", "missing"],
    ["malformed registered config", "malformed"],
  ] as const)("fails closed for a %s", async (_label, kind) => {
    const state = await fixture();
    const project = join(state.root, "project");
    if (kind === "malformed") {
      await mkdir(join(project, ".agents", "drwn"), { recursive: true });
      await writeFile(join(project, ".agents", "drwn", "config.json"), "not-json\n");
    }
    await writeFile(
      resolveProjectsIndexPath(state.agentsDir),
      `${JSON.stringify({ schemaVersion: 1, projects: [project] }, null, 2)}\n`,
    );

    await expect(scanInventoryReferences({ agentsDir: state.agentsDir, skillIds: ["alpha"] })).rejects.toMatchObject({
      code: "INVENTORY_REFERENCE_SCAN_FAILED",
    });
  });
});
