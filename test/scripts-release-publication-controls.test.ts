// ABOUTME: Proves GitHub and npm publication-control receipts are fresh, exact, independent, and secret-free.
// ABOUTME: Keeps external configuration as a fail-closed precondition rather than inferred release state.

import { describe, expect, test } from "bun:test";
import {
  validatePublicationControls,
  type GitHubPublicationControlsV1,
  type NpmPublicationControlsV1,
} from "../scripts/release/publication-controls";

const NOW = "2026-08-08T00:10:00.000Z";

function githubReceipt(): GitHubPublicationControlsV1 {
  return {
    schema: "darwinian.worker.github-publication-controls",
    schemaVersion: 1,
    observedAt: "2026-08-08T00:05:00.000Z",
    repository: { owner: "remyjkim", name: "darwinian-worker" },
    environment: {
      name: "darwinian-npm-publish",
      requiredReviewers: ["leeminseung"],
      preventSelfReview: true,
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

function accepts(github = githubReceipt(), npm = npmReceipt()) {
  return validatePublicationControls({ github, npm, now: NOW });
}

describe("publication control receipts", () => {
  test("accepts only the dedicated independently reviewed GitHub environment and bound npm publisher", () => {
    expect(accepts()).toEqual({
      repository: "remyjkim/darwinian-worker",
      environment: "darwinian-npm-publish",
      reviewer: "leeminseung",
      package: "darwinian",
      versionTag: "v1.2.0",
    });
  });

  test.each([
    ["missing reviewer", (receipt: GitHubPublicationControlsV1) => { receipt.environment.requiredReviewers = []; }],
    ["extra reviewer", (receipt: GitHubPublicationControlsV1) => { receipt.environment.requiredReviewers.push("remyjkim"); }],
    ["self review", (receipt: GitHubPublicationControlsV1) => { receipt.environment.preventSelfReview = false; }],
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
      now: NOW,
    })).toThrow();
    expect(() => validatePublicationControls({
      github: githubReceipt(),
      npm: { ...npmReceipt(), accessToken: "SECRET_TOKEN_SENTINEL" } as never,
      now: NOW,
    })).toThrow();
  });
});
