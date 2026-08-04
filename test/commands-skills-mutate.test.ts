// ABOUTME: Verifies removed curation syntax and explicit machine skill projection.
// ABOUTME: Ensures ambient curated directories cannot activate machine skills.

import { afterEach, describe, expect, test } from "bun:test";
import { access, lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clearMachineBlueprint, cleanupTempRoots, installMachineBlueprint, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

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

describe("machine skill selection", () => {
  test("skills curate and uncurate are unknown syntax without mutation", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
    tempRoots.push(fixture.root);

    const curate = await runAgentsCli(["skills", "curate", "beta"], envFor(fixture));
    const uncurate = await runAgentsCli(["skills", "uncurate", "alpha"], envFor(fixture));

    expect(curate.exitCode).not.toBe(0);
    expect(uncurate.exitCode).not.toBe(0);
    await expect(access(join(fixture.agentsDir, "skills", "beta"))).rejects.toThrow();
    expect((await lstat(join(fixture.agentsDir, "skills", "alpha"))).isDirectory()).toBe(true);
  });

  test("write projects only skills from the active machine Blueprint closure", async () => {
    const fixture = await scaffoldCliFixture({ curatedSkillNames: ["beta"] });
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, { skills: ["alpha"] });

    const result = await runAgentsCli(["write", "--scope", "machine", "--skills-only"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(fixture.homeDir, ".claude", "skills", "alpha"))).isDirectory()).toBe(true);
    await expect(access(join(fixture.homeDir, ".claude", "skills", "beta"))).rejects.toThrow();
  });

  test("clearing the machine Blueprint removes only prior drwn-owned projection", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await installMachineBlueprint(fixture, { skills: ["alpha"] });
    await runAgentsCli(["write", "--scope", "machine", "--skills-only"], envFor(fixture));
    await clearMachineBlueprint(fixture);

    const result = await runAgentsCli(["write", "--scope", "machine", "--skills-only"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    await expect(access(join(fixture.homeDir, ".claude", "skills", "alpha"))).rejects.toThrow();
  });

  test("project extension skill selection remains project-owned", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    for (const name of ["parallel-web-search", "parallel-web-extract", "parallel-deep-research", "parallel-data-enrichment"]) {
      const skillDir = join(fixture.repoRoot, "skills", "shared", name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
    }
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir, {
      extensions: { parallel: { enabled: true, skills: true, mcp: false } },
      skills: { exclude: ["parallel-web-extract"] },
    });

    const result = await runAgentsCli(["write", "--skills-only"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect((await lstat(join(projectDir, ".claude", "skills", "parallel-web-search"))).isDirectory()).toBe(true);
    await expect(access(join(projectDir, ".claude", "skills", "parallel-web-extract"))).rejects.toThrow();
  });
});
