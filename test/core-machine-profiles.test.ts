// ABOUTME: Verifies recommended machine Worker initialization and fail-closed guided setup.
// ABOUTME: Proves accept, decline, repeat, unavailable, and invalid-existing paths preserve valid V2 intent.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCard } from "../cli/core/card-store";
import {
  initializeMachineWorker,
  type MachineWorkerInitDescriptor,
} from "../cli/core/machine-profiles";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  createCatalogCardSource,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

async function localDescriptor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const name = "@me/machine-defaults";
  const sourceDir = await createCatalogCardSource(fixture, name, { kind: "blueprint" });
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.harness = { minVersion: "0.8.0" };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const publish = await runAgentsCli(["worker", "publish", name], envFor(fixture));
  expect(publish.exitCode, publish.stderr).toBe(0);
  const source = `${name}@1.0.0`;
  const resolved = await resolveCard(fixture.agentsDir, source);
  return {
    source,
    name,
    version: resolved.version,
    minDrwnVersion: "0.8.0",
    commit: resolved.git!.commit,
    treeSha: resolved.treeSha!,
    integrity: resolved.integrity,
    members: [],
  } satisfies MachineWorkerInitDescriptor;
}

describe("machine Worker initialization", () => {
  test("guided acceptance resolves and selects the exact descriptor Blueprint", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const descriptor = await localDescriptor(fixture);

    const result = await initializeMachineWorker({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor,
    });

    expect(result).toEqual({ created: true, selectedWorker: descriptor.name });
    const machine = JSON.parse(await readFile(resolveMachineConfigPath(fixture.agentsDir), "utf8"));
    expect(machine.capabilities.activeWorker).toBe(descriptor.name);
    expect(machine.capabilities.workerLock.workerRoots[0].requested).toBe(descriptor.source);
  });

  test("guided decline and non-guided setup write exact empty V2", async () => {
    for (const guided of [true, false]) {
      const fixture = await scaffoldCliFixture();
      tempRoots.push(fixture.root);
      const result = await initializeMachineWorker({
        agentsDir: fixture.agentsDir,
        repoRoot: fixture.repoRoot,
        guided,
        promptRecommended: async () => false,
      });
      expect(result).toEqual({ created: true, selectedWorker: null });
      expect(JSON.parse(await readFile(resolveMachineConfigPath(fixture.agentsDir), "utf8")))
        .toEqual(createEmptyMachineConfig());
    }
  });

  test("an unavailable descriptor fails without creating machine intent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const path = resolveMachineConfigPath(fixture.agentsDir);
    const descriptor: MachineWorkerInitDescriptor = {
      source: "@missing/machine-defaults@1.0.0",
      name: "@missing/machine-defaults",
      version: "1.0.0",
      minDrwnVersion: "0.8.0",
      commit: "a".repeat(40),
      treeSha: "b".repeat(40),
      integrity: `sha256-${"c".repeat(64)}`,
      members: [],
    };

    await expect(initializeMachineWorker({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor,
    })).rejects.toMatchObject({ code: "MACHINE_WORKER_NOT_AVAILABLE" });
    expect(existsSync(path)).toBe(false);
  });

  test("descriptor mismatch fails before machine intent is written", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const descriptor = await localDescriptor(fixture);
    const path = resolveMachineConfigPath(fixture.agentsDir);

    await expect(initializeMachineWorker({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: true,
      promptRecommended: async () => true,
      descriptor: { ...descriptor, integrity: `sha256-${"0".repeat(64)}` },
    })).rejects.toMatchObject({ code: "MACHINE_WORKER_NOT_AVAILABLE" });
    expect(existsSync(path)).toBe(false);
  });

  test("invalid pre-existing V1 is rejected unchanged", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const path = resolveMachineConfigPath(fixture.agentsDir);
    const v1 = `${JSON.stringify({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: {},
      capabilities: { profile: null, skills: [], mcpServers: [] },
    }, null, 2)}\n`;
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(path, v1);

    await expect(initializeMachineWorker({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: false,
    })).rejects.toMatchObject({ code: "MACHINE_CONFIG_INVALID" });
    expect(await readFile(path, "utf8")).toBe(v1);
  });

  test("an existing valid machine config is returned without prompting", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await initializeMachineWorker({ agentsDir: fixture.agentsDir, repoRoot: fixture.repoRoot, guided: false });
    let prompted = false;

    const result = await initializeMachineWorker({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      guided: true,
      promptRecommended: async () => {
        prompted = true;
        return true;
      },
    });

    expect(result).toEqual({ created: false, selectedWorker: null });
    expect(prompted).toBe(false);
  });
});
