// ABOUTME: Resolves complete deployed Worker cloud profile tuples from one strict selector.
// ABOUTME: Rejects partial endpoint overrides and derives a stable digest for state isolation.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { DrwnError } from "../errors";
import { managementContract } from "./contracts";

const MAX_LOCAL_PROFILE_BYTES = 65_536;
const RETIRED_PARTIAL_OVERRIDES = [
  "DRWN_DAH_HUB_URL",
  "DRWN_DAH_RESOURCE",
  "DRWN_STUDIO_API_URL",
  "DRWN_STUDIO_WEB_URL",
] as const;

const requestedScopesSchema = z.tuple([
  z.literal("openid"),
  z.literal("email"),
  z.literal("offline_access"),
  z.literal("dah:management.delegate"),
]);

const localProfileSchema = z.object({
  profileId: z.literal("local"),
  apiOrigin: z.string(),
  webOrigin: z.string(),
  authHubOrigin: z.string(),
  issuer: z.string(),
  resource: z.string(),
  clientId: z.literal("drwn-cli"),
  requestedScopes: requestedScopesSchema,
}).strict();

export type CloudProfileId = "production" | "staging" | "local";

export interface CloudProfile {
  profileId: CloudProfileId;
  apiOrigin: string;
  webOrigin: string;
  authHubOrigin: string;
  issuer: string;
  resource: string;
  clientId: "drwn-cli";
  requestedScopes: readonly ["openid", "email", "offline_access", "dah:management.delegate"];
  profileDigest: string;
}

type CloudProfileEnv = Record<string, string | undefined>;
type ProfileTuple = Omit<CloudProfile, "profileDigest">;

function invalidProfile(message: string): DrwnError {
  return new DrwnError("CLOUD_PROFILE_INVALID", message);
}

function assertHttpsOrigin(value: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw invalidProfile(`Cloud profile ${field} is invalid.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.origin !== value ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw invalidProfile(`Cloud profile ${field} must be an HTTPS origin.`);
  }
}

function assertTuple(tuple: ProfileTuple): void {
  assertHttpsOrigin(tuple.apiOrigin, "apiOrigin");
  assertHttpsOrigin(tuple.webOrigin, "webOrigin");
  assertHttpsOrigin(tuple.authHubOrigin, "authHubOrigin");
  assertHttpsOrigin(tuple.resource, "resource");
  const expectedIssuer = new URL("/api/auth", tuple.authHubOrigin).href;
  if (tuple.issuer !== expectedIssuer) {
    throw invalidProfile("Cloud profile issuer does not match its Auth Hub origin.");
  }
}

function canonicalTuple(tuple: ProfileTuple): string {
  return JSON.stringify({
    profileId: tuple.profileId,
    apiOrigin: tuple.apiOrigin,
    webOrigin: tuple.webOrigin,
    authHubOrigin: tuple.authHubOrigin,
    issuer: tuple.issuer,
    resource: tuple.resource,
    clientId: tuple.clientId,
    requestedScopes: tuple.requestedScopes,
  });
}

function completeProfile(tuple: ProfileTuple): CloudProfile {
  assertTuple(tuple);
  return Object.freeze({
    ...tuple,
    requestedScopes: Object.freeze([...tuple.requestedScopes]) as CloudProfile["requestedScopes"],
    profileDigest: createHash("sha256").update(canonicalTuple(tuple)).digest("hex"),
  });
}

function readLocalProfile(path: string | undefined): ProfileTuple {
  if (!path || !isAbsolute(path)) {
    throw invalidProfile("The local cloud profile requires one absolute DRWN_CLOUD_PROFILE_FILE path.");
  }
  let bytes: Buffer;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_LOCAL_PROFILE_BYTES) {
      throw invalidProfile("The local cloud profile file must be a bounded regular file, not a symlink.");
    }
    bytes = readFileSync(path);
    const after = lstatSync(path);
    if (
      !after.isFile() || after.isSymbolicLink() ||
      before.dev !== after.dev || before.ino !== after.ino ||
      bytes.byteLength !== after.size
    ) {
      throw invalidProfile("The local cloud profile file changed while being read.");
    }
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw invalidProfile("The local cloud profile file is unavailable or unsafe.");
  }

  try {
    return localProfileSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw invalidProfile("The local cloud profile file does not match the strict schema.");
  }
}

export function resolveCloudProfile(env: CloudProfileEnv = process.env): CloudProfile {
  if (RETIRED_PARTIAL_OVERRIDES.some((name) => env[name] !== undefined)) {
    throw invalidProfile("Partial cloud endpoint overrides are retired; select one complete cloud profile.");
  }

  const selector = env.DRWN_CLOUD_PROFILE ?? "production";
  const file = env.DRWN_CLOUD_PROFILE_FILE;
  if (selector === "production" || selector === "staging") {
    if (file !== undefined) {
      throw invalidProfile("DRWN_CLOUD_PROFILE_FILE is valid only with DRWN_CLOUD_PROFILE=local.");
    }
    return completeProfile(managementContract.profiles[selector]);
  }
  if (selector === "local") return completeProfile(readLocalProfile(file));
  throw invalidProfile("DRWN_CLOUD_PROFILE must be production, staging, or local.");
}
