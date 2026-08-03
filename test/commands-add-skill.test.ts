// ABOUTME: Verifies project-first skill activation through `drwn add skill`.
// ABOUTME: Protects local library lookup and project config mutation behavior.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  createExecutable,
  createInstalledSkillBundle,
  createSkillBundleFixture,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, extra?: Record<string, string>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
    ...extra,
  };
}

describe("drwn add skill", () => {
  test("an active Card skill remains authoritative over a same-ID project include", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const cardSkill = "---\nname: alpha\ndescription: authoritative Card bytes\n---\n";
    const cardSkillPath = join(fixture.root, "card-alpha", "SKILL.md");
    await mkdir(join(fixture.root, "card-alpha"), { recursive: true });
    await writeFile(cardSkillPath, cardSkill);
    await createCatalogCardSource(fixture, "@me/operator");
    expect((await runAgentsCli([
      "card", "source", "add-skill", "@me/operator", "alpha", "--from", cardSkillPath,
    ], envFor(fixture))).exitCode).toBe(0);
    expect((await runAgentsCli(["card", "publish", "@me/operator"], envFor(fixture))).exitCode).toBe(0);
    const projectDir = join(fixture.root, "project");
    await writeSupportedProjectConfig(projectDir);
    expect((await runAgentsCli(["add", "@me/operator@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
    expect((await runAgentsCli(["add", "skill", "alpha"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const written = await runAgentsCli(["write", "--skills-only"], envFor(fixture), projectDir);

    expect(written.exitCode).toBe(0);
    expect(await readFile(join(projectDir, ".claude", "skills", "alpha", "SKILL.md"), "utf8")).toBe(cardSkill);
    expect(await readFile(join(projectDir, ".codex", "skills", "alpha", "SKILL.md"), "utf8")).toBe(cardSkill);
  });

  test("adds a repo-native skill to project config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "skill", "alpha"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added alpha");
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      skills?: { include?: string[] };
    };
    expect(config.skills?.include).toEqual(["alpha"]);
  });

  test("does not duplicate project skill includes", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    await runAgentsCli(["add", "skill", "alpha"], envFor(fixture), projectDir);
    await runAgentsCli(["add", "skill", "alpha"], envFor(fixture), projectDir);

    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      skills?: { include?: string[] };
    };
    expect(config.skills?.include).toEqual(["alpha"]);
  });

  test("adds a package-backed skill to project config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "hello-skill" });
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "skill", "hello-skill"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      skills?: { include?: string[] };
    };
    expect(config.skills?.include).toEqual(["hello-skill"]);
  });

  test("adds a loose skill after importing it into the local library", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const looseDir = join(fixture.root, "loose-activate");
    await mkdir(looseDir, { recursive: true });
    await writeFile(join(looseDir, "SKILL.md"), "---\nname: loose-activate\ndescription: fixture\n---\n");
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const imported = await runAgentsCli(["machine", "skill", "install", join(looseDir, "SKILL.md")], envFor(fixture), fixture.root);
    const result = await runAgentsCli(["add", "skill", "loose-activate"], envFor(fixture), projectDir);

    expect(imported.exitCode).toBe(0);
    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      skills?: { include?: string[] };
    };
    expect(config.skills?.include).toEqual(["loose-activate"]);
  });

  test("dry-run json does not write project config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "skill", "alpha", "--dry-run", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { kind: string; id: string };
    expect(parsed.kind).toBe("skill");
    expect(parsed.id).toBe("alpha");
    expect(existsSync(join(projectDir, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("library-only missing skill fails without writing config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "skill", "missing", "--library"], envFor(fixture), projectDir);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("No local skill found");
    expect(existsSync(join(projectDir, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("argumentless add skill fails clearly in non-TTY mode", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["add", "skill"], envFor(fixture), fixture.root);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Guided add requires a TTY");
  });

  test("installs a catalog skill bundle before adding the selected skill", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createSkillBundleFixture(fixture.root, { skillName: "hello-skill" });
    const binDir = join(fixture.root, "bin");
    const realNpm = Bun.which("npm") ?? "npm";
    await createExecutable(binDir, "npm", `if [ "$1" = "search" ]; then printf "%s" '[{"name":"${bundleRoot}","version":"1.0.0"}]'; else "${realNpm}" "$@"; fi`);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["add", "skill", "hello", "--yes"], envFor(fixture, { PATH: `${binDir}:${process.env.PATH ?? ""}` }), projectDir);

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as {
      skills?: { include?: string[] };
    };
    expect(config.skills?.include).toEqual(["hello-skill"]);
  });

  test("keeps a committed catalog bundle inactive when the project write fails", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot, packageName } = await createSkillBundleFixture(fixture.root, { skillName: "hello-skill" });
    const binDir = join(fixture.root, "bin");
    const realNpm = Bun.which("npm") ?? "npm";
    await createExecutable(binDir, "npm", `if [ "$1" = "search" ]; then printf "%s" '[{"name":"${bundleRoot}","version":"1.0.0"}]'; else "${realNpm}" "$@"; fi`);
    const projectDir = join(fixture.root, "invalid-project");
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
    await writeFile(configPath, '{"version":1}\n');

    const result = await runAgentsCli(
      ["add", "skill", "hello", "--yes"],
      envFor(fixture, { PATH: `${binDir}:${process.env.PATH ?? ""}` }),
      projectDir,
    );

    expect(result.exitCode).not.toBe(0);
    const { findStandaloneSkillPackageByName } = await import("../cli/core/inventory");
    expect(await findStandaloneSkillPackageByName(fixture.agentsDir, packageName)).not.toBeNull();
    expect(await readFile(configPath, "utf8")).toBe('{"version":1}\n');
  });
});
