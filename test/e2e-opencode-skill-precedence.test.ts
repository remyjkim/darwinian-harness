// ABOUTME: Live acceptance for the OpenCode skill-shadowing fix against the real binary.
// ABOUTME: Measures skill dedup over repeated probes: project bytes must win recurringly.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const opencodeBin = Bun.which("opencode");
const machineCollision = existsSync(join(homedir(), ".agents", "skills", "writing-plans"));

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

interface ResolvedSkill {
  name: string;
  description: string;
  location: string;
  content: string;
}

const fixtureDir = join(import.meta.dir, "fixtures", "opencode-skill-precedence");

// Projects a card carrying the sentinel writing-plans skill through the real CLI, so the
// probe runs against the exact opencode.json skills.paths entry the CLI writes.
async function projectedSentinelProject() {
  const claudeSentinel = await readFile(join(fixtureDir, "fixture-project-claude-skill.md"), "utf8");
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/precedence",
    skills: ["writing-plans"],
    skillContent: { "writing-plans": claudeSentinel },
  });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/precedence@1.0.0"], "@me/precedence");
  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
  expect(write.exitCode, write.stderr).toBe(0);

  const declaredDir = join(projectRoot, ".agents", "drwn", "opencode-skills");
  expect(existsSync(join(declaredDir, "writing-plans", "SKILL.md"))).toBe(true);
  expect(existsSync(join(projectRoot, ".claude", "skills", "writing-plans", "SKILL.md"))).toBe(true);
  const opencodeConfig = JSON.parse(await readFile(join(projectRoot, "opencode.json"), "utf8"));
  expect(opencodeConfig.skills.paths).toContain(".agents/drwn/opencode-skills");
  return { projectRoot };
}

// The probe cwd is realpath'd as a harmless normalization. (A literal /var tmpdir cwd was
// once suspected of disabling the declaration; that claim did not reproduce under
// repeated measurement on either side of the G3 gate.)
async function resolveWritingPlans(projectRoot: string) {
  const realProjectRoot = realpathSync(projectRoot);
  const proc = Bun.spawn([opencodeBin!, "debug", "skill"], {
    cwd: realProjectRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  expect(await proc.exited, stderr).toBe(0);
  const resolved = JSON.parse(stdout) as ResolvedSkill[];
  const winners = resolved.filter((skill) => skill.name === "writing-plans");
  expect(winners).toHaveLength(1);
  return { winner: winners[0]!, realProjectRoot };
}

// OpenCode 1.18.4 dedups same-named skills nondeterministically. G3 gate measurement over
// 90 probes on an identical CLI-written layout resolved the machine-store copy 21 times
// (23.3% pooled; 17-30% per 30-probe run; the declared dir itself won only 20/90 — the
// declaration's observed effect is shifting the dedup toward the project copies as a
// group, not making one path deterministic). The acceptance bar is therefore a measured
// rate: across PROBE_COUNT resolutions the project must win at least MIN_PROJECT_WINS.
// The threshold keeps the suite stable at the measured rates (binomial flake below 0.2%
// even at the worst observed 70% project-win rate) while the pre-fix state — where the
// machine copy won every recorded observation — still fails by the full margin.
const PROBE_COUNT = 10;
const MIN_PROJECT_WINS = 3;

async function measureProjectWins(projectRoot: string) {
  const projectWinners: ResolvedSkill[] = [];
  const machineLocations: string[] = [];
  for (let probe = 0; probe < PROBE_COUNT; probe += 1) {
    const { winner, realProjectRoot } = await resolveWritingPlans(projectRoot);
    if (realpathSync(winner.location).startsWith(realProjectRoot)) {
      projectWinners.push(winner);
    } else {
      machineLocations.push(winner.location);
    }
  }
  return { projectWinners, machineLocations };
}

describe("opencode skill precedence acceptance", () => {
  // Runs the real `opencode debug skill` probe from experiment 05 against the real user
  // home, so the machine-store collision (~/.agents/skills/writing-plans) is live. Skipped
  // when the binary or the colliding machine skill is absent.
  test.skipIf(!opencodeBin || !machineCollision)(
    "the project sentinel wins the dedup at the measured steady-state rate",
    async () => {
      const { projectRoot } = await projectedSentinelProject();
      const { projectWinners, machineLocations } = await measureProjectWins(projectRoot);
      expect(
        projectWinners.length,
        `project wins ${projectWinners.length}/${PROBE_COUNT}; machine winners: ${machineLocations.join(", ")}`,
      ).toBeGreaterThanOrEqual(MIN_PROJECT_WINS);
      for (const winner of projectWinners) {
        expect(winner.content).toContain("LILAC-2201");
      }
    },
    240000,
  );

  test.skipIf(!opencodeBin || !machineCollision)(
    "a user-authored .opencode/skills copy does not hand the dedup back to the machine store",
    async () => {
      const { projectRoot } = await projectedSentinelProject();
      const opencodeSentinel = await readFile(join(fixtureDir, "fixture-project-opencode-skill.md"), "utf8");
      const opencodeSurfaceCopy = join(projectRoot, ".opencode", "skills", "writing-plans");
      await mkdir(opencodeSurfaceCopy, { recursive: true });
      await writeFile(join(opencodeSurfaceCopy, "SKILL.md"), opencodeSentinel);

      // OpenCode also picks nondeterministically among same-named project copies, so the
      // pinned claim is scope-level: project-resident winners at the measured rate.
      const { projectWinners, machineLocations } = await measureProjectWins(projectRoot);
      expect(
        projectWinners.length,
        `project wins ${projectWinners.length}/${PROBE_COUNT}; machine winners: ${machineLocations.join(", ")}`,
      ).toBeGreaterThanOrEqual(MIN_PROJECT_WINS);
    },
    240000,
  );
});
