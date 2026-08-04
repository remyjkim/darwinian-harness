// ABOUTME: Single source of truth for downstream target names and their surface/runtime metadata.
// ABOUTME: Replaces scattered target-name string branches and carries Cowork surface annotations.

import type { Runtime } from "./hook-policy/types";
import type { CanonicalConfig, TargetName } from "./types";

export type Surface = "claude-code" | "cowork" | "codex" | "cursor" | "opencode";
export type McpFormat = "json-merge" | "toml-merge" | "json-standalone";
export type SkillSurfaceDir = "claude" | "codex" | "opencode";

export interface TargetDescriptor {
  name: TargetName;
  family: TargetName;
  surfaces: Surface[];
  mcpFormat: McpFormat;
  hookRuntime: Runtime | null;
  skillSurfaces: SkillSurfaceDir[];
}

export const DESCRIPTORS: Record<TargetName, TargetDescriptor> = {
  claude: {
    name: "claude",
    family: "claude",
    surfaces: ["claude-code", "cowork"],
    mcpFormat: "json-merge",
    hookRuntime: "claude-code",
    skillSurfaces: ["claude"],
  },
  codex: {
    name: "codex",
    family: "codex",
    surfaces: ["codex"],
    mcpFormat: "toml-merge",
    hookRuntime: "codex",
    skillSurfaces: ["codex"],
  },
  cursor: {
    name: "cursor",
    family: "cursor",
    surfaces: ["cursor"],
    mcpFormat: "json-standalone",
    hookRuntime: "cursor",
    skillSurfaces: ["claude", "codex"],
  },
  opencode: {
    name: "opencode",
    family: "opencode",
    surfaces: ["opencode"],
    mcpFormat: "json-merge",
    hookRuntime: "opencode",
    skillSurfaces: ["opencode"],
  },
};

export const ALL_TARGET_NAMES = Object.keys(DESCRIPTORS) as TargetName[];

export function isTargetName(value: string): value is TargetName {
  return Object.prototype.hasOwnProperty.call(DESCRIPTORS, value);
}

export function getTargetDescriptor(name: TargetName): TargetDescriptor {
  return DESCRIPTORS[name];
}

export function descriptorsFor(
  config: Pick<CanonicalConfig, "targets">,
  target?: TargetName,
): TargetDescriptor[] {
  return ALL_TARGET_NAMES.filter((name) => (target ? name === target : true))
    .filter((name) => config.targets[name]?.enabled)
    .map((name) => DESCRIPTORS[name]);
}
