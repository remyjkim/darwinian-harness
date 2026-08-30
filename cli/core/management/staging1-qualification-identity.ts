// ABOUTME: Admits the exact I321 staging-1 qualification identity artifact and hostile vectors.
// ABOUTME: Constructs one hidden process-local auth profile without using public profile selection.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { z } from "zod";
import type { CliAuthProfile } from "../auth/profile";
import { DrwnError } from "../errors";

const CONTRACT_SHA256 = "1dbde33ab10d12f31ee9581984cb37c88a9363da2af1518402e62546f582b0b6";
const MANIFEST_SHA256 = "d5ba47199320b282e2938f80e56ccb55fc9618d57e27114fbc219bea2094a995";
const VECTORS_SHA256 = "dc4580b5cddc8d5a493c14e29f6211cb7c2389fc5e658a963683c3a24ac3f4be";
const README_SHA256 = "abdcc432164c4861ef20b008a9283239d704b6dd0f9b0a692f154b6b87ea8bc7";

const requestedScopesSchema = z.tuple([
  z.literal("openid"),
  z.literal("email"),
  z.literal("offline_access"),
  z.literal("dah:management.delegate"),
]);

const identitySchema = z.object({
  schema: z.literal("cl.dah.staging1-qualification-identity.v1"),
  environmentId: z.literal("staging-1"),
  authHubOrigin: z.literal("https://auth-staging-1.darwinian.dev"),
  issuer: z.literal("https://auth-staging-1.darwinian.dev/api/auth"),
  jwksUrl: z.literal("https://auth-staging-1.darwinian.dev/api/auth/jwks"),
  resource: z.literal("https://api-staging-1.darwinian.dev"),
  apiOrigin: z.literal("https://api-staging-1.darwinian.dev"),
  webOrigin: z.literal("https://foundry-staging-1.darwinian.dev"),
  approvalOrigin: z.literal("https://auth-staging-1.darwinian.dev"),
  clientId: z.literal("drwn-cli"),
  requestedScopes: requestedScopesSchema,
}).strict();

const manifestSchema = z.object({
  schema: z.literal("cl.dah.staging1-qualification-identity-artifact-manifest.v1"),
  schemaVersion: z.literal(1),
  sourceAuthority: z.literal("containing_git_commit"),
  contractFile: z.literal("contract.json"),
  contractSha256: z.literal(CONTRACT_SHA256),
  contractBytes: z.literal(637),
  vectorsFile: z.literal("vectors.json"),
  vectorsSha256: z.literal(VECTORS_SHA256),
  vectorsBytes: z.literal(16_419),
  vectorCount: z.literal(20),
  positiveVectorCount: z.literal(1),
  hostileVectorCount: z.literal(19),
}).strict();

const vectorSchema = z.object({
  name: z.string().min(1),
  expected: z.enum(["identity", "refuse"]),
  candidate: z.unknown(),
}).strict();

const lockSchema = z.object({
  schema: z.literal("dah.staging1-qualification-identity-contract-lock"),
  schemaVersion: z.literal(1),
  servicesRepository: z.literal("curation-labs/darwinian-services"),
  sourceCommit: z.literal("d0156761c19f4e7dc5a63914a1117f298b535c37"),
  contractSha256: z.literal(CONTRACT_SHA256),
  manifestSha256: z.literal(MANIFEST_SHA256),
  vectorsSha256: z.literal(VECTORS_SHA256),
  readmeSha256: z.literal(README_SHA256),
  vectorCount: z.literal(20),
  positiveVectorCount: z.literal(1),
  hostileVectorCount: z.literal(19),
}).strict();

export type Staging1QualificationIdentity = z.infer<typeof identitySchema>;

function refusal(): never {
  throw new DrwnError(
    "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    "Staging Community qualification refused.",
  );
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function parseStaging1QualificationIdentity(
  candidate: unknown,
): Readonly<Staging1QualificationIdentity> {
  try {
    return deepFreeze(identitySchema.parse(candidate));
  } catch {
    refusal();
  }
}

function loadAuthority(): Readonly<Staging1QualificationIdentity> {
  try {
    const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const authorityRoot = join(
      packageRoot,
      "registry",
      "contracts",
      "staging1-qualification-identity.v1",
    );
    const contractBytes = readFileSync(join(authorityRoot, "contract.json"));
    const manifestBytes = readFileSync(join(authorityRoot, "manifest.json"));
    const vectorsBytes = readFileSync(join(authorityRoot, "vectors.json"));
    const readmeBytes = readFileSync(join(authorityRoot, "README.md"));
    const lock = lockSchema.parse(JSON.parse(readFileSync(
      join(packageRoot, "cli", "generated", "dah-staging1-qualification-identity-contract-lock.json"),
      "utf8",
    )));
    if (
      sha256(contractBytes) !== lock.contractSha256 ||
      sha256(manifestBytes) !== lock.manifestSha256 ||
      sha256(vectorsBytes) !== lock.vectorsSha256 ||
      sha256(readmeBytes) !== lock.readmeSha256
    ) refusal();

    const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (
      manifest.contractBytes !== contractBytes.byteLength ||
      manifest.vectorsBytes !== vectorsBytes.byteLength ||
      manifest.vectorCount !== lock.vectorCount ||
      manifest.positiveVectorCount !== lock.positiveVectorCount ||
      manifest.hostileVectorCount !== lock.hostileVectorCount
    ) refusal();

    const identity = parseStaging1QualificationIdentity(
      JSON.parse(contractBytes.toString("utf8")),
    );
    const vectors = z.array(vectorSchema).length(lock.vectorCount).parse(
      JSON.parse(vectorsBytes.toString("utf8")),
    );
    const positives = vectors.filter(({ expected }) => expected === "identity");
    const hostile = vectors.filter(({ expected }) => expected === "refuse");
    if (
      positives.length !== lock.positiveVectorCount ||
      hostile.length !== lock.hostileVectorCount ||
      vectors.some(({ expected, candidate }) =>
        identitySchema.safeParse(candidate).success !== (expected === "identity"))
    ) refusal();
    return identity;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    refusal();
  }
}

let cachedIdentity: Readonly<Staging1QualificationIdentity> | undefined;

export function loadStaging1QualificationIdentity(): Readonly<Staging1QualificationIdentity> {
  return cachedIdentity ??= loadAuthority();
}

export function staging1QualificationCliProfile(
  candidate: unknown = loadStaging1QualificationIdentity(),
): Readonly<CliAuthProfile> {
  const identity = parseStaging1QualificationIdentity(candidate);
  return Object.freeze({
    clientId: identity.clientId,
    resource: identity.resource,
    scope: identity.requestedScopes.join(" "),
    hubOrigin: identity.authHubOrigin,
    issuer: identity.issuer,
    redirectUri: "http://127.0.0.1/callback",
    apiOrigin: identity.apiOrigin,
    webOrigin: identity.webOrigin,
    cloudProfileId: "staging",
    profileDigest: CONTRACT_SHA256,
  });
}
