// ABOUTME: Verifies strict machine-local authoring preferences and lossless legacy scope migration.
// ABOUTME: Proves preference persistence succeeds before the compatibility field is removed.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DrwnError } from "../cli/core/errors";
import { createEmptyMachineConfig, readMachineConfigFile, writeMachineConfigFile } from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import {
  createEmptyUserPreferences,
  loadUserPreferences,
  mutateUserPreferences,
  parseUserPreferences,
  readUserPreferencesFile,
  writeUserPreferencesFile,
} from "../cli/core/user-preferences";
import { resolveUserConfigPath } from "../cli/core/paths";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("user preferences V1", () => {
  test("defines exact empty preferences and strictly validates every field", () => {
    expect(createEmptyUserPreferences()).toEqual({
      schema: "drwn.user-preferences",
      schemaVersion: 1,
      catalogCheckouts: [],
    });
    expect(parseUserPreferences({
      schema: "drwn.user-preferences",
      schemaVersion: 1,
      catalogCheckouts: ["~/dev/darwinian-cards"],
      defaultAuthorScope: "@curation-labs",
    })).toEqual({
      schema: "drwn.user-preferences",
      schemaVersion: 1,
      catalogCheckouts: ["~/dev/darwinian-cards"],
      defaultAuthorScope: "@curation-labs",
    });

    for (const invalid of [
      { version: 1, catalogCheckouts: [] },
      { schema: "drwn.user-preferences", schemaVersion: 2, catalogCheckouts: [] },
      { ...createEmptyUserPreferences(), unknown: true },
      { ...createEmptyUserPreferences(), catalogCheckouts: [""] },
      { ...createEmptyUserPreferences(), catalogCheckouts: ["one", "one"] },
      { ...createEmptyUserPreferences(), defaultAuthorScope: "" },
    ]) {
      expect(() => parseUserPreferences(invalid)).toThrow(DrwnError);
    }
  });

  test("missing and retired prototype reads return empty preferences without writing", async () => {
    const root = await createTempRoot("preferences-read-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const path = resolveUserConfigPath(agentsDir);

    expect(await loadUserPreferences(agentsDir)).toEqual(createEmptyUserPreferences());
    expect(existsSync(path)).toBe(false);

    await mkdir(join(agentsDir, "drwn"), { recursive: true });
    await writeFile(path, `${JSON.stringify({ version: 1, optional: {} })}\n`);
    expect(await readUserPreferencesFile(path)).toBeNull();
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ version: 1, optional: {} });
  });

  test("writes atomically and mutations preserve strict persisted bytes", async () => {
    const root = await createTempRoot("preferences-write-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const path = resolveUserConfigPath(agentsDir);
    const preferences = {
      ...createEmptyUserPreferences(),
      catalogCheckouts: ["~/dev/darwinian-cards"],
    };

    await writeUserPreferencesFile(path, preferences);
    expect(await readUserPreferencesFile(path)).toEqual(preferences);
    await mutateUserPreferences(agentsDir, (current) => ({
      preferences: { ...current, defaultAuthorScope: "@me" },
      value: "saved",
    }));
    expect((await readUserPreferencesFile(path))?.defaultAuthorScope).toBe("@me");
  });

  test("migrates machine authoring scope only after preferences persist", async () => {
    const root = await createTempRoot("preferences-migrate-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const machinePath = resolveMachineConfigPath(agentsDir);
    const machine = createEmptyMachineConfig();
    machine.policy.authoring = { scope: "@legacy" };
    await writeMachineConfigFile(machinePath, machine);

    expect(await loadUserPreferences(agentsDir)).toEqual({
      ...createEmptyUserPreferences(),
      defaultAuthorScope: "@legacy",
    });
    expect((await readMachineConfigFile(machinePath))?.policy.authoring).toBeUndefined();
    expect((await readUserPreferencesFile(resolveUserConfigPath(agentsDir)))?.defaultAuthorScope).toBe("@legacy");
    expect(await loadUserPreferences(agentsDir)).toEqual({
      ...createEmptyUserPreferences(),
      defaultAuthorScope: "@legacy",
    });
  });

  test("a failed preference write leaves the legacy machine scope intact", async () => {
    const root = await createTempRoot("preferences-order-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const machinePath = resolveMachineConfigPath(agentsDir);
    const machine = createEmptyMachineConfig();
    machine.policy.authoring = { scope: "@legacy" };
    await writeMachineConfigFile(machinePath, machine);
    await chmod(join(agentsDir, "drwn"), 0o555);

    try {
      await expect(loadUserPreferences(agentsDir)).rejects.toMatchObject({
        code: "USER_PREFERENCES_WRITE_FAILED",
      });
    } finally {
      await chmod(join(agentsDir, "drwn"), 0o755);
    }
    expect((await readMachineConfigFile(machinePath))?.policy.authoring?.scope).toBe("@legacy");
  });
});
