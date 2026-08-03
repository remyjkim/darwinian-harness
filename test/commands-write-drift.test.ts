// ABOUTME: Verifies drwn write refuses managed-region drift unless forced.
// ABOUTME: Protects user hand-edits and the explicit recovery path.

import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createFixtureRegistry,
  installMachineBlueprint,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

async function installMachineCapabilities(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
) {
  await installMachineBlueprint(fixture, {
    skills: ["alpha"],
    servers: { context7: createFixtureRegistry().servers.context7 },
  });
}

test("write refuses when a drwn-owned user-scope Claude MCP server has been hand-edited", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineCapabilities(fixture);
  expect((await runAgentsCli(["write"], envFor(fixture))).exitCode).toBe(0);
  const settings = JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"));
  settings.mcpServers.context7.command = "node";
  await writeFile(fixture.claudeUserMcp, `${JSON.stringify(settings, null, 2)}\n`);

  const result = await runAgentsCli(["write"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("MACHINE_PROJECTION_CONFLICT");
  expect(result.stderr).toContain("drift");
});

test("write --force overwrites Claude drift", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineCapabilities(fixture);
  expect((await runAgentsCli(["write"], envFor(fixture))).exitCode).toBe(0);
  const settings = JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"));
  settings.mcpServers.context7.command = "node";
  await writeFile(fixture.claudeUserMcp, `${JSON.stringify(settings, null, 2)}\n`);

  const result = await runAgentsCli(["write", "--force"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const after = JSON.parse(await readFile(fixture.claudeUserMcp, "utf8"));
  expect(after.mcpServers.context7.command).toBe("npx");
});

for (const variant of ["different", "identical"] as const) {
  test(`first machine write rejects an ${variant} unowned skill directory`, async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineCapabilities(fixture);
    const destination = join(fixture.homeDir, ".claude", "skills", "alpha");
    await mkdir(join(fixture.homeDir, ".claude", "skills"), { recursive: true });
    if (variant === "identical") {
      await cp(join(fixture.repoRoot, "skills", "shared", "alpha"), destination, { recursive: true });
    } else {
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "SKILL.md"), "foreign content\n");
    }
    const before = await readFile(join(destination, "SKILL.md"), "utf8");

    const result = await runAgentsCli(
      ["write", "--scope", "machine", "--skills-only", "--target", "claude"],
      envFor(fixture),
    );

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
    expect(await readFile(join(destination, "SKILL.md"), "utf8")).toBe(before);
  });
}

test("machine write --force cannot claim an unowned skill directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await installMachineCapabilities(fixture);
  const destination = join(fixture.homeDir, ".claude", "skills", "alpha");
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "foreign content\n");

  const result = await runAgentsCli(
    ["write", "--scope", "machine", "--skills-only", "--target", "claude", "--force"],
    envFor(fixture),
  );

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("MACHINE_PROJECTION_CONFLICT");
  expect(await readFile(join(destination, "SKILL.md"), "utf8")).toBe("foreign content\n");
});
