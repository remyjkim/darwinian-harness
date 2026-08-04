// ABOUTME: Encodes write-record paths independently of physical HOME and AGENTS_DIR placement.
// ABOUTME: Keeps machine Store ownership portable when AGENTS_DIR is outside the user home.

import { isAbsolute, join, relative } from "node:path";

const MACHINE_AGENTS_PREFIX = ".agents";

function containedRelative(root: string, absolutePath: string): string | null {
  const value = relative(root, absolutePath);
  if (value === "") return "";
  if (isAbsolute(value) || value === ".." || value.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    return null;
  }
  return value.replace(/\\/g, "/");
}

export function recordProjectionPath(
  scopeRoot: string,
  absolutePath: string,
  machineAgentsDir?: string,
): string {
  if (machineAgentsDir) {
    const agentsRelative = containedRelative(machineAgentsDir, absolutePath);
    if (agentsRelative !== null) {
      return agentsRelative ? `${MACHINE_AGENTS_PREFIX}/${agentsRelative}` : MACHINE_AGENTS_PREFIX;
    }
  }
  const scopeRelative = containedRelative(scopeRoot, absolutePath);
  if (scopeRelative === null || scopeRelative === "") {
    throw new Error(`Projection path is outside its ownership roots: ${absolutePath}`);
  }
  return scopeRelative;
}

export function resolveMachineProjectionPath(
  homeDir: string,
  agentsDir: string,
  recordedPath: string,
): string {
  if (recordedPath === MACHINE_AGENTS_PREFIX) return agentsDir;
  if (recordedPath.startsWith(`${MACHINE_AGENTS_PREFIX}/`)) {
    return join(agentsDir, recordedPath.slice(MACHINE_AGENTS_PREFIX.length + 1));
  }
  return join(homeDir, recordedPath);
}
