// ABOUTME: Validates fresh, normalized GitHub and npm publication-control readback receipts.
// ABOUTME: Requires the declared approval policy, one exact tag policy, OIDC binding, and token prohibition.

export interface PublicationApprovalPolicyV1 {
  schema: "darwinian.worker.publication-approval-policy";
  schemaVersion: 1;
  githubEnvironment: string;
  requiredReviewers: string[];
  preventSelfReview: boolean;
  canAdminsBypass: false;
}

export interface GitHubPublicationControlsV1 {
  schema: "darwinian.worker.github-publication-controls";
  schemaVersion: 1;
  observedAt: string;
  repository: { owner: string; name: string };
  environment: {
    name: string;
    requiredReviewers: string[];
    preventSelfReview: boolean;
    canAdminsBypass: boolean;
    customDeploymentPolicies: boolean;
    deploymentPolicies: Array<{ type: "tag" | "branch"; pattern: string }>;
  };
}

export interface NpmPublicationControlsV1 {
  schema: "darwinian.worker.npm-publication-controls";
  schemaVersion: 1;
  observedAt: string;
  package: string;
  trustedPublisher: {
    provider: string;
    owner: string;
    repository: string;
    workflow: string;
    environment: string;
    allowedAction: string;
  };
  publishingAccess: "require_2fa_disallow_tokens";
}

export class PublicationControlsError extends Error {
  constructor() {
    super("Publication control validation failed.");
    this.name = "PublicationControlsError";
  }
}

function fail(): never {
  throw new PublicationControlsError();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function assertNoSecretBearingInput(value: unknown): void {
  if (typeof value === "string") {
    if (/(?:gh[pousr]_[A-Za-z0-9]|npm_[A-Za-z0-9]|secret_[A-Za-z0-9]|bearer\s+[A-Za-z0-9]|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value)) fail();
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretBearingInput(item);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:access.?token|auth.?token|password|client.?secret|private.?key|credential)/i.test(key)) fail();
    assertNoSecretBearingInput(item);
  }
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function assertFresh(observedAt: unknown, now: string): void {
  if (!canonicalTimestamp(observedAt) || !canonicalTimestamp(now)) fail();
  const age = new Date(now).valueOf() - new Date(observedAt).valueOf();
  if (age > 15 * 60_000 || age < -60_000) fail();
}

/**
 * The declared policy may choose who approves and whether self-review is allowed. It may
 * never remove the approval click, permit administrator bypass, or unbind the environment
 * that the npm trusted publisher authenticates against.
 */
function assertApprovalPolicy(value: unknown): asserts value is PublicationApprovalPolicyV1 {
  if (!exactKeys(value, [
    "schema",
    "schemaVersion",
    "githubEnvironment",
    "requiredReviewers",
    "preventSelfReview",
    "canAdminsBypass",
  ])) fail();
  if (value.schema !== "darwinian.worker.publication-approval-policy" || value.schemaVersion !== 1) fail();
  if (value.githubEnvironment !== "darwinian-npm-publish") fail();
  if (typeof value.preventSelfReview !== "boolean") fail();
  if (value.canAdminsBypass !== false) fail();
  const reviewers = value.requiredReviewers;
  if (!Array.isArray(reviewers) || reviewers.length === 0) fail();
  if (!reviewers.every((reviewer) => typeof reviewer === "string" && reviewer.length > 0)) fail();
  if (new Set(reviewers).size !== reviewers.length) fail();
}

function sameReviewers(observed: unknown, declared: readonly string[]): boolean {
  if (!Array.isArray(observed) || observed.length !== declared.length) return false;
  if (!observed.every((reviewer) => typeof reviewer === "string")) return false;
  return [...(observed as string[])].sort().join("\0") === [...declared].sort().join("\0");
}

function assertGitHubReceipt(
  value: unknown,
  now: string,
  policy: PublicationApprovalPolicyV1,
): asserts value is GitHubPublicationControlsV1 {
  if (!exactKeys(value, ["schema", "schemaVersion", "observedAt", "repository", "environment"])) fail();
  if (value.schema !== "darwinian.worker.github-publication-controls" || value.schemaVersion !== 1) fail();
  assertFresh(value.observedAt, now);
  if (!exactKeys(value.repository, ["owner", "name"]) ||
    value.repository.owner !== "remyjkim" || value.repository.name !== "darwinian-worker") fail();
  const environment = value.environment;
  if (!exactKeys(environment, [
    "name",
    "requiredReviewers",
    "preventSelfReview",
    "canAdminsBypass",
    "customDeploymentPolicies",
    "deploymentPolicies",
  ])) fail();
  if (
    environment.name !== policy.githubEnvironment ||
    !sameReviewers(environment.requiredReviewers, policy.requiredReviewers) ||
    environment.preventSelfReview !== policy.preventSelfReview ||
    environment.canAdminsBypass !== false ||
    environment.customDeploymentPolicies !== true ||
    !Array.isArray(environment.deploymentPolicies) ||
    environment.deploymentPolicies.length !== 1
  ) fail();
  const deploymentPolicy = environment.deploymentPolicies[0];
  if (!exactKeys(deploymentPolicy, ["type", "pattern"]) ||
    deploymentPolicy.type !== "tag" || deploymentPolicy.pattern !== "v1.2.0") fail();
}

function assertNpmReceipt(
  value: unknown,
  now: string,
  policy: PublicationApprovalPolicyV1,
): asserts value is NpmPublicationControlsV1 {
  if (!exactKeys(value, ["schema", "schemaVersion", "observedAt", "package", "trustedPublisher", "publishingAccess"])) fail();
  if (value.schema !== "darwinian.worker.npm-publication-controls" || value.schemaVersion !== 1) fail();
  assertFresh(value.observedAt, now);
  if (value.package !== "darwinian" || value.publishingAccess !== "require_2fa_disallow_tokens") fail();
  const publisher = value.trustedPublisher;
  if (!exactKeys(publisher, ["provider", "owner", "repository", "workflow", "environment", "allowedAction"])) fail();
  if (
    publisher.provider !== "github-actions" ||
    publisher.owner !== "remyjkim" ||
    publisher.repository !== "darwinian-worker" ||
    publisher.workflow !== "release.yml" ||
    publisher.environment !== policy.githubEnvironment ||
    publisher.allowedAction !== "npm publish"
  ) fail();
}

export function validatePublicationControls(input: {
  github: unknown;
  npm: unknown;
  policy: unknown;
  now: string;
}): {
  repository: "remyjkim/darwinian-worker";
  environment: string;
  approval: { requiredReviewers: string[]; preventSelfReview: boolean };
  package: "darwinian";
  versionTag: "v1.2.0";
} {
  assertNoSecretBearingInput(input.github);
  assertNoSecretBearingInput(input.npm);
  assertNoSecretBearingInput(input.policy);
  assertApprovalPolicy(input.policy);
  assertGitHubReceipt(input.github, input.now, input.policy);
  assertNpmReceipt(input.npm, input.now, input.policy);
  return {
    repository: "remyjkim/darwinian-worker",
    environment: input.policy.githubEnvironment,
    approval: {
      requiredReviewers: [...input.policy.requiredReviewers],
      preventSelfReview: input.policy.preventSelfReview,
    },
    package: "darwinian",
    versionTag: "v1.2.0",
  };
}
