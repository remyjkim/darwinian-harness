// ABOUTME: Verifies the strict machine V2 Worker-selection schema and file lifecycle.
// ABOUTME: Proves V1 and prototype state fail closed without migration or byte mutation.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createCardLockfile,
  type CardLockEntry,
  type ProjectLockV1,
} from "../cli/core/card-lock";
import { DrwnError } from "../cli/core/errors";
import {
  createEmptyMachineConfig,
  initializeMachineConfig,
  mutateMachineConfig,
  parseMachineConfig,
  readMachineConfigFile,
  writeMachineConfigFile,
} from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function blueprintCard(): CardLockEntry {
  const name = "@me/machine-worker";
  const version = "1.0.0";
  return {
    name,
    requested: "git+https://github.com/me/machine-worker.git#v1.0.0",
    version,
    path: "/cards/@me/machine-worker/1.0.0",
    integrity: `sha256-${"a".repeat(64)}`,
    treeSha: "b".repeat(40),
    manifest: { name, version, kind: "blueprint", composedFrom: [] },
    skills: [],
    hooks: [],
    registry: null,
    origin: "git",
    git: {
      url: "https://github.com/me/machine-worker.git",
      ref: "v1.0.0",
      commit: "c".repeat(40),
    },
  };
}

function validWorkerLock(): ProjectLockV1 {
  const card = blueprintCard();
  return createCardLockfile({
    workerRoots: [{ name: card.name, requested: card.requested, kind: "blueprint", members: [] }],
    cards: [card],
  });
}

function expectInvalid(value: unknown): DrwnError {
  try {
    parseMachineConfig(value);
    throw new Error("expected machine config to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(DrwnError);
    expect((error as DrwnError).code).toBe("MACHINE_CONFIG_INVALID");
    return error as DrwnError;
  }
}

describe("machine config V2", () => {
  test("defines and parses exact empty machine intent", () => {
    const empty = {
      schema: "drwn.machine" as const,
      schemaVersion: 2 as const,
      policy: {},
      capabilities: { activeWorker: null, workerLock: null },
    };

    expect(createEmptyMachineConfig()).toEqual(empty);
    expect(parseMachineConfig(empty)).toEqual(empty);
  });

  test("accepts strict retained policy and a validated active Worker lock", () => {
    const workerLock = validWorkerLock();
    const config = {
      schema: "drwn.machine" as const,
      schemaVersion: 2 as const,
      policy: {
        targets: { codex: { enabled: false } },
        catalogs: { npmSkills: { enabled: true, searchLimit: 12 } },
        analyzer: { apiUrl: "https://analyzer.test", maxArchiveBytes: 1024 },
        trustedSources: { strict: true, gitHosts: ["github.com"] },
      },
      capabilities: { activeWorker: "@me/machine-worker", workerLock },
    };

    expect(parseMachineConfig(config)).toEqual(config);
  });

  test("allows installed alternatives without a selection", () => {
    const config = {
      ...createEmptyMachineConfig(),
      capabilities: { activeWorker: null, workerLock: validWorkerLock() },
    };

    expect(parseMachineConfig(config)).toEqual(config);
  });

  test("enforces active Worker and embedded lock invariants", () => {
    const workerLock = validWorkerLock();
    expectInvalid({
      ...createEmptyMachineConfig(),
      capabilities: { activeWorker: "@me/machine-worker", workerLock: null },
    });
    expectInvalid({
      ...createEmptyMachineConfig(),
      capabilities: { activeWorker: "@me/not-installed", workerLock },
    });
    expectInvalid({
      ...createEmptyMachineConfig(),
      capabilities: {
        activeWorker: "@me/machine-worker",
        workerLock: { ...workerLock, schemaVersion: 2 },
      },
    });
  });

  test("rejects a valid project lock whose machine root is a plain Card", () => {
    const card = blueprintCard();
    card.manifest = { name: card.name, version: card.version };
    const plainLock = createCardLockfile({
      workerRoots: [{ name: card.name, requested: card.requested, kind: "card", members: [] }],
      cards: [card],
    });

    expectInvalid({
      ...createEmptyMachineConfig(),
      capabilities: { activeWorker: null, workerLock: plainLock },
    });
  });

  test("rejects V1, prototypes, and unknown fields at every V2 boundary", () => {
    const empty = createEmptyMachineConfig();
    const v1 = {
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: {},
      capabilities: { profile: null, skills: [], mcpServers: [] },
    };
    const cases: unknown[] = [
      v1,
      { version: 1, optional: {}, authoring: { scope: "@me" } },
      { ...empty, unexpected: true },
      { ...empty, policy: { authoring: { scope: "@me" } } },
      { ...empty, policy: { targets: { codex: { unexpected: true } } } },
      { ...empty, capabilities: { ...empty.capabilities, profile: null } },
      { ...empty, capabilities: { ...empty.capabilities, unexpected: true } },
    ];

    for (const value of cases) expectInvalid(value);
    const error = expectInvalid(v1);
    expect(error.message).toContain("schemaVersion");
    expect(error.hints?.join(" ")).toContain("Reset ~/.agents/drwn/machine.json");
    expect(error.hints?.join(" ")).toContain("drwn init");
  });

  test("missing reads are side-effect free", async () => {
    const root = await createTempRoot("machine-read-");
    tempRoots.push(root);
    const path = join(root, "missing", "machine.json");

    expect(await readMachineConfigFile(path)).toBeNull();
    expect(existsSync(join(root, "missing"))).toBe(false);
  });

  test("initialization is exact and byte-identical on repeat", async () => {
    const root = await createTempRoot("machine-init-");
    tempRoots.push(root);
    const path = join(root, "drwn", "machine.json");

    expect((await initializeMachineConfig(path)).created).toBe(true);
    const first = await readFile(path, "utf8");
    expect(JSON.parse(first)).toEqual(createEmptyMachineConfig());
    expect((await initializeMachineConfig(path)).created).toBe(false);
    expect(await readFile(path, "utf8")).toBe(first);
  });

  test("invalid legacy reads and writes preserve the original bytes", async () => {
    const root = await createTempRoot("machine-invalid-");
    tempRoots.push(root);
    const path = join(root, "drwn", "machine.json");
    await mkdir(join(root, "drwn"), { recursive: true });
    const v1 = `${JSON.stringify({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: { authoring: { scope: "@legacy" } },
      capabilities: { profile: null, skills: [], mcpServers: [] },
    }, null, 2)}\n`;
    await writeFile(path, v1);

    await expect(readMachineConfigFile(path)).rejects.toMatchObject({ code: "MACHINE_CONFIG_INVALID" });
    expect(await readFile(path, "utf8")).toBe(v1);
    await expect(writeMachineConfigFile(path, { version: 1 } as never)).rejects.toMatchObject({
      code: "MACHINE_CONFIG_INVALID",
    });
    expect(await readFile(path, "utf8")).toBe(v1);
  });

  test("wraps invalid JSON in the stable machine error without rewriting it", async () => {
    const root = await createTempRoot("machine-json-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeFile(path, "{not-json\n");

    await expect(readMachineConfigFile(path)).rejects.toMatchObject({ code: "MACHINE_CONFIG_INVALID" });
    expect(await readFile(path, "utf8")).toBe("{not-json\n");
  });

  test("mutations acquire locks while dry-runs create no file", async () => {
    const root = await createTempRoot("machine-mutate-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const path = resolveMachineConfigPath(agentsDir);
    const mutate = (config: ReturnType<typeof createEmptyMachineConfig>) => {
      config.policy.targets = { codex: { enabled: false } };
      return { config, value: config.policy.targets };
    };

    expect(await mutateMachineConfig(agentsDir, mutate, { dryRun: true })).toEqual({ codex: { enabled: false } });
    expect(existsSync(path)).toBe(false);
    expect(await mutateMachineConfig(agentsDir, mutate)).toEqual({ codex: { enabled: false } });
    expect((await readMachineConfigFile(path))?.policy.targets).toEqual({ codex: { enabled: false } });
  });
});
