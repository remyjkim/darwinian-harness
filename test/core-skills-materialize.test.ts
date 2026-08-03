// ABOUTME: Clean-slate rejection and drift coverage for copy-based machine skill materialization.
// ABOUTME: Pre-contract symlink state is never claimed; hand-edited owned copies trip drift protection.

import { afterEach, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, installMachineBlueprint, scaffoldCliFixture } from "./helpers";
import { syncRepository } from "../cli/core/sync";
import { loadWriteRecord } from "../cli/core/write-record";
import { resolveGlobalWriteRecordPath } from "../cli/core/store-paths";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function machineSyncOptions(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, extra: Record<string, unknown> = {}) {
  return {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    skillsOnly: true,
    ...extra,
  };
}

async function selectAlphaForMachine(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await installMachineBlueprint(fixture, { skills: ["alpha"] });
}

test("rejects a pre-contract symlink projection without claiming or replacing it", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  await selectAlphaForMachine(fixture);
  const claudeAlpha = join(fixture.homeDir, ".claude", "skills", "alpha");
  const curatedAlpha = join(fixture.agentsDir, "skills", "alpha");

  // Simulate a pre-upgrade install: a downstream dir symlink plus a symlink-kind write-record.
  mkdirSync(join(fixture.homeDir, ".claude", "skills"), { recursive: true });
  symlinkSync(curatedAlpha, claudeAlpha, "dir");
  const recordPath = resolveGlobalWriteRecordPath(fixture.agentsDir);
  writeFileSync(recordPath, `${JSON.stringify({
    writeRecordVersion: 1,
    lastWriteAt: "2026-01-01T00:00:00.000Z",
    lastWriteHarnessVersion: "0.0.0",
    managedPaths: [{ path: ".claude/skills/alpha", kind: "symlink", target: curatedAlpha }],
  }, null, 2)}\n`);

  await expect(syncRepository(machineSyncOptions(fixture))).rejects.toMatchObject({
    code: "WRITE_RECORD_INVALID",
  });
  expect(lstatSync(claudeAlpha).isSymbolicLink()).toBe(true);
  expect(readFileSync(join(claudeAlpha, "SKILL.md"), "utf8")).toContain("alpha");
  expect(() => loadWriteRecord(recordPath, "machine")).toThrow("Unsupported write record");
});

test("refuses to overwrite a hand-edited copied skill without --force, succeeds with it", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  await selectAlphaForMachine(fixture);
  const claudeAlpha = join(fixture.homeDir, ".claude", "skills", "alpha");

  await syncRepository(machineSyncOptions(fixture));
  chmodSync(join(claudeAlpha, "SKILL.md"), 0o644);
  writeFileSync(join(claudeAlpha, "SKILL.md"), "hand edited\n");

  await expect(syncRepository(machineSyncOptions(fixture))).rejects.toThrow(/drift/i);

  await syncRepository(machineSyncOptions(fixture, { force: true }));
  expect(readFileSync(join(claudeAlpha, "SKILL.md"), "utf8")).toContain("alpha");
});
