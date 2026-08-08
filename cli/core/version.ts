// ABOUTME: Loads the CLI version from adjacent package metadata as the single current-release identity.
// ABOUTME: Fails loudly when packaged metadata is missing, malformed, or not strict semantic versioning.

import { readFileSync } from "node:fs";
import semver from "semver";

const INVALID_PACKAGE_METADATA = "Worker package metadata is unavailable or invalid";

export function readRuntimeVersion(packagePath: string | URL): string {
  try {
    const metadata = JSON.parse(readFileSync(packagePath, "utf8")) as unknown;
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      throw new Error(INVALID_PACKAGE_METADATA);
    }
    const version = (metadata as Record<string, unknown>).version;
    if (typeof version !== "string" || semver.valid(version) !== version) {
      throw new Error(INVALID_PACKAGE_METADATA);
    }
    return version;
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_PACKAGE_METADATA) throw error;
    throw new Error(INVALID_PACKAGE_METADATA, { cause: error });
  }
}

export const DRWN_VERSION = readRuntimeVersion(new URL("../../package.json", import.meta.url));
