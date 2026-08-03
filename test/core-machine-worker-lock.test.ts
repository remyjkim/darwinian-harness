// ABOUTME: Verifies atomic machine Blueprint replacement, additive selection, and clearing semantics.
// ABOUTME: Proves machine roots are Blueprints and dry-run or failed mutations preserve machine bytes.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { readMachineConfigFile, writeMachineConfigFile } from "../cli/core/machine-config";
import { resolveExplicitInstructionContribution } from "../cli/core/instruction-contribution";
import {
  applyMachineWorkerRoots,
  useMachineWorker,
} from "../cli/core/worker-machine";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  members: string[] = [],
) {
  await createCatalogCardSource(fixture, name, { kind: "blueprint" });
  for (const member of members) {
    const composed = await runAgentsCli(["worker", "compose", name, "--add", member], envFor(fixture));
    expect(composed.exitCode, composed.stderr).toBe(0);
  }
  const published = await runAgentsCli(["worker", "publish", name], envFor(fixture));
  expect(published.exitCode, published.stderr).toBe(0);
}

async function fixtureWithWorkers() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprint(fixture, "@me/one");
  await publishBlueprint(fixture, "@me/two");
  return fixture;
}

function options(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, dryRun = false) {
  return { repoRoot: fixture.repoRoot, cwd: fixture.repoRoot, dryRun };
}

async function publishSource(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  command: "card" | "worker",
  name: string,
  sourceDir: string,
) {
  const result = await runAgentsCli(
    [command, "publish", name, "--from", sourceDir, "--force-bump-mismatch"],
    envFor(fixture),
  );
  expect(result.exitCode, result.stderr).toBe(0);
}

describe("machine Worker lock mutations", () => {
  test("apply replaces roots and stores canonical selection plus requested refs", async () => {
    const fixture = await fixtureWithWorkers();
    const result = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/one@1.0.0", "@me/two@1.0.0"],
      { ...options(fixture), active: "@me/two" },
    );

    expect(result.activeWorker).toBe("@me/two");
    expect(result.roots.map((root) => [root.name, root.requested, root.kind])).toEqual([
      ["@me/one", "@me/one@1.0.0", "blueprint"],
      ["@me/two", "@me/two@1.0.0", "blueprint"],
    ]);
    expect(result.config.capabilities.workerLock?.workerRoots).toEqual(result.roots);
    expect(JSON.parse(await readFile(resolveMachineConfigPath(fixture.agentsDir), "utf8"))).toEqual(result.config);
  });

  test("apply requires explicit multiple-root selection and is atomic on failure", async () => {
    const fixture = await fixtureWithWorkers();
    await applyMachineWorkerRoots(fixture.agentsDir, ["@me/one@1.0.0"], options(fixture));
    const path = resolveMachineConfigPath(fixture.agentsDir);
    const before = await readFile(path, "utf8");

    await expect(applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/one@1.0.0", "@me/two@1.0.0"],
      options(fixture),
    )).rejects.toMatchObject({ code: "MULTIPLE_WORKERS_REQUIRE_SELECTION" });
    expect(await readFile(path, "utf8")).toBe(before);
  });

  test("apply --none retains replacements and an empty replacement clears the lock", async () => {
    const fixture = await fixtureWithWorkers();
    const retained = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/one@1.0.0", "@me/two@1.0.0"],
      { ...options(fixture), none: true },
    );
    expect(retained.config.capabilities.activeWorker).toBeNull();
    expect(retained.config.capabilities.workerLock?.workerRoots).toHaveLength(2);

    const cleared = await applyMachineWorkerRoots(fixture.agentsDir, [], {
      ...options(fixture),
      none: true,
    });
    expect(cleared.config.capabilities).toEqual({ activeWorker: null, workerLock: null });
  });

  test("use adds and selects a new root, selects an existing root, and --none retains alternatives", async () => {
    const fixture = await fixtureWithWorkers();
    await applyMachineWorkerRoots(fixture.agentsDir, ["@me/one@1.0.0"], options(fixture));
    const added = await useMachineWorker(fixture.agentsDir, "@me/two@1.0.0", options(fixture));
    expect(added.roots.map((root) => root.name)).toEqual(["@me/one", "@me/two"]);
    expect(added.activeWorker).toBe("@me/two");

    const selected = await useMachineWorker(fixture.agentsDir, "@me/one", options(fixture));
    expect(selected.roots.map((root) => root.requested)).toEqual(["@me/one@1.0.0", "@me/two@1.0.0"]);
    expect(selected.activeWorker).toBe("@me/one");

    const none = await useMachineWorker(fixture.agentsDir, null, options(fixture));
    expect(none.activeWorker).toBeNull();
    expect(none.roots).toHaveLength(2);
  });

  test("rejects a plain Card root without mutating prior intent", async () => {
    const fixture = await fixtureWithWorkers();
    await publishCardWithSkills(fixture, { name: "@me/plain", skills: [] });
    await applyMachineWorkerRoots(fixture.agentsDir, ["@me/one@1.0.0"], options(fixture));
    const path = resolveMachineConfigPath(fixture.agentsDir);
    const before = await readFile(path, "utf8");

    await expect(useMachineWorker(fixture.agentsDir, "@me/plain@1.0.0", options(fixture)))
      .rejects.toMatchObject({ code: "MACHINE_WORKER_ROOT_NOT_BLUEPRINT" });
    expect(await readFile(path, "utf8")).toBe(before);
  });

  test("rejects an unsupported Blueprint harness floor before writing intent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const sourceDir = await createCatalogCardSource(fixture, "@me/future", { kind: "blueprint" });
    const manifestPath = join(sourceDir, "card.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.harness = { minVersion: "99.0.0" };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const publish = await runAgentsCli(["worker", "publish", "@me/future"], envFor(fixture));
    expect(publish.exitCode, publish.stderr).toBe(0);
    const path = resolveMachineConfigPath(fixture.agentsDir);

    await expect(applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/future@1.0.0"],
      options(fixture),
    )).rejects.toMatchObject({ code: "MACHINE_WORKER_VERSION_UNSUPPORTED" });
    expect(existsSync(path)).toBe(false);
  });

  test("re-resolution preserves, re-grants, and drops instruction consent by range and content", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const memberDir = await createCatalogCardSource(fixture, "@me/member");
    const memberManifestPath = join(memberDir, "card.json");
    const memberManifest = JSON.parse(await readFile(memberManifestPath, "utf8"));
    memberManifest.instructions = { text: "same instructions" };
    await writeFile(memberManifestPath, `${JSON.stringify(memberManifest, null, 2)}\n`);
    await publishSource(fixture, "card", "@me/member", memberDir);

    const workerDir = await createCatalogCardSource(fixture, "@me/consented", { kind: "blueprint" });
    const workerManifestPath = join(workerDir, "card.json");
    const workerManifest = JSON.parse(await readFile(workerManifestPath, "utf8"));
    workerManifest.composedFrom = ["@me/member@^1.0.0"];
    await writeFile(workerManifestPath, `${JSON.stringify(workerManifest, null, 2)}\n`);
    await publishSource(fixture, "worker", "@me/consented", workerDir);
    await applyMachineWorkerRoots(fixture.agentsDir, ["@me/consented@1.0.0"], options(fixture));

    const machinePath = resolveMachineConfigPath(fixture.agentsDir);
    const initial = (await readMachineConfigFile(machinePath))!;
    const initialMember = initial.capabilities.workerLock!.cards.find((card) => card.name === "@me/member")!;
    const contribution = resolveExplicitInstructionContribution(initialMember, initialMember.path)!;
    const consent = {
      consentedAt: "2026-08-03T00:00:00.000Z",
      consentedRange: "^1.0.0",
      contentDigest: contribution.contentDigest,
    };
    initialMember.instructionConsent = consent;
    await writeMachineConfigFile(machinePath, initial);

    memberManifest.version = "1.1.0";
    await writeFile(memberManifestPath, `${JSON.stringify(memberManifest, null, 2)}\n`);
    await publishSource(fixture, "card", "@me/member", memberDir);
    const preserved = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/consented@1.0.0"],
      options(fixture),
    );
    expect(preserved.locked.find((card) => card.name === "@me/member")?.instructionConsent).toEqual(consent);

    memberManifest.version = "1.2.0";
    memberManifest.instructions = { text: "changed instructions" };
    await writeFile(memberManifestPath, `${JSON.stringify(memberManifest, null, 2)}\n`);
    await publishSource(fixture, "card", "@me/member", memberDir);
    const regranted = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/consented@1.0.0"],
      options(fixture),
    );
    const regrantedConsent = regranted.locked.find((card) => card.name === "@me/member")?.instructionConsent;
    expect(regrantedConsent?.consentedRange).toBe("^1.0.0");
    expect(regrantedConsent?.consentedAt).not.toBe(consent.consentedAt);
    expect(regrantedConsent?.contentDigest).not.toBe(consent.contentDigest);
    expect(regranted.warnings?.join("\n")).toContain("instruction consent re-granted");

    memberManifest.version = "1.3.0";
    delete memberManifest.instructions;
    await writeFile(memberManifestPath, `${JSON.stringify(memberManifest, null, 2)}\n`);
    await publishSource(fixture, "card", "@me/member", memberDir);
    const dropped = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/consented@1.0.0"],
      options(fixture),
    );
    expect(dropped.locked.find((card) => card.name === "@me/member")?.instructionConsent).toBeUndefined();
    expect(dropped.warnings?.join("\n")).toContain("instruction consent dropped");

    workerManifest.version = "1.1.0";
    workerManifest.composedFrom = [];
    await writeFile(workerManifestPath, `${JSON.stringify(workerManifest, null, 2)}\n`);
    await publishSource(fixture, "worker", "@me/consented", workerDir);
    const removed = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/consented@1.1.0"],
      options(fixture),
    );
    expect(removed.locked.map((card) => card.name)).toEqual(["@me/consented"]);
  });

  test("dry-run returns complete intent without creating machine.json", async () => {
    const fixture = await fixtureWithWorkers();
    const path = resolveMachineConfigPath(fixture.agentsDir);
    const result = await applyMachineWorkerRoots(
      fixture.agentsDir,
      ["@me/one@1.0.0"],
      options(fixture, true),
    );

    expect(result.dryRun).toBe(true);
    expect(result.activeWorker).toBe("@me/one");
    expect(existsSync(path)).toBe(false);
  });
});
