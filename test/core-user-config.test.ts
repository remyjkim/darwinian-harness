// ABOUTME: Verifies strict machine configuration initialization and policy-only runtime merging.
// ABOUTME: Ensures prototype config and ambient curated directories are never activation authority.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";
import { resolveMachineConfigPath } from "../cli/core/store-paths";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("machine runtime config", () => {
  test("initializes explicit empty intent without scanning ambient skills or packaged defaults", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "skills"), { recursive: true });
    await symlink(join(fixture.repoRoot, "skills", "shared", "alpha"), join(fixture.agentsDir, "skills", "alpha"), "dir");
    const { loadConfig } = await import("../cli/core/config");
    const { loadRegistry } = await import("../cli/core/registry");
    const { loadOrInitializeMachineConfig } = await import("../cli/core/user-config");

    const loaded = await loadOrInitializeMachineConfig({
      repoConfig: await loadConfig(fixture.repoRoot),
      registry: await loadRegistry(fixture.repoRoot),
      agentsDir: fixture.agentsDir,
    });

    expect(loaded.created).toBe(true);
    expect(loaded.path).toBe(resolveMachineConfigPath(fixture.agentsDir));
    expect(loaded.config).toEqual(createEmptyMachineConfig());
    expect(existsSync(loaded.path)).toBe(true);
  });

  test("merges only machine policy into packaged runtime config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadConfig } = await import("../cli/core/config");
    const { loadEffectiveConfig } = await import("../cli/core/user-config");
    const repoConfig = await loadConfig(fixture.repoRoot);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(
      resolveMachineConfigPath(fixture.agentsDir),
      `${JSON.stringify({
        ...createEmptyMachineConfig(),
        policy: {
          targets: { codex: { enabled: false } },
          analyzer: { apiUrl: "https://machine.test" },
          trustedSources: { strict: true },
        },
      }, null, 2)}\n`,
    );

    const loaded = await loadEffectiveConfig(repoConfig, fixture.agentsDir);

    expect(loaded.userConfigPath).toBe(resolveMachineConfigPath(fixture.agentsDir));
    expect(loaded.config.targets.codex.enabled).toBe(false);
    expect(loaded.config.analyzer?.apiUrl).toBe("https://machine.test");
    expect(loaded.config.trustedSources?.strict).toBe(true);
    expect(loaded.config.defaults).toEqual(repoConfig.defaults);
  });

  test("machine policy can enable the opencode target", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadConfig } = await import("../cli/core/config");
    const { loadEffectiveConfig } = await import("../cli/core/user-config");
    const repoConfig = await loadConfig(fixture.repoRoot);
    repoConfig.targets.opencode = {
      enabled: false,
      configPath: "~/.config/opencode/opencode.json",
      format: "json-merge",
      mcpKey: "mcp",
    };
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(
      resolveMachineConfigPath(fixture.agentsDir),
      `${JSON.stringify({
        ...createEmptyMachineConfig(),
        policy: { targets: { opencode: { enabled: true } } },
      }, null, 2)}\n`,
    );

    const loaded = await loadEffectiveConfig(repoConfig, fixture.agentsDir);

    expect(loaded.config.targets.opencode.enabled).toBe(true);
    expect(loaded.config.targets.opencode.mcpKey).toBe("mcp");
  });

  test("does not read the prototype config.json fallback", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadConfig } = await import("../cli/core/config");
    const { loadEffectiveConfig } = await import("../cli/core/user-config");
    const repoConfig = await loadConfig(fixture.repoRoot);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(
      join(fixture.agentsDir, "drwn", "config.json"),
      JSON.stringify({ version: 1, analyzer: { apiUrl: "https://prototype.test" }, optional: {} }),
    );

    const loaded = await loadEffectiveConfig(repoConfig, fixture.agentsDir);

    expect(loaded.userConfigPath).toBeNull();
    expect(loaded.config).toEqual(repoConfig);
  });
});
