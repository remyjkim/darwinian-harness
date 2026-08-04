// ABOUTME: Verifies the first supported machine MCP inventory lifecycle commands.
// ABOUTME: Pins secret-safe records, references, explicit selection, and record-scoped removal.

import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeMachineConfig } from "../cli/core/machine-config";
import { findStandaloneMcpRecord } from "../cli/core/inventory";
import { registerProject } from "../cli/core/project-registry";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const roots: string[] = [];
afterEach(async () => cleanupTempRoots(roots.splice(0)));

async function fixture() {
  const state = await scaffoldCliFixture();
  roots.push(state.root);
  await initializeMachineConfig(resolveMachineConfigPath(state.agentsDir));
  return state;
}

async function writeServer(root: string, name: string, description = "Server") {
  const path = join(root, `${name}.json`);
  await writeFile(path, `${JSON.stringify({
    description,
    transport: "http",
    url: `https://${name}.test/mcp`,
    headers: { Authorization: "${MCP_TEST_TOKEN}" },
    optional: true,
  }, null, 2)}\n`);
  return path;
}

test("machine mcp add, list, and show preserve secret references and remain inactive", async () => {
  const state = await fixture();
  const source = await writeServer(state.root, "notion-local");

  const preview = await runAgentsCli(["machine", "mcp", "add", source, "--as", "notion-local", "--dry-run", "--json"], envFor(state));
  expect(preview.exitCode).toBe(0);
  expect(JSON.parse(preview.stdout)).toMatchObject({ action: "would-add", id: "notion-local", activation: "inventory-only" });
  expect(await findStandaloneMcpRecord(state.agentsDir, "notion-local")).toBeNull();

  const added = await runAgentsCli(["machine", "mcp", "add", source, "--as", "notion-local", "--json"], envFor(state));
  expect(added.exitCode).toBe(0);
  expect(JSON.parse(added.stdout)).toMatchObject({ action: "added", id: "notion-local", activation: "inventory-only" });
  const record = await findStandaloneMcpRecord(state.agentsDir, "notion-local");
  expect(record?.server.headers).toEqual({ Authorization: "${MCP_TEST_TOKEN}" });

  const listed = await runAgentsCli(["machine", "mcp", "list", "--json"], envFor(state));
  expect(listed.exitCode).toBe(0);
  expect(JSON.parse(listed.stdout)).toContainEqual(expect.objectContaining({
    kind: "mcp",
    id: "notion-local",
    owner: "standalone",
    activation: "inventory-only",
  }));
  const shown = await runAgentsCli(["machine", "mcp", "show", "notion-local", "--json"], envFor(state));
  expect(shown.exitCode).toBe(0);
  expect(JSON.stringify(JSON.parse(shown.stdout))).not.toContain("resolved-secret");
});

test("machine mcp rejects immutable registry collisions and unresolved secret literals", async () => {
  const state = await fixture();
  const source = await writeServer(state.root, "collision");
  const collision = await runAgentsCli(["machine", "mcp", "add", source, "--as", "context7"], envFor(state));
  expect(collision.exitCode).not.toBe(0);
  expect(`${collision.stdout}\n${collision.stderr}`).toMatch(/immutable bundled registry/);

  const literalPath = join(state.root, "literal.json");
  await writeFile(literalPath, JSON.stringify({
    description: "Literal",
    transport: "http",
    url: "https://literal.test/mcp",
    headers: { Authorization: "Bearer unresolved-literal" },
    optional: true,
  }));
  const literal = await runAgentsCli(["machine", "mcp", "add", literalPath, "--as", "literal"], envFor(state));
  expect(literal.exitCode).not.toBe(0);
  expect(`${literal.stdout}\n${literal.stderr}`).toMatch(/reference an environment variable/);
  expect(await findStandaloneMcpRecord(state.agentsDir, "literal")).toBeNull();
});

test("machine mcp references block remove while same-ID update discloses and proceeds", async () => {
  const state = await fixture();
  const source = await writeServer(state.root, "referenced", "Initial");
  expect((await runAgentsCli(["machine", "mcp", "add", source, "--as", "referenced"], envFor(state))).exitCode).toBe(0);
  const projectRoot = join(state.root, "project");
  await writeSupportedProjectConfig(projectRoot, { mcpServers: { referenced: { enabled: true } } });
  await registerProject(state.agentsDir, projectRoot);

  const references = await runAgentsCli(["machine", "mcp", "references", "referenced", "--json"], envFor(state));
  expect(references.exitCode).toBe(0);
  expect(JSON.parse(references.stdout)).toMatchObject({
    resource: { kind: "mcp", id: "referenced" },
    scope: { projectRoots: [projectRoot] },
  });
  const blocked = await runAgentsCli(["machine", "mcp", "remove", "referenced", "--json"], envFor(state));
  expect(blocked.exitCode).not.toBe(0);

  const replacement = await writeServer(state.root, "replacement", "Updated");
  const updated = await runAgentsCli([
    "machine", "mcp", "update", "referenced", "--from", replacement, "--json",
  ], envFor(state));
  expect(updated.exitCode).toBe(0);
  expect(JSON.parse(updated.stdout)).toMatchObject({ action: "updated", id: "referenced" });
  expect((await findStandaloneMcpRecord(state.agentsDir, "referenced"))?.server.description).toBe("Updated");
});

test("machine mcp enable and disable fail with Blueprint guidance without mutating V2", async () => {
  const state = await fixture();
  const source = await writeServer(state.root, "toggle");
  expect((await runAgentsCli(["machine", "mcp", "add", source, "--as", "toggle"], envFor(state))).exitCode).toBe(0);

  const machinePath = resolveMachineConfigPath(state.agentsDir);
  const before = await readFile(machinePath, "utf8");
  const enabled = await runAgentsCli(["machine", "mcp", "enable", "toggle", "--json"], envFor(state));
  const disabled = await runAgentsCli(["machine", "mcp", "disable", "toggle", "--json"], envFor(state));
  for (const result of [enabled, disabled]) {
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("drwn apply --root");
    expect(`${result.stdout}\n${result.stderr}`).toContain("drwn use --root");
  }
  expect(await readFile(machinePath, "utf8")).toBe(before);
});
