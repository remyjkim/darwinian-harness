// ABOUTME: Pins the OPENCODE_SKILL_SHADOWED cross-scope diagnostic in doctor output.
// ABOUTME: Warning without the managed skills.paths declaration, advisory when it is current.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

interface ShadowingReport {
  ambientCapabilities: {
    opencodeSkillShadowing: Array<{
      code: string;
      severity: string;
      skill: string;
      machinePaths: string[];
      declared: boolean;
    }>;
  };
}

async function shadowedProject() {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/skilled", skills: ["alpha"] });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled");
  return { fixture, projectRoot };
}

describe("opencode skill shadowing diagnostic", () => {
  test("warns when a projected skill collides with a machine copy and no declaration exists", async () => {
    const { fixture, projectRoot } = await shadowedProject();

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toContainEqual({
      code: "OPENCODE_SKILL_SHADOWED",
      severity: "warning",
      skill: "alpha",
      machinePaths: [join(fixture.agentsDir, "skills", "alpha")],
      declared: false,
    });

    const human = await runAgentsCli(["doctor"], envFor(fixture), projectRoot);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("OPENCODE_SKILL_SHADOWED (warning): alpha");
  });

  test("a current managed declaration downgrades the shadowing to advisory", async () => {
    const { fixture, projectRoot } = await shadowedProject();
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toContainEqual(expect.objectContaining({
      code: "OPENCODE_SKILL_SHADOWED",
      severity: "advisory",
      skill: "alpha",
      declared: true,
    }));
  });

  test("collisions in the user Claude skills dir are detected", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const homeClaudeSkill = join(fixture.homeDir, ".claude", "skills", "alpha");
    await mkdir(homeClaudeSkill, { recursive: true });
    await writeFile(join(homeClaudeSkill, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await publishCardWithSkills(fixture, { name: "@me/skilled", skills: ["alpha"] });
    const projectRoot = join(fixture.root, "project");
    await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled");

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toContainEqual(expect.objectContaining({
      skill: "alpha",
      severity: "warning",
      machinePaths: [homeClaudeSkill],
    }));
  });

  test("a jsonc-skipped declaration keeps the warning after a write", async () => {
    const { fixture, projectRoot } = await shadowedProject();
    await writeFile(join(projectRoot, "opencode.jsonc"), "{\n}\n");
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toContainEqual(expect.objectContaining({
      skill: "alpha",
      severity: "warning",
      declared: false,
    }));
  });

  test("a manual declaration in opencode.jsonc downgrades the warning to advisory", async () => {
    const { fixture, projectRoot } = await shadowedProject();
    await writeFile(
      join(projectRoot, "opencode.jsonc"),
      [
        "{",
        "  // user-managed config",
        "  /* drwn cannot write this file */",
        '  "skills": {',
        '    "paths": [',
        '      ".agents/drwn/opencode-skills", // drwn projected dir',
        "    ],",
        "  },",
        "}",
        "",
      ].join("\n"),
    );
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toContainEqual(expect.objectContaining({
      skill: "alpha",
      severity: "advisory",
      declared: true,
    }));
  });

  test("codex-only skills outside the opencode projection produce no issues", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const codexOnlySkill = join(fixture.repoRoot, "skills", "codex-only", "gamma");
    await mkdir(codexOnlySkill, { recursive: true });
    await writeFile(join(codexOnlySkill, "SKILL.md"), "---\nname: gamma\ndescription: gamma\n---\n");
    const machineCopy = join(fixture.agentsDir, "skills", "gamma");
    await mkdir(machineCopy, { recursive: true });
    await writeFile(join(machineCopy, "SKILL.md"), "---\nname: gamma\ndescription: gamma\n---\n");
    await publishCardWithSkills(fixture, { name: "@me/skilled", skills: ["alpha"] });
    const projectRoot = join(fixture.root, "project");
    await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled", {
      skills: { include: ["gamma"] },
    });

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toEqual([]);
  });

  test("no machine collision produces no shadowing issues", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/skilled", skills: ["alpha"] });
    const projectRoot = join(fixture.root, "project");
    await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled");

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as ShadowingReport;
    expect(report.ambientCapabilities.opencodeSkillShadowing).toEqual([]);
  });
});
