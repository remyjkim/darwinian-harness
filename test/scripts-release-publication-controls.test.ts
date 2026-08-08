// ABOUTME: Proves GitHub and npm publication-control receipts are fresh, exact, policy-conformant, and secret-free.
// ABOUTME: Keeps external configuration as a fail-closed precondition rather than inferred release state.

import { describe, expect, test } from "bun:test";
import {
  validatePublicationControls,
  type GitHubPublicationControlsV1,
  type NpmPublicationControlsV1,
  type PublicationApprovalPolicyV1,
} from "../scripts/release/publication-controls";

const NOW = "2026-08-08T00:10:00.000Z";

function policy(): PublicationApprovalPolicyV1 {
  return {
    schema: "darwinian.worker.publication-approval-policy",
    schemaVersion: 1,
    githubEnvironment: "darwinian-npm-publish",
    requiredReviewers: ["remyjkim"],
    preventSelfReview: false,
    canAdminsBypass: false,
  };
}

function githubReceipt(): GitHubPublicationControlsV1 {
  return {
    schema: "darwinian.worker.github-publication-controls",
    schemaVersion: 1,
    observedAt: "2026-08-08T00:05:00.000Z",
    repository: { owner: "remyjkim", name: "darwinian-worker" },
    environment: {
      name: "darwinian-npm-publish",
      requiredReviewers: ["remyjkim"],
      preventSelfReview: false,
      canAdminsBypass: false,
      customDeploymentPolicies: true,
      deploymentPolicies: [{ type: "tag", pattern: "v1.2.0" }],
    },
  };
}

function npmReceipt(): NpmPublicationControlsV1 {
  return {
    schema: "darwinian.worker.npm-publication-controls",
    schemaVersion: 1,
    observedAt: "2026-08-08T00:06:00.000Z",
    package: "darwinian",
    trustedPublisher: {
      provider: "github-actions",
      owner: "remyjkim",
      repository: "darwinian-worker",
      workflow: "release.yml",
      environment: "darwinian-npm-publish",
      allowedAction: "npm publish",
    },
    publishingAccess: "require_2fa_disallow_tokens",
  };
}

function accepts(
  github: GitHubPublicationControlsV1 = githubReceipt(),
  npm: NpmPublicationControlsV1 = npmReceipt(),
  approvalPolicy: PublicationApprovalPolicyV1 = policy(),
) {
  return validatePublicationControls({ github, npm, policy: approvalPolicy, now: NOW });
}

describe("publication control receipts", () => {
  test("accepts the dedicated environment when the readback matches the declared approval policy", () => {
    expect(accepts()).toEqual({
      repository: "remyjkim/darwinian-worker",
      environment: "darwinian-npm-publish",
      approval: { requiredReviewers: ["remyjkim"], preventSelfReview: false },
      package: "darwinian",
      versionTag: "v1.2.0",
    });
  });

  test("accepts a declared two-person policy when the readback matches it", () => {
    const twoPerson = policy();
    twoPerson.requiredReviewers = ["leeminseung"];
    twoPerson.preventSelfReview = true;
    const receipt = githubReceipt();
    receipt.environment.requiredReviewers = ["leeminseung"];
    receipt.environment.preventSelfReview = true;
    expect(accepts(receipt, npmReceipt(), twoPerson)).toEqual({
      repository: "remyjkim/darwinian-worker",
      environment: "darwinian-npm-publish",
      approval: { requiredReviewers: ["leeminseung"], preventSelfReview: true },
      package: "darwinian",
      versionTag: "v1.2.0",
    });
  });

  test.each([
    ["reviewer identity drift", (receipt: GitHubPublicationControlsV1) => { receipt.environment.requiredReviewers = ["leeminseung"]; }],
    ["missing reviewer", (receipt: GitHubPublicationControlsV1) => { receipt.environment.requiredReviewers = []; }],
    ["extra reviewer", (receipt: GitHubPublicationControlsV1) => { receipt.environment.requiredReviewers.push("leeminseung"); }],
    ["self review drift", (receipt: GitHubPublicationControlsV1) => { receipt.environment.preventSelfReview = true; }],
    ["admin bypass", (receipt: GitHubPublicationControlsV1) => { receipt.environment.canAdminsBypass = true; }],
    ["custom policies disabled", (receipt: GitHubPublicationControlsV1) => { receipt.environment.customDeploymentPolicies = false; }],
    ["branch policy", (receipt: GitHubPublicationControlsV1) => { receipt.environment.deploymentPolicies = [{ type: "branch", pattern: "main" }]; }],
    ["wildcard tag", (receipt: GitHubPublicationControlsV1) => { receipt.environment.deploymentPolicies = [{ type: "tag", pattern: "v*" }]; }],
    ["multiple policies", (receipt: GitHubPublicationControlsV1) => { receipt.environment.deploymentPolicies.push({ type: "tag", pattern: "v1.2.1" }); }],
    ["shared environment", (receipt: GitHubPublicationControlsV1) => { receipt.environment.name = "npm-publish"; }],
    ["wrong repository", (receipt: GitHubPublicationControlsV1) => { receipt.repository.name = "other"; }],
  ])("rejects GitHub control drift: %s", (_label, mutate) => {
    const receipt = githubReceipt();
    mutate(receipt);
    expect(() => accepts(receipt)).toThrow();
  });

  test.each([
    ["no approval click required", (declared: PublicationApprovalPolicyV1) => { declared.requiredReviewers = []; }],
    ["unnamed reviewer", (declared: PublicationApprovalPolicyV1) => { declared.requiredReviewers = [""]; }],
    ["non-string reviewer", (declared: PublicationApprovalPolicyV1) => { declared.requiredReviewers = [7 as never]; }],
    ["duplicate reviewer", (declared: PublicationApprovalPolicyV1) => { declared.requiredReviewers = ["remyjkim", "remyjkim"]; }],
    ["admin bypass permitted", (declared: PublicationApprovalPolicyV1) => { declared.canAdminsBypass = true as never; }],
    ["non-boolean self review", (declared: PublicationApprovalPolicyV1) => { declared.preventSelfReview = "false" as never; }],
    ["environment unbound from OIDC publisher", (declared: PublicationApprovalPolicyV1) => { declared.githubEnvironment = "npm-publish"; }],
    ["wrong schema", (declared: PublicationApprovalPolicyV1) => { declared.schema = "other" as never; }],
    ["wrong schema version", (declared: PublicationApprovalPolicyV1) => { declared.schemaVersion = 2 as never; }],
  ])("rejects an approval policy that breaches the fixed floor: %s", (_label, mutate) => {
    const declared = policy();
    mutate(declared);
    const receipt = githubReceipt();
    receipt.environment.requiredReviewers = Array.isArray(declared.requiredReviewers)
      ? [...(declared.requiredReviewers as string[])]
      : [];
    expect(() => accepts(receipt, npmReceipt(), declared)).toThrow();
  });

  test("rejects an approval policy carrying unknown fields", () => {
    expect(() => accepts(githubReceipt(), npmReceipt(), { ...policy(), unexpected: true } as never)).toThrow();
  });

  test.each([
    ["wrong package", (receipt: NpmPublicationControlsV1) => { receipt.package = "other"; }],
    ["wrong owner", (receipt: NpmPublicationControlsV1) => { receipt.trustedPublisher.owner = "other"; }],
    ["wrong repository", (receipt: NpmPublicationControlsV1) => { receipt.trustedPublisher.repository = "other"; }],
    ["wrong workflow", (receipt: NpmPublicationControlsV1) => { receipt.trustedPublisher.workflow = "other.yml"; }],
    ["wrong environment", (receipt: NpmPublicationControlsV1) => { receipt.trustedPublisher.environment = "npm-publish"; }],
    ["broad action", (receipt: NpmPublicationControlsV1) => { receipt.trustedPublisher.allowedAction = "*"; }],
    ["token publication allowed", (receipt: NpmPublicationControlsV1) => { receipt.publishingAccess = "require_2fa" as never; }],
  ])("rejects npm control drift: %s", (_label, mutate) => {
    const receipt = npmReceipt();
    mutate(receipt);
    expect(() => accepts(undefined, receipt)).toThrow();
  });

  test("rejects stale, future, noncanonical, and absent timestamps", () => {
    for (const observedAt of [
      "2026-08-07T23:54:59.999Z",
      "2026-08-08T00:11:00.001Z",
      "2026-08-08",
      "",
    ]) {
      const github = githubReceipt();
      github.observedAt = observedAt;
      expect(() => accepts(github)).toThrow();
    }
  });

  test("rejects unknown fields and any secret-bearing input before retention", () => {
    expect(() => validatePublicationControls({
      github: { ...githubReceipt(), unexpected: true } as never,
      npm: npmReceipt(),
      policy: policy(),
      now: NOW,
    })).toThrow();
    expect(() => validatePublicationControls({
      github: githubReceipt(),
      npm: { ...npmReceipt(), accessToken: "SECRET_TOKEN_SENTINEL" } as never,
      policy: policy(),
      now: NOW,
    })).toThrow();
  });
});
