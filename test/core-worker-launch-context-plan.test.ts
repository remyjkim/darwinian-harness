// ABOUTME: Verifies the target-neutral additive Worker launch plan from effective installed roots.
// ABOUTME: Freezes shared capability subtraction, optional MCP, consent, and no-write context identity.

import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardLockEntry, WorkerRootLockEntry } from "../cli/core/card-lock";
import { buildEffectiveState } from "../cli/core/effective-state";
import { resolveExplicitInstructionContribution } from "../cli/core/instruction-contribution";

const roots: string[] = [];
const hash = (char: string) => `sha256-${char.repeat(64)}`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-plan-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const sources = join(root, "cards");
  const makeCard = async (input: {
    name: string;
    char: string;
    kind?: "card" | "blueprint";
    members?: string[];
    skill?: string;
    mcp?: { id: string; optional: boolean };
    hook?: string;
    instructions?: string;
  }): Promise<CardLockEntry> => {
    const path = join(sources, input.name.split("/").at(-1)!);
    await mkdir(path, { recursive: true });
    if (input.skill) {
      await mkdir(join(path, "skills", input.skill), { recursive: true });
      await writeFile(join(path, "skills", input.skill, "SKILL.md"), `---\nname: ${input.skill}\ndescription: fixture\n---\n`);
    }
    if (input.hook) {
      await mkdir(join(path, "hooks", input.hook), { recursive: true });
      await writeFile(join(path, "hooks", input.hook, "policy.ts"), "export default {}\n");
    }
    const card: CardLockEntry = {
      name: input.name,
      requested: `${input.name}@1.0.0`,
      version: "1.0.0",
      path,
      integrity: hash(input.char),
      manifest: {
        name: input.name,
        version: "1.0.0",
        ...(input.kind === "blueprint" ? { kind: "blueprint" as const, composedFrom: input.members ?? [] } : {}),
        ...(input.skill ? { skills: { include: [input.skill] } } : {}),
        ...(input.mcp ? { servers: { [input.mcp.id]: { description: input.mcp.id, transport: "stdio" as const, command: input.mcp.id, optional: input.mcp.optional } } } : {}),
        ...(input.instructions ? { instructions: { text: input.instructions } } : {}),
      },
      skills: input.skill ? [input.skill] : [],
      hooks: input.hook ? [input.hook] : [],
      ...(input.hook ? { hookConsent: { consentedAt: "2026-08-24T00:00:00.000Z", consentedRange: "^1.0.0" } } : {}),
      registry: null,
      origin: "file",
    };
    if (input.instructions) {
      const contribution = resolveExplicitInstructionContribution(card, path)!;
      card.instructionConsent = {
        consentedAt: "2026-08-24T00:00:00.000Z",
        consentedRange: "^1.0.0",
        contentDigest: contribution.contentDigest,
      };
    }
    return card;
  };

  const shared = await makeCard({ name: "@test/shared", char: "a", skill: "shared-skill", mcp: { id: "shared_mcp", optional: false } });
  const baseOnly = await makeCard({ name: "@test/base-only", char: "b", skill: "base-skill" });
  const reviewOnly = await makeCard({
    name: "@test/review-only",
    char: "c",
    skill: "review-skill",
    mcp: { id: "review_mcp", optional: true },
    hook: "guard",
    instructions: "REVIEW_INSTRUCTION",
  });
  const base = await makeCard({ name: "@test/base", char: "d", kind: "blueprint", members: [shared.requested, baseOnly.requested] });
  const reviewer = await makeCard({ name: "@test/reviewer", char: "e", kind: "blueprint", members: [shared.requested, reviewOnly.requested] });
  const workerRoots: WorkerRootLockEntry[] = [
    { name: base.name, requested: base.requested, kind: "blueprint", members: [shared.name, baseOnly.name] },
    { name: reviewer.name, requested: reviewer.requested, kind: "blueprint", members: [shared.name, reviewOnly.name] },
  ];
  const stateDir = join(projectRoot, ".agents", "drwn");
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, "config.json"), `${JSON.stringify({
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [base.requested, reviewer.requested],
    activeWorker: base.name,
  }, null, 2)}\n`);
  await writeFile(join(stateDir, "card.lock"), `${JSON.stringify({
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: "0.8.0" },
    workerRoots,
    cards: [base, shared, baseOnly, reviewer, reviewOnly],
  }, null, 2)}\n`);
  const state = await buildEffectiveState({ repoRoot: process.cwd(), agentsDir, homeDir, cwd: projectRoot });
  return { projectRoot, state, base, reviewer };
}

test("launch plan subtracts shared/base capability and includes only assigned optional/consented additions", async () => {
  const input = await fixture();
  const planner = await import("../cli/core/worker-launch-context/plan").catch(() => ({} as any));
  expect(typeof planner.planWorkerLaunchContext).toBe("function");
  const stableInput = {
    state: input.state,
    projection: { current: true, issues: [], recordPresent: true, result: null },
    snapshot: {
      projectRoot: input.projectRoot,
      sourceProjectConfigDigest: hash("1"),
      sourceProjectLockDigest: hash("2"),
      inputDigest: hash("3"),
    },
  };

  const result = await planner.planWorkerLaunchContext({
    stableInput,
    assignedRoot: input.reviewer.name,
    target: "codex",
    enabledOptionalMcp: ["review_mcp"],
    strict: true,
  });

  expect(result.plan.schema).toBe("drwn.worker-launch-plan");
  expect(result.plan.baseRoot.name).toBe(input.base.name);
  expect(result.plan.assignedRoot.name).toBe(input.reviewer.name);
  expect(result.plan.deltaClosure.map((card: { name: string }) => card.name)).toEqual([input.reviewer.name, "@test/review-only"]);
  expect(result.plan.capabilities.skills.map((entry: { id: string }) => entry.id)).toEqual(["review-skill"]);
  expect(result.plan.capabilities.mcpServers.map((entry: { id: string }) => entry.id)).toEqual(["review_mcp"]);
  expect(result.plan.capabilities.hooks.map((entry: { id: string }) => entry.id)).toEqual(["@test/review-only:guard"]);
  expect(result.plan.capabilities.instructions.present).toBe(true);
  expect(result.plan.optionalMcp.enabled).toEqual(["review_mcp"]);
  expect(result.plan.plannedContextId).toMatch(/^sha256-[a-f0-9]{64}$/);
  expect(result.materialization.skills.map((entry: { id: string }) => entry.id)).toEqual(["review-skill"]);
  expect(new TextDecoder().decode(result.materialization.instructionBytes)).toBe("REVIEW_INSTRUCTION\n");
});

test("launch plan rejects a stale active base before computing target additions", async () => {
  const input = await fixture();
  const planner = await import("../cli/core/worker-launch-context/plan") as any;
  await expect(planner.planWorkerLaunchContext({
    stableInput: {
      state: input.state,
      projection: { current: false, issues: ["PROJECT_PROJECTION_CHANGE: write AGENTS.md"], recordPresent: true, result: null },
      snapshot: { projectRoot: input.projectRoot, sourceProjectConfigDigest: hash("1"), sourceProjectLockDigest: hash("2"), inputDigest: hash("3") },
    },
    assignedRoot: input.reviewer.name,
    target: "codex",
    enabledOptionalMcp: [],
    strict: false,
  })).rejects.toMatchObject({ code: "LAUNCH_BASE_PROJECTION_STALE" });
});

test("strictness is identity-bound even when all selected capabilities are consented", async () => {
  const input = await fixture();
  const planner = await import("../cli/core/worker-launch-context/plan") as any;
  const stableInput = {
    state: input.state,
    projection: { current: true, issues: [], recordPresent: true, result: null },
    snapshot: { projectRoot: input.projectRoot, sourceProjectConfigDigest: hash("1"), sourceProjectLockDigest: hash("2"), inputDigest: hash("3") },
  };
  const base = { stableInput, assignedRoot: input.reviewer.name, target: "codex" as const, enabledOptionalMcp: ["review_mcp"] };
  const nonStrict = await planner.planWorkerLaunchContext({ ...base, strict: false });
  const strict = await planner.planWorkerLaunchContext({ ...base, strict: true });
  expect(nonStrict.plan.consent.excluded).toEqual([]);
  expect(strict.plan.consent.excluded).toEqual([]);
  expect(strict.plan.plannedContextId).not.toBe(nonStrict.plan.plannedContextId);
});
