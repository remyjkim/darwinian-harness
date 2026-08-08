// ABOUTME: Loads the packaged Worker source identity used by qualification receipts.
// ABOUTME: Falls back only when the generated member is absent and marks source execution non-qualifying.

import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const BUILD_IDENTITY_KEYS = ["schema", "schemaVersion", "sourceCommit", "version"] as const;
const FULL_LOWERCASE_GIT_SHA = /^[a-f0-9]{40}$/;
const TARGET_RELEASE_VERSION = "1.2.0";

export const DEVELOPMENT_SOURCE_COMMIT = "0".repeat(40);

export interface BuildIdentityFileV1 {
  schema: "darwinian.worker.build-identity";
  schemaVersion: 1;
  version: string;
  sourceCommit: string;
}

export type RuntimeBuildIdentity = BuildIdentityFileV1 & {
  kind: "packaged" | "development";
  qualificationEligible: boolean;
};

export class BuildIdentityError extends Error {
  readonly code = "BUILD_IDENTITY_INVALID";

  constructor() {
    super("BUILD_IDENTITY_INVALID");
    this.name = "BuildIdentityError";
  }
}

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function assertPackageVersion(value: unknown): asserts value is string {
  if (typeof value !== "string" || semver.valid(value) !== value) throw new BuildIdentityError();
}

export function parsePackagedBuildIdentity(
  value: unknown,
  packageVersion: string,
): RuntimeBuildIdentity {
  assertPackageVersion(packageVersion);
  if (
    !isExactObject(value, BUILD_IDENTITY_KEYS) ||
    value.schema !== "darwinian.worker.build-identity" ||
    value.schemaVersion !== 1 ||
    value.version !== packageVersion ||
    typeof value.sourceCommit !== "string" ||
    !FULL_LOWERCASE_GIT_SHA.test(value.sourceCommit) ||
    value.sourceCommit === DEVELOPMENT_SOURCE_COMMIT
  ) {
    throw new BuildIdentityError();
  }

  return {
    kind: "packaged",
    schema: value.schema,
    schemaVersion: value.schemaVersion,
    version: value.version,
    sourceCommit: value.sourceCommit,
    qualificationEligible: value.version === TARGET_RELEASE_VERSION,
  };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "ENOENT";
}

function developmentIdentity(version: string): RuntimeBuildIdentity {
  return {
    kind: "development",
    schema: "darwinian.worker.build-identity",
    schemaVersion: 1,
    version,
    sourceCommit: DEVELOPMENT_SOURCE_COMMIT,
    qualificationEligible: false,
  };
}

function sourceCheckoutMarker(packagePath: string | URL): string {
  const path = packagePath instanceof URL ? fileURLToPath(packagePath) : packagePath;
  return join(dirname(path), ".git");
}

async function isSourceCheckout(packagePath: string | URL): Promise<boolean> {
  try {
    await lstat(sourceCheckoutMarker(packagePath));
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw new BuildIdentityError();
  }
}

export interface LoadBuildIdentityOptions {
  packagePath?: string | URL;
  identityPath?: string | URL;
  readText?: (path: string | URL) => Promise<string>;
}

export async function loadBuildIdentity(
  options: LoadBuildIdentityOptions = {},
): Promise<RuntimeBuildIdentity> {
  const readText = options.readText ?? ((path: string | URL) => readFile(path, "utf8"));
  const packagePath = options.packagePath ?? new URL("../../package.json", import.meta.url);
  const identityPath = options.identityPath ?? new URL("../generated/build-identity.json", import.meta.url);

  let packageMetadata: unknown;
  try {
    packageMetadata = JSON.parse(await readText(packagePath));
  } catch {
    throw new BuildIdentityError();
  }
  if (typeof packageMetadata !== "object" || packageMetadata === null || Array.isArray(packageMetadata)) {
    throw new BuildIdentityError();
  }
  const packageVersion = (packageMetadata as Record<string, unknown>).version;
  assertPackageVersion(packageVersion);

  // The generated member is deliberately ignored by Git and may remain after a
  // local pack. A source checkout must never inherit that artifact's release
  // eligibility; only an installed package without its own Git metadata may.
  if (await isSourceCheckout(packagePath)) return developmentIdentity(packageVersion);

  let identityText: string;
  try {
    identityText = await readText(identityPath);
  } catch (error) {
    if (!isMissing(error)) throw new BuildIdentityError();
    return developmentIdentity(packageVersion);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(identityText);
  } catch {
    throw new BuildIdentityError();
  }
  return parsePackagedBuildIdentity(parsed, packageVersion);
}
