// ABOUTME: Verifies stable project instruction-delivery diagnostics for current and drifted projections.
// ABOUTME: Keeps AGENTS.md and Claude adapter health evidence aligned for status and doctor consumers.

import { afterEach, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildProjectStatusV1 } from "../cli/core/diagnostics";
import {
  cleanupTempRoots,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function projectedInstructionFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect(
    (
      await runAgentsCli(
        ["card", "new", "@me/diagnostic", "--no-git"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        [
          "card",
          "source",
          "set",
          "@me/diagnostic",
          "--instructions-text",
          "Diagnose instruction delivery.",
        ],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "publish", "@me/diagnostic"],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);
  const manifest = JSON.parse(
    await readFile(
      join(
        fixture.agentsDir,
        "drwn",
        "sources",
        "@me",
        "diagnostic",
        "card.json",
      ),
      "utf8",
    ),
  );
  const projectRoot = join(fixture.root, "project");
  const projectConfigPath = await writeSupportedProjectConfig(projectRoot);
  expect(
    (
      await runAgentsCli(
        ["add", `@me/diagnostic@${manifest.version}`],
        envFor(fixture),
        projectRoot,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "trust", "@me/diagnostic", "--instructions"],
        envFor(fixture),
        projectRoot,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (await runAgentsCli(["write"], envFor(fixture), projectRoot)).exitCode,
  ).toBe(0);
  return { fixture, projectRoot, projectConfigPath };
}

async function statusFor(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  projectConfigPath: string,
) {
  return buildProjectStatusV1({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    projectConfigPath,
  });
}

test("reports a current owned instruction block and adapter", async () => {
  const { fixture, projectConfigPath } =
    await projectedInstructionFixture();
  const report = await statusFor(fixture, projectConfigPath);

  expect(report?.instructionDelivery).toMatchObject({
    state: "current",
    adapter: "owned",
    issues: [],
  });
  expect(report?.instructionDelivery.contentDigest).toMatch(
    /^sha256-[a-f0-9]{64}$/,
  );
  expect(report?.instructionDelivery.ownershipHash).toMatch(
    /^sha256-[a-f0-9]{64}$/,
  );
});

test("reports block tamper as ownership/content drift", async () => {
  const { fixture, projectRoot, projectConfigPath } =
    await projectedInstructionFixture();
  const agentsPath = join(projectRoot, "AGENTS.md");
  await writeFile(
    agentsPath,
    (await readFile(agentsPath, "utf8")).replace(
      "Diagnose instruction delivery.",
      "Tampered instructions.",
    ),
  );

  const report = await statusFor(fixture, projectConfigPath);
  expect(report?.instructionDelivery.state).toBe("drifted");
  expect(report?.instructionDelivery.issues).toEqual(
    expect.arrayContaining([
      { code: "INSTRUCTIONS_OWNERSHIP_DRIFT", severity: "error" },
    ]),
  );
});

test("reports malformed Claude adapter markers as adapter drift", async () => {
  const { fixture, projectRoot, projectConfigPath } =
    await projectedInstructionFixture();
  await writeFile(
    join(projectRoot, ".claude", "CLAUDE.md"),
    "<!-- drwn:claude-adapter:start -->\n@../AGENTS.md\n",
  );

  const report = await statusFor(fixture, projectConfigPath);
  expect(report?.instructionDelivery.adapter).toBe("drifted");
  expect(report?.instructionDelivery.issues).toContainEqual({
    code: "CLAUDE_ADAPTER_DRIFT",
    severity: "warning",
  });
});
