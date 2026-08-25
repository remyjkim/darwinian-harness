// ABOUTME: Verifies Library skill discovery and selection-driven downstream sync.
// ABOUTME: Ensures ambient curated and target-only directories are never machine activation authority.

import { afterEach, describe, expect, test } from "bun:test";
import { access, lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeSyncPathOptions } from "../cli/core/paths";
import { createInstalledSkillBundle } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-core-skills-"));
  tempRoots.push(root);
  return root;
}

function machineSkillOptions(repoRoot: string, agentsDir: string, homeDir: string) {
  return {
    ...normalizeSyncPathOptions({ repoRoot, agentsDir, homeDir }, import.meta.path),
    writeScope: "machine" as const,
  };
}

async function createInstalledBundle(agentsDir: string, skillName = "hello-skill") {
  const packageRoot = join(agentsDir, "drwn", "skills", "@acme", "skills-sample", "1.0.0");
  const skillDir = join(packageRoot, "skills", "shared", skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: hello\n---\n`);
  await writeFile(join(packageRoot, "bundle.json"), JSON.stringify({
    schemaVersion: 1,
    bundleName: "@acme/skills-sample",
    version: "1.0.0",
    skills: [{ name: skillName, scope: "shared", path: `skills/shared/${skillName}` }],
  }));
  await writeFile(join(dirname(packageRoot), "current"), "1.0.0\n");
}

describe("core skills", () => {
  test("listSkillsByScope returns repo skills across all scopes", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "skills", "shared", "alpha"), { recursive: true });
    await mkdir(join(root, "skills", "experimental", "beta"), { recursive: true });
    await writeFile(join(root, "skills", "shared", "alpha", "SKILL.md"), "alpha\n");
    await writeFile(join(root, "skills", "experimental", "beta", "SKILL.md"), "beta\n");
    const { listSkillsByScope } = await import("../cli/core/skills");

    const result = await listSkillsByScope(root);

    expect(result.shared.map((skill) => skill.name)).toContain("alpha");
    expect(result.experimental.map((skill) => skill.name)).toContain("beta");
  });

  test("buildSkillInventory includes package-backed source metadata", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    await createInstalledBundle(agentsDir);
    const { buildSkillInventory } = await import("../cli/core/skills");

    const item = (await buildSkillInventory(root, agentsDir, homeDir)).find((skill) => skill.name === "hello-skill");

    expect(item).toMatchObject({ scope: "shared", sourceType: "npm", sourceId: "@acme/skills-sample", sourceVersion: "1.0.0" });
  });

  test("syncSkills materializes only explicitly included repo skills", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const alpha = join(root, "skills", "shared", "alpha");
    await mkdir(alpha, { recursive: true });
    await writeFile(join(alpha, "SKILL.md"), "repo-alpha\n");
    await mkdir(join(agentsDir, "skills", "beta"), { recursive: true });
    await writeFile(join(agentsDir, "skills", "beta", "SKILL.md"), "ambient-beta\n");
    const { syncSkills } = await import("../cli/core/skills");

    await syncSkills(machineSkillOptions(root, agentsDir, homeDir), { include: ["alpha"] });

    expect(await readFile(join(homeDir, ".claude", "skills", "alpha", "SKILL.md"), "utf8")).toBe("repo-alpha\n");
    await expect(access(join(homeDir, ".claude", "skills", "beta"))).rejects.toThrow();
  });

  test("syncSkills materializes an explicitly included package skill", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    await createInstalledSkillBundle(agentsDir, { skillName: "hello-skill" });
    const { syncSkills } = await import("../cli/core/skills");

    await syncSkills(machineSkillOptions(root, agentsDir, homeDir), { include: ["hello-skill"] });

    expect((await lstat(join(homeDir, ".claude", "skills", "hello-skill"))).isDirectory()).toBe(true);
    expect((await lstat(join(homeDir, ".codex", "skills", "hello-skill"))).isDirectory()).toBe(true);
  });

  test("exclude wins over include", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared", "alpha"), { recursive: true });
    await writeFile(join(root, "skills", "shared", "alpha", "SKILL.md"), "alpha\n");
    const { syncSkills } = await import("../cli/core/skills");

    const result = await syncSkills(machineSkillOptions(root, agentsDir, homeDir), {
      include: ["alpha"],
      exclude: ["alpha"],
    });

    expect(result.changes.some((change) => change.includes("alpha"))).toBe(false);
  });

  test("missing explicit includes fail before mutation", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    const { syncSkills } = await import("../cli/core/skills");

    await expect(syncSkills(machineSkillOptions(root, agentsDir, homeDir), { include: ["missing"] }))
      .rejects.toThrow("missing");
    await expect(access(join(homeDir, ".claude", "skills"))).rejects.toThrow();
  });

  test("target-only repo directories do not activate without explicit selection", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "claude-only", "target-skill"), { recursive: true });
    await writeFile(join(root, "skills", "claude-only", "target-skill", "SKILL.md"), "target\n");
    const { syncSkills } = await import("../cli/core/skills");

    await syncSkills(machineSkillOptions(root, agentsDir, homeDir));

    await expect(access(join(homeDir, ".claude", "skills", "target-skill"))).rejects.toThrow();
  });

  test("one read-only skill planner resolves target-specific capability bytes before materialization", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const alpha = join(root, "skills", "shared", "alpha");
    await mkdir(alpha, { recursive: true });
    await writeFile(join(alpha, "SKILL.md"), "repo-alpha\n");
    const skills = await import("../cli/core/skills") as typeof import("../cli/core/skills") & {
      planSkillCapabilities?: (...args: any[]) => Promise<{
        capabilities: Array<{ id: string; sourcePath: string; contentHash: string; targets: string[] }>;
        warnings: string[];
      }>;
    };
    expect(typeof skills.planSkillCapabilities).toBe("function");

    const plan = await skills.planSkillCapabilities!(
      { ...machineSkillOptions(root, agentsDir, homeDir), target: "codex" },
      { include: ["alpha"] },
    );

    expect(plan.warnings).toEqual([]);
    expect(plan.capabilities).toHaveLength(1);
    expect(plan.capabilities[0]).toMatchObject({
      id: "alpha",
      sourcePath: alpha,
      contentHash: expect.stringMatching(/^sha256-[a-f0-9]{64}$/),
      targets: ["codex"],
    });
    await expect(access(join(homeDir, ".codex", "skills", "alpha"))).rejects.toThrow();
  });
});
