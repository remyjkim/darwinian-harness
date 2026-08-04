// ABOUTME: Verifies drwn write preserves user-authored Codex servers and refuses managed drift.
// ABOUTME: Exercises the real CLI against a project-scoped .codex/config.toml.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { clearMachineBlueprint, cleanupTempRoots, createFixtureRegistry, envFor, installMachineBlueprint, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, {
    mcpServers: { context7: { enabled: true } },
  });
  return { fixture, projectDir, codexPath: join(projectDir, ".codex", "config.toml") };
}

test("write preserves a user-authored Codex server across runs", async () => {
  const { fixture, projectDir, codexPath } = await setupProject();

  expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);

  // User hand-adds an unmanaged server.
  const current = await readFile(codexPath, "utf8");
  await writeFile(codexPath, `${current}\n[mcp_servers.custom]\ncommand = "echo"\n`);

  expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const after = await readFile(codexPath, "utf8");
  expect(after).toContain("[mcp_servers.custom]");
  expect(after).toContain("[mcp_servers.context7]");
});

test("write refuses managed Codex drift unless forced", async () => {
  const { fixture, projectDir, codexPath } = await setupProject();

  expect((await runAgentsCli(["write"], envFor(fixture), projectDir)).exitCode).toBe(0);

  // Hand-edit a drwn-managed server.
  const edited = (await readFile(codexPath, "utf8")).replace('command = "npx"', 'command = "tampered"');
  await writeFile(codexPath, edited);

  const drift = await runAgentsCli(["write"], envFor(fixture), projectDir);
  expect(drift.exitCode).not.toBe(0);
  expect(drift.stderr.toLowerCase()).toContain("drift");

  const forced = await runAgentsCli(["write", "--force"], envFor(fixture), projectDir);
  expect(forced.exitCode).toBe(0);
  expect(await readFile(codexPath, "utf8")).not.toContain("tampered");
});

// ───────────────────────────────────────────────────────────────────────────
// Task 51 — S3: Codex per-server removal driven through --root
// ───────────────────────────────────────────────────────────────────────────

test("write --root removes a Codex MCP entry when the default is removed and leaves user-authored servers intact", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Seed a user-authored Codex server before drwn ever runs.
  await writeFile(
    fixture.codexConfig,
    'personality = "pragmatic"\n\n[mcp_servers.user_made]\ncommand = "echo"\n',
  );

  // Select context7 through a complete machine Blueprint and materialize at user scope.
  await installMachineBlueprint(fixture, {
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
  expect(
    (await runAgentsCli(["write", "--root", "--mcp-only", "--json"], envFor(fixture))).exitCode,
  ).toBe(0);

  // Both servers should be present at this point.
  const seeded = await readFile(fixture.codexConfig, "utf8");
  expect(seeded).toContain("[mcp_servers.context7]");
  expect(seeded).toContain("[mcp_servers.user_made]");

  // Clear the Blueprint selection and re-run --root.
  await clearMachineBlueprint(fixture);
  expect(
    (await runAgentsCli(["write", "--root", "--mcp-only", "--json"], envFor(fixture))).exitCode,
  ).toBe(0);

  const after = await readFile(fixture.codexConfig, "utf8");
  expect(after).not.toContain("[mcp_servers.context7]");
  expect(after).toContain("[mcp_servers.user_made]");
});
