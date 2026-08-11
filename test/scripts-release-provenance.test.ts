// ABOUTME: Proves release provenance joins one strict dry-run receipt, tag authorization, run, artifact, and tarball.
// ABOUTME: Rejects ambiguous schemas, stale main, reruns, renamed/expired artifacts, and every tuple mismatch.

import { describe, expect, test } from "bun:test";
import {
  RELEASE_ARTIFACT_NAME,
  createReleaseCandidateReceipt,
  parseReleaseCandidateReceipt,
  parseRecoveryAuthorizationReceipt,
  parseReleaseTagAuthorization,
  verifyRecoveryReleaseProvenance,
  verifyReleaseProvenance,
  type ReleaseCandidateReceiptV1,
} from "../scripts/release/provenance";

const COMMIT = "a".repeat(40);
const DIGEST = `sha256:${"b".repeat(64)}`;
const INTEGRITY = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;

function receiptObject(): ReleaseCandidateReceiptV1 {
  return {
    schema: "darwinian.worker.release-candidate",
    schemaVersion: 1,
    createdAt: "2026-08-08T00:00:00.000Z",
    workflow: {
      path: ".github/workflows/release.yml",
      runId: 123,
      runAttempt: 1,
      runUrl: "https://github.com/remyjkim/darwinian-worker/actions/runs/123",
      event: "workflow_dispatch",
      ref: "refs/heads/main",
      sourceCommit: COMMIT,
    },
    package: { name: "darwinian", version: "1.3.0" },
    build: { version: "1.3.0", sourceCommit: COMMIT },
    tar: {
      filename: "darwinian-1.3.0.tgz",
      byteLength: 12345,
      sha1: "c".repeat(40),
      sha256: "d".repeat(64),
      integrity: INTEGRITY,
    },
  };
}

function annotation(overrides: Record<string, string | number> = {}): string {
  const values = {
    schema: "darwinian.worker.release-authorization",
    schema_version: 1,
    version: "1.3.0",
    dry_run_run_id: 123,
    dry_run_run_attempt: 1,
    artifact_id: 456,
    artifact_digest: DIGEST,
    ...overrides,
  };
  return [
    "Darwinian Worker CLI v1.3.0",
    "",
    "-----BEGIN DARWINIAN WORKER RELEASE AUTHORIZATION-----",
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    "-----END DARWINIAN WORKER RELEASE AUTHORIZATION-----",
  ].join("\n");
}

function validInput() {
  return {
    receiptText: JSON.stringify(receiptObject()),
    tagAnnotation: annotation(),
    tag: { name: "v1.3.0", type: "tag" as const, peeledCommit: COMMIT },
    checkoutCommit: COMMIT,
    originMainCommit: COMMIT,
    run: {
      id: 123,
      attempt: 1,
      url: "https://github.com/remyjkim/darwinian-worker/actions/runs/123",
      workflowPath: ".github/workflows/release.yml",
      event: "workflow_dispatch",
      headSha: COMMIT,
      conclusion: "success",
    },
    jobs: [
      { name: "Validate release commit", conclusion: "success" },
      { name: "Dry run complete", conclusion: "success" },
      { name: "Publish to npm", conclusion: "skipped" },
      { name: "Smoke install (macos)", conclusion: "skipped" },
      { name: "GitHub Release", conclusion: "skipped" },
    ],
    artifacts: [{ id: 456, name: RELEASE_ARTIFACT_NAME, digest: DIGEST, expired: false, runId: 123 }],
    artifact: {
      packageName: "darwinian",
      version: "1.3.0",
      sourceCommit: COMMIT,
      filename: "darwinian-1.3.0.tgz",
      byteLength: 12345,
      sha1: "c".repeat(40),
      sha256: "d".repeat(64),
      integrity: INTEGRITY,
      members: [],
    },
  };
}

describe("release candidate receipt parser", () => {
  test("constructs a canonical receipt only from a qualified artifact and exact workflow context", () => {
    const input = validInput();
    const text = createReleaseCandidateReceipt({
      artifact: input.artifact,
      createdAt: "2026-08-08T00:00:00.000Z",
      runId: 123,
      runAttempt: 1,
      runUrl: "https://github.com/remyjkim/darwinian-worker/actions/runs/123",
      ref: "refs/heads/main",
      sourceCommit: COMMIT,
    });
    expect(text).toBe(`${JSON.stringify(receiptObject())}\n`);
    expect(parseReleaseCandidateReceipt(text)).toEqual(receiptObject());
    expect(() => createReleaseCandidateReceipt({
      artifact: input.artifact,
      createdAt: "2026-08-08T00:00:00.000Z",
      runId: 123,
      runAttempt: 1,
      runUrl: "https://github.com/remyjkim/darwinian-worker/actions/runs/123",
      ref: "refs/heads/main",
      sourceCommit: "f".repeat(40),
    })).toThrow();
  });

  test("accepts the exact candidate schema", () => {
    expect(parseReleaseCandidateReceipt(JSON.stringify(receiptObject()))).toEqual(receiptObject());
  });

  test.each([
    ["unknown root key", () => JSON.stringify({ ...receiptObject(), extra: true })],
    ["unknown nested key", () => JSON.stringify({ ...receiptObject(), tar: { ...receiptObject().tar, extra: true } })],
    ["duplicate key", () => JSON.stringify(receiptObject()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')],
    ["bad SHA", () => JSON.stringify({ ...receiptObject(), build: { version: "1.3.0", sourceCommit: "A".repeat(40) } })],
    ["bad digest", () => JSON.stringify({ ...receiptObject(), tar: { ...receiptObject().tar, sha256: "d".repeat(63) } })],
    ["bad timestamp", () => JSON.stringify({ ...receiptObject(), createdAt: "2026-08-08" })],
    ["bad URL", () => JSON.stringify({ ...receiptObject(), workflow: { ...receiptObject().workflow, runUrl: "https://example.test/?token=SECRET" } })],
  ])("rejects %s", (_label, build) => {
    expect(() => parseReleaseCandidateReceipt(build())).toThrow();
  });
});

describe("annotated tag authorization parser", () => {
  test("accepts the exact closed machine block", () => {
    expect(parseReleaseTagAuthorization(annotation())).toEqual({
      schema: "darwinian.worker.release-authorization",
      schemaVersion: 1,
      version: "1.3.0",
      dryRunRunId: 123,
      dryRunRunAttempt: 1,
      artifactId: 456,
      artifactDigest: DIGEST,
    });
  });

  test.each([
    ["unknown key", () => annotation({ unexpected: "value" })],
    ["duplicate key", () => annotation().replace("artifact_id=456", "artifact_id=456\nartifact_id=456")],
    ["missing key", () => annotation().replace(`artifact_digest=${DIGEST}\n`, "")],
    ["bad digest", () => annotation({ artifact_digest: "sha256:bad" })],
    ["bad numeric identity", () => annotation({ dry_run_run_id: 0 })],
    ["multiple blocks", () => `${annotation()}\n${annotation()}`],
  ])("rejects %s", (_label, build) => {
    expect(() => parseReleaseTagAuthorization(build())).toThrow();
  });
});

describe("release recovery authorization parser", () => {
  const receipt = {
    schema: "darwinian.worker.release-recovery-authorization",
    schemaVersion: 1,
    authorizedAt: "2026-08-08T00:00:00.000Z",
    tag: "v1.3.0",
    failedRunId: 789,
    action: "verify_and_repair_metadata",
  } as const;

  test("accepts only the exact non-publishing recovery authority", () => {
    expect(parseRecoveryAuthorizationReceipt(JSON.stringify(receipt))).toEqual(receipt);
    for (const invalid of [
      { ...receipt, extra: true },
      { ...receipt, tag: "v1.2.1" },
      { ...receipt, failedRunId: 0 },
      { ...receipt, action: "publish" },
      { ...receipt, authorizedAt: "2026-08-08" },
    ]) {
      expect(() => parseRecoveryAuthorizationReceipt(JSON.stringify(invalid))).toThrow();
    }
  });
});

describe("exact release provenance join", () => {
  test("accepts one immutable dry-run/tag/run/artifact/tar tuple", () => {
    const result = verifyReleaseProvenance(validInput());
    expect(result).toEqual({ version: "1.3.0", sourceCommit: COMMIT, runId: 123, artifactId: 456, artifactDigest: DIGEST });
  });

  test("recovery observes but does not fabricate equality with a later origin/main", () => {
    const input = validInput();
    input.originMainCommit = "e".repeat(40);
    expect(verifyRecoveryReleaseProvenance(input)).toEqual({
      version: "1.3.0",
      sourceCommit: COMMIT,
      runId: 123,
      artifactId: 456,
      artifactDigest: DIGEST,
    });
    expect(() => verifyReleaseProvenance(input)).toThrow();
    input.originMainCommit = "not-a-commit";
    expect(() => verifyRecoveryReleaseProvenance(input)).toThrow();
  });

  test.each([
    ["lightweight tag", (input: ReturnType<typeof validInput>) => { input.tag.type = "commit" as never; }],
    ["peeled tag mismatch", (input: ReturnType<typeof validInput>) => { input.tag.peeledCommit = "e".repeat(40); }],
    ["checkout mismatch", (input: ReturnType<typeof validInput>) => { input.checkoutCommit = "e".repeat(40); }],
    ["main movement", (input: ReturnType<typeof validInput>) => { input.originMainCommit = "e".repeat(40); }],
    ["rerun attempt mismatch", (input: ReturnType<typeof validInput>) => { input.run.attempt = 2; }],
    ["wrong run id", (input: ReturnType<typeof validInput>) => { input.run.id = 124; }],
    ["wrong run URL", (input: ReturnType<typeof validInput>) => { input.run.url += "?attempt=1"; }],
    ["wrong workflow", (input: ReturnType<typeof validInput>) => { input.run.workflowPath = "other.yml"; }],
    ["wrong event", (input: ReturnType<typeof validInput>) => { input.run.event = "push"; }],
    ["failed run", (input: ReturnType<typeof validInput>) => { input.run.conclusion = "failure"; }],
    ["missing exact job", (input: ReturnType<typeof validInput>) => { input.jobs = input.jobs.filter((job) => job.name !== "Dry run complete"); }],
    ["failed exact job", (input: ReturnType<typeof validInput>) => { input.jobs.find((job) => job.name === "Dry run complete")!.conclusion = "failure"; }],
    ["mutation job ran", (input: ReturnType<typeof validInput>) => { input.jobs.find((job) => job.name === "Publish to npm")!.conclusion = "success"; }],
    ["expired artifact", (input: ReturnType<typeof validInput>) => { input.artifacts[0]!.expired = true; }],
    ["renamed artifact", (input: ReturnType<typeof validInput>) => { input.artifacts[0]!.name = "renamed"; }],
    ["multiple artifacts", (input: ReturnType<typeof validInput>) => { input.artifacts.push({ ...input.artifacts[0]!, id: 457 }); }],
    ["artifact id mismatch", (input: ReturnType<typeof validInput>) => { input.artifacts[0]!.id = 457; }],
    ["artifact run mismatch", (input: ReturnType<typeof validInput>) => { input.artifacts[0]!.runId = 124; }],
    ["artifact digest mismatch", (input: ReturnType<typeof validInput>) => { input.artifacts[0]!.digest = `sha256:${"f".repeat(64)}`; }],
    ["tar filename mismatch", (input: ReturnType<typeof validInput>) => { input.artifact.filename = "other.tgz"; }],
    ["tar digest mismatch", (input: ReturnType<typeof validInput>) => { input.artifact.sha256 = "f".repeat(64); }],
    ["build tuple mismatch", (input: ReturnType<typeof validInput>) => { input.artifact.sourceCommit = "f".repeat(40); }],
  ])("rejects %s", (_label, mutate) => {
    const input = validInput();
    mutate(input);
    expect(() => verifyReleaseProvenance(input)).toThrow();
  });
});
