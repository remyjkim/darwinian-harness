// ABOUTME: Proves Operator behaves as a normal Card in an immutable machine Worker closure.
// ABOUTME: Uses an isolated Store and home so machine projection never touches developer state.

import { afterEach, expect, test } from "bun:test";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveMachineCapabilities } from "../cli/core/defaults";
import {
  DARWINIAN_OPERATOR_SKILL_IDS,
} from "../cli/core/operator-card-contract";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { applyMachineWorkerRoots } from "../cli/core/worker-machine";
import {
  cleanupTempRoots,
  envFor,
  publishMachineBlueprint,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("Operator resolves offline as a normal Worker member and projects exactly eight non-Mind skills", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const workerRef = await publishMachineBlueprint(fixture, {
    rootName: "@curation-labs/machine-defaults",
    memberName: "@darwinian/operator",
    skills: [...DARWINIAN_OPERATOR_SKILL_IDS],
  });
  await applyMachineWorkerRoots(fixture.agentsDir, [workerRef]);
  await rm(resolveCardBareRepoPath(fixture.agentsDir, "@darwinian/operator"), { recursive: true, force: true });

  const capabilities = await resolveMachineCapabilities({ repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir });
  expect(capabilities.skills.map((skill) => skill.id)).toEqual([...DARWINIAN_OPERATOR_SKILL_IDS]);
  expect(capabilities.skills.every((skill) => skill.source === "worker" && skill.cardName === "@darwinian/operator")).toBe(true);
  expect(capabilities.mcpServers).toEqual([]);
  expect(capabilities.skills.some((skill) => /mind/i.test(skill.id))).toBe(false);

  const write = await runAgentsCli(
    ["write", "--root", "--skills-only", "--target", "claude"],
    envFor(fixture),
  );
  expect(write.exitCode).toBe(0);
  expect((await readdir(join(fixture.homeDir, ".claude", "skills"))).sort())
    .toEqual([...DARWINIAN_OPERATOR_SKILL_IDS].sort());
});
