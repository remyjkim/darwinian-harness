// ABOUTME: Freezes strict bounded Worker launch plan, context, and receipt V1 contracts.
// ABOUTME: Protects the future Rust consumer from unknown fields, unsafe paths, and ambiguous identity.

import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const digest = (char: string) => `sha256-${char.repeat(64)}`;
const loadContracts = async () => await import("../cli/core/worker-launch-context/contracts").catch(() => ({} as any));
const card = (name: string, char: string) => ({
  name,
  version: "1.0.0",
  integrity: digest(char),
  local: false,
});
const root = (name: string, char: string) => ({
  name,
  requested: `${name}@1.0.0`,
  kind: "card",
  closureDigest: digest(char),
  localOnly: false,
});

function validPlan() {
  return {
    schema: "drwn.worker-launch-plan",
    schemaVersion: 1,
    target: "codex",
    projectRoot: "/project",
    baseRoot: root("@test/base", "a"),
    assignedRoot: root("@test/reviewer", "b"),
    baseClosure: [card("@test/base", "a")],
    assignedClosure: [card("@test/reviewer", "b")],
    deltaClosure: [card("@test/reviewer", "b")],
    capabilities: {
      skills: [{ id: "review", contentHash: digest("c") }],
      mcpServers: [{ id: "context7", definitionHash: digest("d"), optional: false }],
      hooks: [{ id: "@test/reviewer:guard", contentHash: digest("e"), consentHash: digest("f") }],
      instructions: { present: true, contentHash: digest("1"), consentHash: digest("2") },
    },
    optionalMcp: { requested: [], enabled: [], rejected: [] },
    consent: { strict: false, included: ["@test/reviewer:guard"], excluded: [] },
    targetCompatibility: { minimumVersion: "0.149.0", probed: false },
    warnings: [],
    plannedContextId: digest("3"),
    plannedArtifactDir: `/project/.agents/drwn/generated/launch-contexts/v1/codex/${digest("3")}`,
  };
}

function validContext() {
  return {
    schema: "drwn.worker-launch-context",
    schemaVersion: 1,
    contextId: digest("3"),
    target: "codex",
    kind: "codex",
    baseRoot: root("@test/base", "a"),
    assignedRoot: root("@test/reviewer", "b"),
    artifactDir: `/project/.agents/drwn/generated/launch-contexts/v1/codex/${digest("3")}`,
    request: { enabledOptionalMcp: [], strict: false },
    launch: { args: ["-C", "/project/context", "--add-dir", "/project"], env: {} },
    capabilities: { skills: ["review"], mcpServers: ["context7"], hooks: ["@test/reviewer:guard"], instructions: true },
    sourceState: {
      projectRootHash: digest("4"),
      baseClosureDigest: digest("a"),
      assignedClosureDigest: digest("b"),
      projectOverlayDigest: digest("5"),
    },
    targetCompatibility: { minimumVersion: "0.149.0", probed: true, observedVersion: "0.149.0" },
    provenance: { drwnVersion: "1.4.0", sourceProjectLockDigest: digest("6"), localOnly: false },
    warnings: [],
  };
}

function validReceipt() {
  return {
    schema: "drwn.worker-launch-receipt",
    schemaVersion: 1,
    contextId: digest("3"),
    createdAt: "2026-08-24T00:00:00.000Z",
    rendererVersion: "worker-launch-context@1",
    files: [
      { path: "codex", kind: "directory", contentHash: digest("7") },
      { path: "manifest.json", kind: "file", contentHash: digest("8") },
    ],
  };
}

test("strict parsers accept the complete canonical plan, context, and receipt", async () => {
  const contracts = await loadContracts();
  expect(typeof contracts.parseWorkerLaunchPlan).toBe("function");
  expect(contracts.parseWorkerLaunchPlan(validPlan())).toEqual(validPlan());
  expect(contracts.parseWorkerLaunchContext(validContext())).toEqual(validContext());
  expect(contracts.parseWorkerLaunchReceipt(validReceipt())).toEqual(validReceipt());
  expect(contracts.parseWorkerLaunchPrepareResult({
    schema: "drwn.worker-launch-prepare-result",
    schemaVersion: 1,
    reused: false,
    context: validContext(),
  })).toMatchObject({ schema: "drwn.worker-launch-prepare-result", reused: false });
});

test("contracts reject unknown fields, unsafe paths, unsorted IDs, and unsupported receipt kinds", async () => {
  const contracts = await loadContracts();
  expect(typeof contracts.parseWorkerLaunchPlan).toBe("function");
  expect(() => contracts.parseWorkerLaunchPlan({ ...validPlan(), extra: true })).toThrow();
  expect(() => contracts.parseWorkerLaunchPlan({ ...validPlan(), projectRoot: "relative/project" })).toThrow();
  expect(() => contracts.parseWorkerLaunchPlan({ ...validPlan(), optionalMcp: { requested: ["z", "a"], enabled: [], rejected: [] } })).toThrow();
  expect(() => contracts.parseWorkerLaunchReceipt({
    ...validReceipt(),
    files: [{ path: "escape/../secret", kind: "symlink", contentHash: digest("9") }],
  })).toThrow();
});

test("persisted contract readers reject documents beyond the 64 KiB boundary", async () => {
  const contracts = await loadContracts();
  expect(typeof contracts.parseWorkerLaunchReceiptBytes).toBe("function");
  const bytes = `${JSON.stringify(validReceipt())}${" ".repeat(65_536)}`;
  expect(() => contracts.parseWorkerLaunchReceiptBytes(bytes)).toThrow(expect.objectContaining({ code: "LAUNCH_CONTEXT_CORRUPT" }));
});

test("frozen Rust-consumer fixtures parse through the exact public contracts", async () => {
  const contracts = await loadContracts();
  const root = join(import.meta.dir, "fixtures", "worker-launch-context-v1");
  const plan = JSON.parse(await readFile(join(root, "plan.codex.json"), "utf8"));
  const context = JSON.parse(await readFile(join(root, "context.codex.json"), "utf8"));
  const result = JSON.parse(await readFile(join(root, "prepare-result.codex.json"), "utf8"));
  const receipt = JSON.parse(await readFile(join(root, "receipt.codex.json"), "utf8"));
  expect(contracts.parseWorkerLaunchPlan(plan).schemaVersion).toBe(1);
  expect(contracts.parseWorkerLaunchContext(context).schemaVersion).toBe(1);
  expect(contracts.parseWorkerLaunchPrepareResult(result).context).toEqual(context);
  expect(contracts.parseWorkerLaunchReceipt(receipt).contextId).toBe(context.contextId);
});
