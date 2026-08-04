// ABOUTME: Verifies strict machine-local authoring preferences independent of machine intent.
// ABOUTME: Proves old machine authoring state is neither read, accepted, migrated, nor mutated.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DrwnError } from "../cli/core/errors";
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

  test("loads defaultAuthorScope only from config.json and ignores old machine authoring bytes", async () => {
    const root = await createTempRoot("preferences-independent-read-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const machinePath = resolveMachineConfigPath(agentsDir);
    const preferencesPath = resolveUserConfigPath(agentsDir);
    const oldMachine = `${JSON.stringify({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: { authoring: { scope: "@legacy" } },
      capabilities: { profile: null, skills: [], mcpServers: [] },
    }, null, 2)}\n`;
    await mkdir(join(agentsDir, "drwn"), { recursive: true });
    await writeFile(machinePath, oldMachine);
    await writeUserPreferencesFile(preferencesPath, {
      ...createEmptyUserPreferences(),
      defaultAuthorScope: "@explicit",
    });

    expect(await loadUserPreferences(agentsDir)).toEqual({
      ...createEmptyUserPreferences(),
      defaultAuthorScope: "@explicit",
    });
    expect(await readFile(machinePath, "utf8")).toBe(oldMachine);
  });

  test("persists preference mutations without reading or rewriting old machine authoring bytes", async () => {
    const root = await createTempRoot("preferences-independent-write-");
    tempRoots.push(root);
    const agentsDir = join(root, ".agents");
    const machinePath = resolveMachineConfigPath(agentsDir);
    const oldMachine = `${JSON.stringify({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: { authoring: { scope: "@legacy" } },
      capabilities: { profile: null, skills: [], mcpServers: [] },
    }, null, 2)}\n`;
    await mkdir(join(agentsDir, "drwn"), { recursive: true });
    await writeFile(machinePath, oldMachine);

    await mutateUserPreferences(agentsDir, (current) => ({
      preferences: {
        ...current,
        catalogCheckouts: ["~/catalog"],
        defaultAuthorScope: "@explicit",
      },
      value: undefined,
    }));

    expect(await readUserPreferencesFile(resolveUserConfigPath(agentsDir))).toEqual({
      ...createEmptyUserPreferences(),
      catalogCheckouts: ["~/catalog"],
      defaultAuthorScope: "@explicit",
    });
    expect(await readFile(machinePath, "utf8")).toBe(oldMachine);
  });
});
