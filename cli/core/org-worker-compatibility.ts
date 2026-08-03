// ABOUTME: Evaluates OrgWorkerBundleV1 inputs against the exact supported Worker materialization profile.
// ABOUTME: Returns deterministic stable codes before any project mutation or content acquisition.

import type { OrgWorkerBundleV1 } from "./org-worker-bundle-v1";
import { DrwnError } from "./errors";
import { gte, isStrictSemver } from "./semver-utils";
import { DRWN_VERSION } from "./version";

export const ORG_WORKER_COMPATIBILITY_PROFILE =
  "drwn-org-worker-materialization@1" as const;

export type OrgWorkerCompatibilityIssueCode =
  | "ORG_WORKER_VERSION_UNSUPPORTED"
  | "ORG_WORKER_ENVIRONMENT_UNSUPPORTED"
  | "ORG_WORKER_PROJECT_OVERLAY_UNSUPPORTED"
  | "ORG_WORKER_ARTIFACT_KIND_UNSUPPORTED"
  | "ORG_WORKER_RECEIPT_VERSION_UNSUPPORTED";

export interface OrgWorkerCompatibilityIssue {
  code: OrgWorkerCompatibilityIssueCode;
  message: string;
}

export interface OrgWorkerCompatibilityReport {
  compatible: boolean;
  compatibilityProfile: typeof ORG_WORKER_COMPATIBILITY_PROFILE;
  workerVersion: string;
  minimumWorkerVersion: string;
  issues: OrgWorkerCompatibilityIssue[];
}

export function evaluateOrgWorkerCompatibility(input: {
  bundle: OrgWorkerBundleV1;
  workerVersion?: string;
}): OrgWorkerCompatibilityReport {
  const workerVersion = input.workerVersion ?? DRWN_VERSION;
  const issues: OrgWorkerCompatibilityIssue[] = [];

  if (
    !isStrictSemver(workerVersion) ||
    !gte(workerVersion, input.bundle.minimumWorkerVersion)
  ) {
    issues.push({
      code: "ORG_WORKER_VERSION_UNSUPPORTED",
      message: `Darwinian Worker ${workerVersion} does not satisfy minimum version ${input.bundle.minimumWorkerVersion}`,
    });
  }
  if (input.bundle.logicalEnvironmentClass !== "project_workspace") {
    issues.push({
      code: "ORG_WORKER_ENVIRONMENT_UNSUPPORTED",
      message: `Unsupported logical environment class: ${input.bundle.logicalEnvironmentClass}`,
    });
  }
  if (Object.keys(input.bundle.projectOverlay).length > 0) {
    issues.push({
      code: "ORG_WORKER_PROJECT_OVERLAY_UNSUPPORTED",
      message: "Project overlay must be empty for compatibility profile drwn-org-worker-materialization@1",
    });
  }
  const unsupportedKinds = [
    ...new Set(
      input.bundle.artifactPins
        .map(({ kind }) => kind)
        .filter((kind) => kind !== "worker_root" && kind !== "card"),
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (unsupportedKinds.length > 0) {
    issues.push({
      code: "ORG_WORKER_ARTIFACT_KIND_UNSUPPORTED",
      message: `Unsupported artifact kinds: ${unsupportedKinds.join(", ")}`,
    });
  }
  if (
    input.bundle.materializationReceiptVersion !==
    "worker-materialization-receipt@1"
  ) {
    issues.push({
      code: "ORG_WORKER_RECEIPT_VERSION_UNSUPPORTED",
      message: `Unsupported Worker materialization receipt version: ${input.bundle.materializationReceiptVersion}`,
    });
  }

  return {
    compatible: issues.length === 0,
    compatibilityProfile: ORG_WORKER_COMPATIBILITY_PROFILE,
    workerVersion,
    minimumWorkerVersion: input.bundle.minimumWorkerVersion,
    issues,
  };
}

export function assertOrgWorkerCompatibility(input: {
  bundle: OrgWorkerBundleV1;
  workerVersion?: string;
}): OrgWorkerCompatibilityReport {
  const report = evaluateOrgWorkerCompatibility(input);
  const [first, ...remaining] = report.issues;
  if (first) {
    throw new DrwnError(
      first.code,
      first.message,
      remaining.map(({ code, message }) => `${code}: ${message}`),
    );
  }
  return report;
}
