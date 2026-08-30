// ABOUTME: Requires Worker to consume the exact I321 OAuth/JWT interoperability artifact.
// ABOUTME: Prevents a locally reconstructed token, consent, audience, or scope fixture.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = join(
  root,
  "registry/contracts/staging1-qualification-auth-interoperability.v1",
);
const lockPath = join(
  root,
  "cli/generated/dah-staging1-qualification-auth-interoperability-lock.json",
);
const files = ["README.md", "contract.json", "manifest.json", "vectors.json"];
const digestField = {
  "README.md": "readmeSha256",
  "contract.json": "contractSha256",
  "manifest.json": "manifestSha256",
  "vectors.json": "vectorsSha256",
} as const;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("I321 staging-1 auth interoperability authority", () => {
  test("vendors every exact owner byte and locks the reviewed I321 source", () => {
    expect(existsSync(artifactRoot)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Record<string, unknown>;
    expect(lock).toEqual({
      schema: "dah.staging1-qualification-auth-interoperability-lock",
      schemaVersion: 1,
      servicesRepository: "curation-labs/darwinian-services",
      sourceCommit: "fe610873210153ced057047a8069cb8eaf94f27e",
      readmeSha256: "1c40d4d6c9dd9a5aa93048b59e6949766a44513d5413d8f8accb877265508794",
      contractSha256: "3345f6b4715b145d9156824c5025d835eb6d348946beeb849701d8bd033d1803",
      manifestSha256: "8bcc0608d29df1c3e628b51a177b8f0bebcdebe79ef5e8f4406ba99978c81788",
      vectorsSha256: "730633cea16a82663cf15e0b91ce545cce6f5b98ec88b8055874b6e0545b87f6",
      vectorCount: 11,
      acceptedVectorCount: 3,
      refusedVectorCount: 8,
    });
    for (const file of files) {
      const vendored = readFileSync(join(artifactRoot, file));
      expect(sha256(vendored), file).toBe(
        lock[digestField[file as keyof typeof digestField]] as string,
      );
    }
  });
});
