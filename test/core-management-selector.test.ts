// ABOUTME: Pins explicit-ID then verified-project-binding target precedence.
// ABOUTME: Names, slugs, list cardinality, and stale profile or organization state never select authority.

import { describe, expect, test } from "bun:test";
import { resolveDeployedWorkerSelector } from "../cli/core/management/selector";

const context = {
  schema: "drwn.project-cloud-context" as const,
  schemaVersion: 1 as const,
  profileDigest: "a".repeat(64),
  organizationId: "org_alpha",
  deployedWorkerId: "deployed_worker_project",
  verifiedAt: "2026-08-25T12:00:00.000Z",
};

describe("Deployed Worker selector", () => {
  test("explicit valid ID wins over project binding", () => {
    expect(resolveDeployedWorkerSelector({
      explicitId: "deployed_worker_explicit",
      projectContext: context,
      profileDigest: context.profileDigest,
      organizationId: context.organizationId,
    })).toEqual({ source: "explicit", deployedWorkerId: "deployed_worker_explicit" });
  });

  test("uses a project binding only for the exact active profile and organization", () => {
    expect(resolveDeployedWorkerSelector({
      projectContext: context,
      profileDigest: context.profileDigest,
      organizationId: context.organizationId,
    })).toEqual({ source: "project", deployedWorkerId: "deployed_worker_project" });
    for (const input of [
      { profileDigest: "b".repeat(64), organizationId: context.organizationId, projectContext: context },
      { profileDigest: context.profileDigest, organizationId: "org_other", projectContext: context },
      { profileDigest: context.profileDigest, organizationId: context.organizationId, projectContext: null },
    ]) {
      expect(() => resolveDeployedWorkerSelector(input))
        .toThrow(expect.objectContaining({ code: "DEPLOYED_WORKER_TARGET_REQUIRED" }));
    }
  });

  test("rejects malformed or cross-kind IDs without fallback", () => {
    for (const explicitId of ["worker_wrong", "deployment_attempt_wrong", "../escape", ""] ) {
      expect(() => resolveDeployedWorkerSelector({
        explicitId,
        projectContext: context,
        profileDigest: context.profileDigest,
        organizationId: context.organizationId,
      })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    }
  });
});
