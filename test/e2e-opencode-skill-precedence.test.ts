// ABOUTME: Live acceptance for the OpenCode skill-shadowing fix against the real binary.
// ABOUTME: Rebuilds the experiment-05 probes: the project's composed copy must win skill dedup.

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

// OpenCode resolves project-relative skills.paths against the literal cwd, so the probe
// must run from the realpath (macOS tmpdirs are reached through /var -> /private/var).
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

// OpenCode 1.18.4 races its skill-source scan: on an identical layout the machine-store
// copy still wins roughly one probe in ten, every other run resolves the project copy.
// The pinned claim is therefore steady-state — a project win within bounded attempts.
// Experiment 05's pre-fix probes resolved the machine copy on every observation.
async function resolveWithRetry(
  projectRoot: string,
  isProjectWin: (winner: ResolvedSkill, realProjectRoot: string) => boolean,
  attempts = 3,
) {
  let last: { winner: ResolvedSkill; realProjectRoot: string } | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await resolveWritingPlans(projectRoot);
    if (isProjectWin(last.winner, last.realProjectRoot)) {
      return last;
    }
  }
  return last!;
}

function winnerInProject(winner: ResolvedSkill, realProjectRoot: string) {
  return realpathSync(winner.location).startsWith(realProjectRoot);
}

describe("opencode skill precedence acceptance", () => {
  // Runs the real `opencode debug skill` probe from experiment 05 against the real user
  // home, so the machine-store collision (~/.agents/skills/writing-plans) is live. Skipped
  // when the binary or the colliding machine skill is absent.
  test.skipIf(!opencodeBin || !machineCollision)(
    "the project sentinel is the resolved winner after a real CLI write",
    async () => {
      const { projectRoot } = await projectedSentinelProject();
      const { winner, realProjectRoot } = await resolveWithRetry(projectRoot, winnerInProject);
      expect(realpathSync(winner.location).startsWith(realProjectRoot)).toBe(true);
      expect(winner.description).toContain("LILAC-2201");
      expect(winner.content).toContain("LILAC-2201");
    },
    240000,
  );

  test.skipIf(!opencodeBin || !machineCollision)(
    "a user-authored .opencode/skills copy still keeps the machine store from winning",
    async () => {
      const { projectRoot } = await projectedSentinelProject();
      const opencodeSentinel = await readFile(join(fixtureDir, "fixture-project-opencode-skill.md"), "utf8");
      const opencodeSurfaceCopy = join(projectRoot, ".opencode", "skills", "writing-plans");
      await mkdir(opencodeSurfaceCopy, { recursive: true });
      await writeFile(join(opencodeSurfaceCopy, "SKILL.md"), opencodeSentinel);

      // OpenCode also picks nondeterministically among same-named project copies, so the
      // pinned claim is scope-level: the winner lives in the project, not the machine home.
      const { winner, realProjectRoot } = await resolveWithRetry(projectRoot, winnerInProject);
      expect(realpathSync(winner.location).startsWith(realProjectRoot)).toBe(true);
    },
    240000,
  );
});
