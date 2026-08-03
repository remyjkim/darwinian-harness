// ABOUTME: Verifies producer-compatible OrgWorkerBundleV1 identity and fail-closed Worker profile checks.
// ABOUTME: Keeps compatibility preflight deterministic, bounded, and free of filesystem or network effects.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  computeOrgWorkerBundleDigest,
  parseOrgWorkerBundleV1,
} from "../cli/core/org-worker-bundle-v1";
import { evaluateOrgWorkerCompatibility } from "../cli/core/org-worker-compatibility";

async function golden() {
  return parseOrgWorkerBundleV1(
    JSON.parse(
      await readFile(
        new URL("./fixtures/org-worker-bundle-v1/gtm.valid.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

describe("OrgWorkerBundleV1 compatibility", () => {
  test("classifies root, active-root, and consent semantics with stable bounded codes", async () => {
    const root = JSON.parse(JSON.stringify(await golden()));
    root.orderedWorkerRoots = ["artifact:not-pinned"];
    expect(() => parseOrgWorkerBundleV1(root)).toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_ROOT_ORDER_INVALID",
      }),
    );

    const active = JSON.parse(JSON.stringify(await golden()));
    active.activeWorkerRoot = "artifact:not-active";
    expect(() => parseOrgWorkerBundleV1(active)).toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_ACTIVE_ROOT_INVALID",
      }),
    );

    const consent = JSON.parse(JSON.stringify(await golden()));
    consent.contributionConsents[0].workerId = "worker:other";
    expect(() => parseOrgWorkerBundleV1(consent)).toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_CONSENT_INVALID",
      }),
    );
  });

  test("computes the frozen producer domain-separated bundle digest", async () => {
    expect(computeOrgWorkerBundleDigest(await golden())).toBe(
      "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
    );
  });

  test("rejects a Worker below the bundle minimum before materialization", async () => {
    const report = evaluateOrgWorkerCompatibility({
      bundle: await golden(),
      workerVersion: "0.9.0",
    });

    expect(report.compatible).toBe(false);
    expect(report.issues).toEqual([
      {
        code: "ORG_WORKER_VERSION_UNSUPPORTED",
        message: "Darwinian Worker 0.9.0 does not satisfy minimum version 1.0.0",
      },
    ]);
  });

  test("accepts exactly the frozen V1 compatibility profile", async () => {
    const report = evaluateOrgWorkerCompatibility({
      bundle: await golden(),
      workerVersion: "1.0.0",
    });

    expect(report).toEqual({
      compatible: true,
      compatibilityProfile: "drwn-org-worker-materialization@1",
      workerVersion: "1.0.0",
      minimumWorkerVersion: "1.0.0",
      issues: [],
    });
  });

  test("rejects unsupported environment, overlay, and artifact kinds deterministically", async () => {
    const candidate = JSON.parse(JSON.stringify(await golden()));
    candidate.logicalEnvironmentClass = "container_runtime";
    candidate.projectOverlay = { mode: "foreign" };
    candidate.artifactPins.push({
      artifactId: "artifact:runtime",
      kind: "runtime_package",
      name: "runtime",
      version: "1.0.0",
      integrity: `sha256:${"4".repeat(64)}`,
      origin: "release:runtime",
      provenanceRefs: [],
      resolutionSnapshotRef: "resolution:runtime",
    });
    const bundle = parseOrgWorkerBundleV1(candidate);
    const before = structuredClone(bundle);

    const report = evaluateOrgWorkerCompatibility({
      bundle,
      workerVersion: "1.0.0",
    });

    expect(report.issues.map(({ code }) => code)).toEqual([
      "ORG_WORKER_ENVIRONMENT_UNSUPPORTED",
      "ORG_WORKER_PROJECT_OVERLAY_UNSUPPORTED",
      "ORG_WORKER_ARTIFACT_KIND_UNSUPPORTED",
    ]);
    expect(bundle).toEqual(before);
  });

  test("rejects an unsupported Worker receipt version with its stable code", async () => {
    const candidate = JSON.parse(JSON.stringify(await golden()));
    candidate.materializationReceiptVersion = "worker-materialization-receipt@2";
    const report = evaluateOrgWorkerCompatibility({
      bundle: parseOrgWorkerBundleV1(candidate),
      workerVersion: "1.0.0",
    });

    expect(report.issues).toEqual([
      {
        code: "ORG_WORKER_RECEIPT_VERSION_UNSUPPORTED",
        message:
          "Unsupported Worker materialization receipt version: worker-materialization-receipt@2",
      },
    ]);
  });
});
