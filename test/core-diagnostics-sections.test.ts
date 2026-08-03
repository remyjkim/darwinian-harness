// ABOUTME: Verifies structured diagnostics sections for store, cards, and write records.
// ABOUTME: Protects status/doctor refactors from losing cards-era operational state.

import { afterEach, expect, test } from "bun:test";
import { mkdir, chmod, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildDiagnosticsSections } from "../cli/core/diagnostics";
import { PROJECT_WORKER_MIN_DRWN_VERSION } from "../cli/core/card-lock";
import { saveWriteRecord } from "../cli/core/write-record";
import { cleanupTempRoots, scaffoldCliFixture, writeSupportedProjectConfig, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function seedScopedSkillPackage(
  agentsDir: string,
  packageName: string,
  skillName: string,
) {
  const packageRoot = join(agentsDir, "drwn", "skills", ...packageName.split("/"));
  const versionRoot = join(packageRoot, "1.0.0");
  const skillRoot = join(versionRoot, "skills", skillName);
  await mkdir(skillRoot, { recursive: true });
  await writeFile(join(packageRoot, "current"), "1.0.0\n");
  await writeFile(join(skillRoot, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);
  await writeFile(join(versionRoot, "bundle.json"), JSON.stringify({
    schemaVersion: 1,
    bundleName: packageName,
    version: "1.0.0",
    skills: [{ name: skillName, scope: "shared", path: `skills/${skillName}` }],
  }));
}

test("diagnostics sections compose cards, store, and write-record state", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeSupportedProjectConfig(projectDir, { workers: ["@me/backend@^1.0.0"], activeWorker: "@me/backend" });
  await writeTestCardLock(projectDir, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: join(fixture.agentsDir, "drwn", "cards", "@me", "backend", "1.0.0"),
      integrity: "sha256-test",
      treeSha: "d".repeat(40),
      manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha"] } },
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "store",
      git: { commit: "d".repeat(40) },
    },
  ]);
  saveWriteRecord(join(projectDir, ".agents", "drwn", "write-record.json"), {
    schema: "drwn.write-record",
    schemaVersion: 1,
    scope: "project",
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [{
      path: ".claude/skills/alpha",
      kind: "symlink",
      linkTarget: "alpha",
      surface: "skill",
      target: "claude",
    }],
  });

  const sections = await buildDiagnosticsSections(fixture.repoRoot, fixture.agentsDir, fixture.homeDir, configPath);

  expect(sections.store.path).toContain(".agents/drwn");
  expect(sections.cards.configuredRefs).toEqual(["@me/backend@^1.0.0"]);
  expect(sections.cards.lockedVersions).toEqual(["@me/backend@1.0.0"]);
  expect(sections.versionFloor.required).toBe(PROJECT_WORKER_MIN_DRWN_VERSION);
  expect(sections.versionFloor.satisfied).toBe(true);
  expect(sections.writeRecord.present).toBe(true);
  expect(sections.writeRecord.managedPathCount).toBe(1);
});

test("diagnostics count scoped Card, source, and package records instead of scope directories", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  for (const name of ["one", "two"]) {
    const cardRoot = join(fixture.agentsDir, "drwn", "cards", "@me", `${name}.git`);
    const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", name);
    await mkdir(cardRoot, { recursive: true });
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(join(cardRoot, "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(sourceRoot, "card.json"), "{}\n");
    await seedScopedSkillPackage(fixture.agentsDir, `@local/${name}`, `scoped-${name}`);
  }

  const sections = await buildDiagnosticsSections(fixture.repoRoot, fixture.agentsDir, fixture.homeDir);

  expect(sections.store.cardCount).toBe(2);
  expect(sections.store.legacySourceCount).toBe(2);
  expect(sections.store.skillBundleCount).toBe(2);
});
