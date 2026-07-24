// ABOUTME: Verifies the first supported machine capability schema and file lifecycle.
// ABOUTME: Rejects prototype and permissive config behavior without migration or side effects.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { createDarwinianOperatorPin } from "../cli/core/operator-profile-contract";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function validProfile() {
  return createDarwinianOperatorPin();
}

function expectInvalid(value: unknown) {
  try {
    parseMachineConfig(value);
    throw new Error("expected machine config to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(DrwnError);
    expect((error as DrwnError).code).toBe("MACHINE_CONFIG_INVALID");
  }
}

describe("machine config V1", () => {
  test("defines exact empty machine intent", () => {
    expect(createEmptyMachineConfig()).toEqual({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: {},
      capabilities: { profile: null, skills: [], mcpServers: [] },
    });
  });

  test("accepts strict policy and the exact pinned Operator profile", () => {
    const config = {
      schema: "drwn.machine" as const,
      schemaVersion: 1 as const,
      policy: {
        authoring: { scope: "@me" },
        targets: { codex: { enabled: false } },
        analyzer: { apiUrl: "https://analyzer.test", maxArchiveBytes: 1024 },
        trustedSources: { strict: true, gitHosts: ["github.com"] },
      },
      capabilities: {
        profile: validProfile(),
        skills: ["local-skill"],
        mcpServers: ["notion"],
      },
    };

    expect(parseMachineConfig(config)).toEqual(config);
  });

  test("rejects unknown fields at every object boundary", () => {
    const base = createEmptyMachineConfig();
    const cases: unknown[] = [
      { ...base, unexpected: true },
      { ...base, policy: { unexpected: true } },
      { ...base, policy: { authoring: { unexpected: true } } },
      { ...base, policy: { targets: { codex: { unexpected: true } } } },
      { ...base, policy: { analyzer: { unexpected: true } } },
      { ...base, capabilities: { ...base.capabilities, unexpected: true } },
      { ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), unexpected: true } } },
    ];

    for (const value of cases) {
      expectInvalid(value);
    }
  });

  test("rejects prototype fields and unsupported schema identities", () => {
    expectInvalid({ version: 1, optional: {}, defaults: { skills: [] } });
    expectInvalid({ ...createEmptyMachineConfig(), schema: "drwn.machine-v2" });
    expectInvalid({ ...createEmptyMachineConfig(), schemaVersion: 2 });
  });

  test("rejects duplicate capability IDs", () => {
    const base = createEmptyMachineConfig();
    expectInvalid({ ...base, capabilities: { ...base.capabilities, skills: ["alpha", "alpha"] } });
    expectInvalid({ ...base, capabilities: { ...base.capabilities, mcpServers: ["notion", "notion"] } });
  });

  test("rejects malformed and unapproved profile pins", () => {
    const base = createEmptyMachineConfig();
    expectInvalid({ ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), commit: "mutable" } } });
    expectInvalid({ ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), skills: ["not-approved"] } } });
    expectInvalid({ ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), mcpServers: ["notion"] } } });
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

  test("writes validate before atomically replacing bytes", async () => {
    const root = await createTempRoot("machine-write-");
    tempRoots.push(root);
    const path = join(root, "drwn", "machine.json");
    await mkdir(join(root, "drwn"), { recursive: true });
    await writeFile(path, "sentinel\n");

    await expect(writeMachineConfigFile(path, { version: 1 } as never)).rejects.toMatchObject({
      code: "MACHINE_CONFIG_INVALID",
    });
    expect(await readFile(path, "utf8")).toBe("sentinel\n");
  });

  test("wraps invalid JSON in the stable machine error", async () => {
    const root = await createTempRoot("machine-json-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeFile(path, "{not-json\n");

    await expect(readMachineConfigFile(path)).rejects.toMatchObject({ code: "MACHINE_CONFIG_INVALID" });
  });

  test("mutations acquire inventory then machine state while dry-runs create no file", async () => {
    const root = await createTempRoot("machine-mutate-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const path = resolveMachineConfigPath(agentsDir);
    const mutate = (config: ReturnType<typeof createEmptyMachineConfig>) => {
      config.capabilities.skills = ["alpha"];
      return { config, value: config.capabilities.skills };
    };

    expect(await mutateMachineConfig(agentsDir, mutate, { dryRun: true })).toEqual(["alpha"]);
    expect(existsSync(path)).toBe(false);
    expect(await mutateMachineConfig(agentsDir, mutate)).toEqual(["alpha"]);
    expect((await readMachineConfigFile(path))?.capabilities.skills).toEqual(["alpha"]);
  });
});

describe("legacy machine config migration (I65 Fix 2)", () => {
  test("migrates a legacy file with authoring scope to valid v1 on read", async () => {
    const root = await createTempRoot("machine-legacy-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeFile(path, `${JSON.stringify({ version: 1, optional: {}, authoring: { scope: "@x" } })}\n`);

    const config = await readMachineConfigFile(path);

    expect(config).toEqual({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: { authoring: { scope: "@x" } },
      capabilities: { profile: null, skills: [], mcpServers: [] },
    });
    // Migration persists v1 in place so every later reader sees a valid file.
    expect(JSON.parse(await readFile(path, "utf8")).schema).toBe("drwn.machine");
  });

  test("migrates a legacy file without authoring scope to empty v1", async () => {
    const root = await createTempRoot("machine-legacy-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeFile(path, `${JSON.stringify({ version: 1, optional: {} })}\n`);

    expect(await readMachineConfigFile(path)).toEqual(createEmptyMachineConfig());
  });

  test("leaves an already-v1 file untouched", async () => {
    const root = await createTempRoot("machine-v1-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeMachineConfigFile(path, createEmptyMachineConfig());
    const before = await readFile(path, "utf8");

    expect(await readMachineConfigFile(path)).toEqual(createEmptyMachineConfig());
    expect(await readFile(path, "utf8")).toBe(before);
  });

  test("unknown non-legacy shapes still throw, with a hint naming a real command", async () => {
    const root = await createTempRoot("machine-unknown-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeFile(path, `${JSON.stringify({ mystery: true })}\n`);

    try {
      await readMachineConfigFile(path);
      throw new Error("expected read to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DrwnError);
      const drwnError = error as DrwnError;
      expect(drwnError.code).toBe("MACHINE_CONFIG_INVALID");
      // I49 TC-D1: the old hint named `drwn setup`, which does not exist.
      const hints = (drwnError.hints ?? []).join(" ");
      expect(hints).toContain("drwn init");
      expect(hints).not.toContain("drwn setup");
    }
  });
});
