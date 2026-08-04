// ABOUTME: Tests the target descriptor table that centralizes target names, surfaces, and runtimes.
// ABOUTME: Locks in the Cowork surface annotation on the claude target and descriptor selection.

import { describe, expect, test } from "bun:test";
import {
  ALL_TARGET_NAMES,
  descriptorsFor,
  getTargetDescriptor,
  isTargetName,
} from "../cli/core/targets";
import type { CanonicalConfig } from "../cli/core/types";

function targetsConfig(enabled: Partial<Record<"claude" | "codex" | "cursor" | "opencode", boolean>>): Pick<CanonicalConfig, "targets"> {
  const base = { configPath: "x", format: "json-merge" as const, mcpKey: "mcpServers" };
  return {
    targets: {
      claude: { ...base, enabled: enabled.claude ?? false },
      codex: { ...base, format: "toml-merge", enabled: enabled.codex ?? false },
      cursor: { ...base, format: "json-standalone", enabled: enabled.cursor ?? false },
      opencode: { ...base, mcpKey: "mcp", enabled: enabled.opencode ?? false },
    },
  };
}

describe("target descriptors", () => {
  test("should annotate the claude target with the cowork surface", () => {
    const claude = getTargetDescriptor("claude");
    expect(claude.surfaces).toContain("claude-code");
    expect(claude.surfaces).toContain("cowork");
    expect(claude.hookRuntime).toBe("claude-code");
    expect(claude.mcpFormat).toBe("json-merge");
  });

  test("should not annotate codex or cursor with the cowork surface", () => {
    expect(getTargetDescriptor("codex").surfaces).not.toContain("cowork");
    expect(getTargetDescriptor("cursor").surfaces).not.toContain("cowork");
    expect(getTargetDescriptor("cursor").hookRuntime).toBe("cursor");
  });

  test("should expose all target names", () => {
    expect(ALL_TARGET_NAMES).toEqual(["claude", "codex", "cursor", "opencode"]);
  });

  test("opencode target descriptor", () => {
    const opencode = getTargetDescriptor("opencode");
    expect(opencode.surfaces).toEqual(["opencode"]);
    expect(opencode.mcpFormat).toBe("json-merge");
    expect(opencode.hookRuntime).toBe("opencode");
    expect(opencode.skillSurfaces).toEqual(["opencode"]);
  });

  test("should recognize valid target names and reject others", () => {
    expect(isTargetName("claude")).toBe(true);
    expect(isTargetName("cursor")).toBe(true);
    expect(isTargetName("cowork")).toBe(false);
    expect(isTargetName("nonsense")).toBe(false);
  });

  test("targets declare which skill surface directories their harness reads", () => {
    expect(getTargetDescriptor("claude").skillSurfaces).toEqual(["claude"]);
    expect(getTargetDescriptor("codex").skillSurfaces).toEqual(["codex"]);
    expect(getTargetDescriptor("cursor").skillSurfaces).toEqual(["claude", "codex"]);
  });

  test("descriptorsFor should return only enabled targets", () => {
    const selected = descriptorsFor(targetsConfig({ claude: true, codex: false, cursor: true }));
    expect(selected.map((descriptor) => descriptor.name)).toEqual(["claude", "cursor"]);
  });

  test("descriptorsFor should honor an explicit target filter", () => {
    const selected = descriptorsFor(targetsConfig({ claude: true, codex: true, cursor: true }), "codex");
    expect(selected.map((descriptor) => descriptor.name)).toEqual(["codex"]);
  });
});
