// ABOUTME: Pins the exact reviewed I321 staging-1 qualification identity artifact in Worker.
// ABOUTME: Proves all owner hostile vectors refuse and the hidden profile uses only owner fields.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REQUIRED_RELEASE_MEMBERS } from "../scripts/release/artifact-contract";
import {
  loadStaging1QualificationIdentity,
  parseStaging1QualificationIdentity,
  staging1QualificationCliProfile,
} from "../cli/core/management/staging1-qualification-identity";

const root = join(import.meta.dir, "..");
const artifactRoot = join(root, "registry", "contracts", "staging1-qualification-identity.v1");
const expected = {
  "contract.json": "1dbde33ab10d12f31ee9581984cb37c88a9363da2af1518402e62546f582b0b6",
  "manifest.json": "d5ba47199320b282e2938f80e56ccb55fc9618d57e27114fbc219bea2094a995",
  "vectors.json": "dc4580b5cddc8d5a493c14e29f6211cb7c2389fc5e658a963683c3a24ac3f4be",
  "README.md": "abdcc432164c4861ef20b008a9283239d704b6dd0f9b0a692f154b6b87ea8bc7",
} as const;

describe("I321 staging-1 qualification identity authority", () => {
  test("vendors exact contract, manifest, vectors, guide, and reviewed-source lock", async () => {
    for (const [name, digest] of Object.entries(expected)) {
      const bytes = await readFile(join(artifactRoot, name));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(digest);
    }
    expect(JSON.parse(await readFile(join(
      root,
      "cli/generated/dah-staging1-qualification-identity-contract-lock.json",
    ), "utf8"))).toEqual({
      schema: "dah.staging1-qualification-identity-contract-lock",
      schemaVersion: 1,
      servicesRepository: "curation-labs/darwinian-services",
      sourceCommit: "d0156761c19f4e7dc5a63914a1117f298b535c37",
      contractSha256: expected["contract.json"],
      manifestSha256: expected["manifest.json"],
      vectorsSha256: expected["vectors.json"],
      readmeSha256: expected["README.md"],
      vectorCount: 20,
      positiveVectorCount: 1,
      hostileVectorCount: 19,
    });
  });

  test("accepts the one owner identity and refuses all nineteen hostile candidates", async () => {
    const vectors = JSON.parse(await readFile(join(artifactRoot, "vectors.json"), "utf8")) as Array<{
      name: string;
      expected: "identity" | "refuse";
      candidate: unknown;
    }>;
    expect(vectors).toHaveLength(20);
    for (const vector of vectors) {
      if (vector.expected === "identity") {
        expect(parseStaging1QualificationIdentity(vector.candidate), vector.name)
          .toEqual(loadStaging1QualificationIdentity());
      } else {
        expect(() => parseStaging1QualificationIdentity(vector.candidate), vector.name)
          .toThrow(expect.objectContaining({ code: "STAGING_COMMUNITY_QUALIFICATION_INVALID" }));
      }
    }
  });

  test("constructs the hidden process-local grant profile from the admitted tuple", () => {
    expect(staging1QualificationCliProfile()).toEqual({
      clientId: "drwn-cli",
      resource: "https://api-staging-1.darwinian.dev",
      scope: "openid email offline_access dah:management.delegate",
      hubOrigin: "https://auth-staging-1.darwinian.dev",
      issuer: "https://auth-staging-1.darwinian.dev/api/auth",
      redirectUri: "http://127.0.0.1/callback",
      apiOrigin: "https://api-staging-1.darwinian.dev",
      webOrigin: "https://foundry-staging-1.darwinian.dev",
      cloudProfileId: "staging",
      profileDigest: expected["contract.json"],
    });
  });

  test("requires every identity authority member in the release tar", () => {
    expect(REQUIRED_RELEASE_MEMBERS).toEqual(expect.arrayContaining([
      "cli/core/management/staging1-qualification-identity.ts",
      "cli/generated/dah-staging1-qualification-identity-contract-lock.json",
      "registry/contracts/staging1-qualification-identity.v1/contract.json",
      "registry/contracts/staging1-qualification-identity.v1/manifest.json",
      "registry/contracts/staging1-qualification-identity.v1/vectors.json",
      "registry/contracts/staging1-qualification-identity.v1/README.md",
    ]));
  });
});
