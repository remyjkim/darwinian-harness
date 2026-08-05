// ABOUTME: Pins the CURSOR_TARGET_DEPRECATED advisory in doctor output for cursor-enabled projects.
// ABOUTME: Advisory severity only — doctor exit codes are unchanged by the deprecation signal.

import { afterEach, describe, expect, test } from "bun:test";
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

interface DeprecationReport {
  targetDeprecations: Array<{
    code: string;
    severity: string;
    target: string;
    message: string;
  }>;
}

async function projectFixture(overrides: Record<string, unknown> = {}) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/skilled", skills: ["alpha"] });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled", overrides);
  return { fixture, projectRoot };
}

describe("cursor target deprecation advisory", () => {
  test("doctor reports the advisory when the cursor target is enabled", async () => {
    const { fixture, projectRoot } = await projectFixture();

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as DeprecationReport;
    expect(report.targetDeprecations).toEqual([
      {
        code: "CURSOR_TARGET_DEPRECATED",
        severity: "advisory",
        target: "cursor",
        message:
          "cursor support is deprecated (owner decision 2026-08-05, tracked as I213): it was never live-verified and will be removed in a later release",
      },
    ]);

    const human = await runAgentsCli(["doctor"], envFor(fixture), projectRoot);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain(
      "CURSOR_TARGET_DEPRECATED (advisory): cursor support is deprecated (owner decision 2026-08-05, tracked as I213)",
    );
  });

  test("a project that disables the cursor target gets no advisory", async () => {
    const { fixture, projectRoot } = await projectFixture({ targets: { cursor: { enabled: false } } });

    const json = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
    expect(json.exitCode, json.stderr).toBe(0);
    const report = JSON.parse(json.stdout) as DeprecationReport;
    expect(report.targetDeprecations).toEqual([]);

    const human = await runAgentsCli(["doctor"], envFor(fixture), projectRoot);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).not.toContain("CURSOR_TARGET_DEPRECATED");
  });

  test("status --json carries the advisory alongside doctor", async () => {
    const { fixture, projectRoot } = await projectFixture();

    const status = await runAgentsCli(["status", "--json"], envFor(fixture), projectRoot);
    expect(status.exitCode, status.stderr).toBe(0);
    const report = JSON.parse(status.stdout) as DeprecationReport;
    expect(report.targetDeprecations).toContainEqual(
      expect.objectContaining({ code: "CURSOR_TARGET_DEPRECATED", severity: "advisory", target: "cursor" }),
    );
  });
});
