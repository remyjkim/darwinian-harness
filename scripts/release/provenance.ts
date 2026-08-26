// ABOUTME: Parses the closed dry-run receipt and annotated-tag authorization contracts.
// ABOUTME: Joins exact run, job, artifact, build, tar, tag, checkout, and current-main identities.

import type { QualifiedPackedArtifact } from "./artifact-contract";

export const RELEASE_ARTIFACT_NAME = "darwinian-worker-release-candidate";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const BEGIN_AUTHORIZATION = "-----BEGIN DARWINIAN WORKER RELEASE AUTHORIZATION-----";
const END_AUTHORIZATION = "-----END DARWINIAN WORKER RELEASE AUTHORIZATION-----";

export class ReleaseProvenanceError extends Error {
  constructor() {
    super("Release provenance validation failed.");
    this.name = "ReleaseProvenanceError";
  }
}

function fail(): never {
  throw new ReleaseProvenanceError();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function rejectDuplicateJsonKeys(text: string): void {
  const stack: Array<Set<string> | null> = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') break;
        index += 1;
      }
      if (index >= text.length) fail();
      let next = index + 1;
      while (/\s/.test(text[next] ?? "")) next += 1;
      if (text[next] === ":") {
        const objectKeys = stack.at(-1);
        if (!(objectKeys instanceof Set)) fail();
        let key: string;
        try {
          key = JSON.parse(text.slice(start, index + 1)) as string;
        } catch {
          fail();
        }
        if (objectKeys.has(key)) fail();
        objectKeys.add(key);
      }
      continue;
    }
    if (character === "{") stack.push(new Set());
    else if (character === "[") stack.push(null);
    else if (character === "}" || character === "]") stack.pop();
  }
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalIntegrity(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("sha512-")) return false;
  const encoded = value.slice("sha512-".length);
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length === 64 && bytes.toString("base64") === encoded;
}

export interface ReleaseCandidateReceiptV1 {
  schema: "darwinian.worker.release-candidate";
  schemaVersion: 1;
  createdAt: string;
  workflow: {
    path: ".github/workflows/release.yml";
    runId: number;
    runAttempt: number;
    runUrl: string;
    event: "workflow_dispatch";
    ref: "refs/heads/main";
    sourceCommit: string;
  };
  package: { name: "darwinian"; version: "1.4.2" };
  build: { version: "1.4.2"; sourceCommit: string };
  tar: {
    filename: "darwinian-1.4.2.tgz";
    byteLength: number;
    sha1: string;
    sha256: string;
    integrity: string;
  };
}

export function parseReleaseCandidateReceipt(text: string): ReleaseCandidateReceiptV1 {
  rejectDuplicateJsonKeys(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail();
  }
  if (!isObject(value) || !hasExactKeys(value, ["schema", "schemaVersion", "createdAt", "workflow", "package", "build", "tar"])) fail();
  if (value.schema !== "darwinian.worker.release-candidate" || value.schemaVersion !== 1 || !isCanonicalTimestamp(value.createdAt)) fail();

  const workflow = value.workflow;
  if (!isObject(workflow) || !hasExactKeys(workflow, ["path", "runId", "runAttempt", "runUrl", "event", "ref", "sourceCommit"])) fail();
  if (
    workflow.path !== ".github/workflows/release.yml" ||
    !isPositiveInteger(workflow.runId) ||
    !isPositiveInteger(workflow.runAttempt) ||
    workflow.runUrl !== `https://github.com/remyjkim/darwinian-worker/actions/runs/${workflow.runId}` ||
    workflow.event !== "workflow_dispatch" ||
    workflow.ref !== "refs/heads/main" ||
    typeof workflow.sourceCommit !== "string" || !FULL_SHA.test(workflow.sourceCommit)
  ) fail();

  const packageIdentity = value.package;
  if (!isObject(packageIdentity) || !hasExactKeys(packageIdentity, ["name", "version"]) ||
    packageIdentity.name !== "darwinian" || packageIdentity.version !== "1.4.2") fail();

  const build = value.build;
  if (!isObject(build) || !hasExactKeys(build, ["version", "sourceCommit"]) ||
    build.version !== "1.4.2" || typeof build.sourceCommit !== "string" || !FULL_SHA.test(build.sourceCommit)) fail();
  if (build.sourceCommit !== workflow.sourceCommit) fail();

  const tarball = value.tar;
  if (!isObject(tarball) || !hasExactKeys(tarball, ["filename", "byteLength", "sha1", "sha256", "integrity"])) fail();
  if (
    tarball.filename !== "darwinian-1.4.2.tgz" ||
    !isPositiveInteger(tarball.byteLength) ||
    typeof tarball.sha1 !== "string" || !SHA1.test(tarball.sha1) ||
    typeof tarball.sha256 !== "string" || !SHA256.test(tarball.sha256) ||
    !isCanonicalIntegrity(tarball.integrity)
  ) fail();
  return value as unknown as ReleaseCandidateReceiptV1;
}

export function createReleaseCandidateReceipt(input: {
  artifact: QualifiedPackedArtifact;
  createdAt: string;
  runId: number;
  runAttempt: number;
  runUrl: string;
  ref: string;
  sourceCommit: string;
}): string {
  if (
    input.artifact.packageName !== "darwinian" ||
    input.artifact.version !== "1.4.2" ||
    input.artifact.sourceCommit !== input.sourceCommit
  ) fail();
  const receipt: ReleaseCandidateReceiptV1 = {
    schema: "darwinian.worker.release-candidate",
    schemaVersion: 1,
    createdAt: input.createdAt,
    workflow: {
      path: ".github/workflows/release.yml",
      runId: input.runId,
      runAttempt: input.runAttempt,
      runUrl: input.runUrl,
      event: "workflow_dispatch",
      ref: input.ref as "refs/heads/main",
      sourceCommit: input.sourceCommit,
    },
    package: { name: "darwinian", version: "1.4.2" },
    build: { version: "1.4.2", sourceCommit: input.sourceCommit },
    tar: {
      filename: input.artifact.filename as "darwinian-1.4.2.tgz",
      byteLength: input.artifact.byteLength,
      sha1: input.artifact.sha1,
      sha256: input.artifact.sha256,
      integrity: input.artifact.integrity,
    },
  };
  const text = JSON.stringify(receipt);
  parseReleaseCandidateReceipt(text);
  return `${text}\n`;
}

export interface ReleaseTagAuthorizationV1 {
  schema: "darwinian.worker.release-authorization";
  schemaVersion: 1;
  version: "1.4.2";
  dryRunRunId: number;
  dryRunRunAttempt: number;
  artifactId: number;
  artifactDigest: string;
}

export function parseReleaseTagAuthorization(message: string): ReleaseTagAuthorizationV1 {
  const lines = message.split(/\r?\n/);
  const beginIndexes = lines.flatMap((line, index) => line === BEGIN_AUTHORIZATION ? [index] : []);
  const endIndexes = lines.flatMap((line, index) => line === END_AUTHORIZATION ? [index] : []);
  if (beginIndexes.length !== 1 || endIndexes.length !== 1) fail();
  const begin = beginIndexes[0]!;
  const end = endIndexes[0]!;
  if (end <= begin + 1) fail();

  const entries = new Map<string, string>();
  for (const line of lines.slice(begin + 1, end)) {
    const separator = line.indexOf("=");
    if (separator <= 0) fail();
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (entries.has(key) || value.length === 0) fail();
    entries.set(key, value);
  }
  const keys = ["schema", "schema_version", "version", "dry_run_run_id", "dry_run_run_attempt", "artifact_id", "artifact_digest"];
  if ([...entries.keys()].sort().join("\0") !== keys.sort().join("\0")) fail();

  const number = (key: string) => {
    const value = entries.get(key)!;
    if (!/^[1-9][0-9]*$/.test(value)) fail();
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) fail();
    return parsed;
  };
  const artifactDigest = entries.get("artifact_digest")!;
  if (
    entries.get("schema") !== "darwinian.worker.release-authorization" ||
    entries.get("schema_version") !== "1" ||
    entries.get("version") !== "1.4.2" ||
    !ARTIFACT_DIGEST.test(artifactDigest)
  ) fail();
  return {
    schema: "darwinian.worker.release-authorization",
    schemaVersion: 1,
    version: "1.4.2",
    dryRunRunId: number("dry_run_run_id"),
    dryRunRunAttempt: number("dry_run_run_attempt"),
    artifactId: number("artifact_id"),
    artifactDigest,
  };
}

export interface ReleaseRecoveryAuthorizationV1 {
  schema: "darwinian.worker.release-recovery-authorization";
  schemaVersion: 1;
  authorizedAt: string;
  tag: "v1.4.2";
  failedRunId: number;
  action: "verify_and_repair_metadata";
}

export function parseRecoveryAuthorizationReceipt(text: string): ReleaseRecoveryAuthorizationV1 {
  rejectDuplicateJsonKeys(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail();
  }
  if (!isObject(value) || !hasExactKeys(value, ["schema", "schemaVersion", "authorizedAt", "tag", "failedRunId", "action"])) fail();
  if (
    value.schema !== "darwinian.worker.release-recovery-authorization" ||
    value.schemaVersion !== 1 ||
    !isCanonicalTimestamp(value.authorizedAt) ||
    value.tag !== "v1.4.2" ||
    !isPositiveInteger(value.failedRunId) ||
    value.action !== "verify_and_repair_metadata"
  ) fail();
  return value as unknown as ReleaseRecoveryAuthorizationV1;
}

interface ProvenanceInput {
  receiptText: string;
  tagAnnotation: string;
  tag: { name: string; type: "tag" | "commit"; peeledCommit: string };
  checkoutCommit: string;
  originMainCommit: string;
  run: {
    id: number;
    attempt: number;
    url: string;
    workflowPath: string;
    event: string;
    headSha: string;
    conclusion: string;
  };
  jobs: Array<{ name: string; conclusion: string }>;
  artifacts: Array<{ id: number; name: string; digest: string; expired: boolean; runId: number }>;
  artifact: QualifiedPackedArtifact;
}

function oneJob(jobs: ProvenanceInput["jobs"], name: string, conclusion: string): void {
  const matches = jobs.filter((job) => job.name === name);
  if (matches.length !== 1 || matches[0]?.conclusion !== conclusion) fail();
}

function verifyReleaseProvenanceWithPolicy(input: ProvenanceInput, requireCurrentMain: boolean): {
  version: "1.4.2";
  sourceCommit: string;
  runId: number;
  artifactId: number;
  artifactDigest: string;
} {
  const receipt = parseReleaseCandidateReceipt(input.receiptText);
  const authorization = parseReleaseTagAuthorization(input.tagAnnotation);
  if (input.tag.type !== "tag" || input.tag.name !== `v${receipt.package.version}`) fail();
  for (const commit of [
    input.tag.peeledCommit,
    input.checkoutCommit,
    input.run.headSha,
    input.artifact.sourceCommit,
  ]) {
    if (!FULL_SHA.test(commit) || commit !== receipt.workflow.sourceCommit) fail();
  }
  if (!FULL_SHA.test(input.originMainCommit) ||
    requireCurrentMain && input.originMainCommit !== receipt.workflow.sourceCommit) fail();
  if (authorization.version !== receipt.package.version ||
    authorization.dryRunRunId !== receipt.workflow.runId ||
    authorization.dryRunRunAttempt !== receipt.workflow.runAttempt) fail();
  if (
    input.run.id !== receipt.workflow.runId ||
    input.run.attempt !== receipt.workflow.runAttempt ||
    input.run.url !== receipt.workflow.runUrl ||
    input.run.workflowPath !== receipt.workflow.path ||
    input.run.event !== receipt.workflow.event ||
    input.run.conclusion !== "success"
  ) fail();

  oneJob(input.jobs, "Validate release commit", "success");
  oneJob(input.jobs, "Dry run complete", "success");
  oneJob(input.jobs, "Publish to npm", "skipped");
  oneJob(input.jobs, "Smoke install (macos)", "skipped");
  oneJob(input.jobs, "GitHub Release", "skipped");

  if (input.artifacts.length !== 1) fail();
  const artifactMetadata = input.artifacts[0]!;
  if (
    artifactMetadata.expired ||
    artifactMetadata.name !== RELEASE_ARTIFACT_NAME ||
    artifactMetadata.id !== authorization.artifactId ||
    artifactMetadata.runId !== receipt.workflow.runId ||
    artifactMetadata.digest !== authorization.artifactDigest ||
    !ARTIFACT_DIGEST.test(artifactMetadata.digest)
  ) fail();
  if (
    input.artifact.packageName !== receipt.package.name ||
    input.artifact.version !== receipt.package.version ||
    input.artifact.filename !== receipt.tar.filename ||
    input.artifact.byteLength !== receipt.tar.byteLength ||
    input.artifact.sha1 !== receipt.tar.sha1 ||
    input.artifact.sha256 !== receipt.tar.sha256 ||
    input.artifact.integrity !== receipt.tar.integrity
  ) fail();

  return {
    version: "1.4.2",
    sourceCommit: receipt.workflow.sourceCommit,
    runId: receipt.workflow.runId,
    artifactId: artifactMetadata.id,
    artifactDigest: artifactMetadata.digest,
  };
}

export function verifyReleaseProvenance(input: ProvenanceInput) {
  return verifyReleaseProvenanceWithPolicy(input, true);
}

export function verifyRecoveryReleaseProvenance(input: ProvenanceInput) {
  return verifyReleaseProvenanceWithPolicy(input, false);
}
