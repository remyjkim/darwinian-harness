// ABOUTME: Validates fresh, normalized GitHub and npm publication-control readback receipts.
// ABOUTME: Requires one independent reviewer, one exact tag policy, OIDC binding, and token prohibition.

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

function assertGitHubReceipt(value: unknown, now: string): asserts value is GitHubPublicationControlsV1 {
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
    environment.name !== "darwinian-npm-publish" ||
    !Array.isArray(environment.requiredReviewers) ||
    environment.requiredReviewers.length !== 1 ||
    environment.requiredReviewers[0] !== "leeminseung" ||
    environment.preventSelfReview !== true ||
    environment.canAdminsBypass !== false ||
    environment.customDeploymentPolicies !== true ||
    !Array.isArray(environment.deploymentPolicies) ||
    environment.deploymentPolicies.length !== 1
  ) fail();
  const policy = environment.deploymentPolicies[0];
  if (!exactKeys(policy, ["type", "pattern"]) || policy.type !== "tag" || policy.pattern !== "v1.2.0") fail();
}

function assertNpmReceipt(value: unknown, now: string): asserts value is NpmPublicationControlsV1 {
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
    publisher.environment !== "darwinian-npm-publish" ||
    publisher.allowedAction !== "npm publish"
  ) fail();
}

export function validatePublicationControls(input: {
  github: unknown;
  npm: unknown;
  now: string;
}): {
  repository: "remyjkim/darwinian-worker";
  environment: "darwinian-npm-publish";
  reviewer: "leeminseung";
  package: "darwinian";
  versionTag: "v1.2.0";
} {
  assertNoSecretBearingInput(input.github);
  assertNoSecretBearingInput(input.npm);
  assertGitHubReceipt(input.github, input.now);
  assertNpmReceipt(input.npm, input.now);
  return {
    repository: "remyjkim/darwinian-worker",
    environment: "darwinian-npm-publish",
    reviewer: "leeminseung",
    package: "darwinian",
    versionTag: "v1.2.0",
  };
}
