// ABOUTME: Exercises skill surface materialization driven by target skill-surface readers.
// ABOUTME: Cursor selections and cursor-only projects must receive claude and codex skill dirs.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig } from "../cli/core/types";
import {
  cleanupTempRoots,
  envFor,
  installMachineBlueprint,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function skillProject(targets?: ProjectConfig["targets"]) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/skilled",
    skills: ["alpha"],
  });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled", {
    ...(targets ? { targets } : {}),
  });
  return { fixture, projectRoot };
}

describe("skill surface readers", () => {
  test("--target=cursor materializes claude and codex skill surfaces", async () => {
    const { fixture, projectRoot } = await skillProject();
    const result = await runAgentsCli(["write", "--target=cursor", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
  });

  test("skills for a surface with no enabled reader are not materialized", async () => {
    const { fixture, projectRoot } = await skillProject({
      claude: { enabled: false },
      cursor: { enabled: false },
    });
    const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".claude", "skills", "alpha"))).toBe(false);
    expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
  });

  test("cursor-only project still receives claude-surface skills", async () => {
    const { fixture, projectRoot } = await skillProject({
      claude: { enabled: false },
      codex: { enabled: false },
    });
    const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
  });
});

describe("opencode skill surface", () => {
  test("full write projects composed skills into the dedicated dir and declares skills.paths", async () => {
    const { fixture, projectRoot } = await skillProject();
    const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    const projected = join(projectRoot, ".agents", "drwn", "opencode-skills", "alpha", "SKILL.md");
    expect(existsSync(projected)).toBe(true);
    expect(await readFile(projected, "utf8")).toBe(
      await readFile(join(projectRoot, ".claude", "skills", "alpha", "SKILL.md"), "utf8"),
    );
    const record = JSON.parse(
      await readFile(join(projectRoot, ".agents", "drwn", "write-record.json"), "utf8"),
    ) as { managedPaths: Array<Record<string, unknown>> };
    expect(record.managedPaths).toContainEqual(expect.objectContaining({
      path: ".agents/drwn/opencode-skills/alpha",
      kind: "managed-directory",
      surface: "skill",
      target: "opencode",
    }));
    const opencodeConfig = JSON.parse(await readFile(join(projectRoot, "opencode.json"), "utf8"));
    expect(opencodeConfig.skills.paths).toContain(".agents/drwn/opencode-skills");
    expect(record.managedPaths).toContainEqual(expect.objectContaining({
      path: "opencode.json",
      kind: "managed-fields",
      surface: "mcp",
      target: "opencode",
      fields: expect.arrayContaining(["skillsPaths"]),
    }));
  });

  test("--mcp-only skips the dir and retains the prior skills projection untouched", async () => {
    const { fixture, projectRoot } = await skillProject();
    expect((await runAgentsCli(["write", "--mcp-only", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".agents", "drwn", "opencode-skills"))).toBe(false);
    expect(existsSync(join(projectRoot, "opencode.json"))).toBe(false);

    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    expect((await runAgentsCli(["write", "--mcp-only", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".agents", "drwn", "opencode-skills", "alpha", "SKILL.md"))).toBe(true);
    const opencodeConfig = JSON.parse(await readFile(join(projectRoot, "opencode.json"), "utf8"));
    expect(opencodeConfig.skills.paths).toContain(".agents/drwn/opencode-skills");
    const record = JSON.parse(
      await readFile(join(projectRoot, ".agents", "drwn", "write-record.json"), "utf8"),
    ) as { managedPaths: Array<{ path: string; fields?: string[] }> };
    expect(record.managedPaths.find((entry) => entry.path === "opencode.json")?.fields).toContain("skillsPaths");
    expect(record.managedPaths.some((entry) => entry.path === ".agents/drwn/opencode-skills/alpha")).toBe(true);
  });

  test("--skills-only writes the dir and declares skills.paths without touching mcp", async () => {
    const { fixture, projectRoot } = await skillProject();
    const result = await runAgentsCli(["write", "--skills-only", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".agents", "drwn", "opencode-skills", "alpha", "SKILL.md"))).toBe(true);
    const opencodeConfig = JSON.parse(await readFile(join(projectRoot, "opencode.json"), "utf8"));
    expect(opencodeConfig.skills.paths).toContain(".agents/drwn/opencode-skills");
    expect(opencodeConfig.mcp).toBeUndefined();
  });

  test("excluding the skill removes only the owned dir entry", async () => {
    const { fixture, projectRoot } = await skillProject();
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    const userDir = join(projectRoot, ".agents", "drwn", "opencode-skills", "user-authored");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "SKILL.md"), "user-owned\n");

    const configPath = join(projectRoot, ".agents", "drwn", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.skills = { exclude: ["alpha"] };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".agents", "drwn", "opencode-skills", "alpha"))).toBe(false);
    expect(existsSync(join(userDir, "SKILL.md"))).toBe(true);
  });

  test("machine-scope writes do not project the dedicated dir", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, { skills: ["alpha"] });
    const result = await runAgentsCli(["write", "--root", "--json"], envFor(fixture));
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(fixture.homeDir, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(fixture.homeDir, ".agents", "drwn", "opencode-skills"))).toBe(false);
    expect(existsSync(join(fixture.homeDir, "opencode.json"))).toBe(false);
  });
});
