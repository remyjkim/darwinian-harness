// ABOUTME: Proves Worker deploy inputs become the exact deterministic two-entry D45 USTAR bundle.
// ABOUTME: Exercises every body/provider transport vector and fresh identical stream construction.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  assertDeploymentBundleBytes,
  assertDeploymentProviderOutcome,
  buildDeterministicDeploymentBundle,
  createDeploymentBundleBody,
} from "../cli/core/management/deployment-bundle";
import { managementContract } from "../cli/core/management/contracts";
import type { WorkerDeployPayload } from "../cli/core/worker-deploy";

function fixtureVector() {
  return managementContract.vectors.positive.find(({ routeKey }) => routeKey === "deployment_artifacts.put")!;
}

function readFixtureEntries(): { manifest: Record<string, unknown>; store: Buffer; bytes: Buffer } {
  const bodyFixture = fixtureVector().bodyFixture!;
  const bytes = Buffer.from(bodyFixture.bytesBase64, "base64");
  const manifestLength = Number.parseInt(bytes.subarray(124, 135).toString("ascii"), 8);
  const manifestBytes = bytes.subarray(512, 512 + manifestLength);
  const storeHeaderOffset = 512 + Math.ceil(manifestLength / 512) * 512;
  const storeLength = Number.parseInt(bytes.subarray(storeHeaderOffset + 124, storeHeaderOffset + 135).toString("ascii"), 8);
  const store = bytes.subarray(storeHeaderOffset + 512, storeHeaderOffset + 512 + storeLength);
  return { manifest: JSON.parse(manifestBytes.toString("utf8")), store, bytes };
}

function fixturePayload(): WorkerDeployPayload {
  const { manifest, store } = readFixtureEntries();
  return {
    contractVersion: 1,
    materialization: "lockfile-store-export",
    entrypoint: manifest.entrypoint as WorkerDeployPayload["entrypoint"],
    lockfile: manifest.lockfile as WorkerDeployPayload["lockfile"],
    config: manifest.config as WorkerDeployPayload["config"],
    governance: manifest.governance as WorkerDeployPayload["governance"],
    storeExport: {
      kind: "drwn-store-export-tar",
      compression: "none",
      encoding: "base64",
      sha256: createHash("sha256").update(store).digest("hex"),
      byteLength: store.byteLength,
      bytesBase64: store.toString("base64"),
    },
  };
}

describe("deterministic deployment bundle", () => {
  test("reproduces the exact D45 positive USTAR fixture", () => {
    const expected = readFixtureEntries().bytes;
    const bundle = buildDeterministicDeploymentBundle(fixturePayload());
    expect(new Uint8Array(bundle.bytes)).toEqual(new Uint8Array(expected));
    expect(bundle.byteLength).toBe(5_120);
    expect(bundle.artifactSha256).toBe("ce5c71eef917857859ad19bb4e79d5eaf2fb4e805bdd5eefa9597b0b92da7b87");
    expect(bundle.requestId).toBe("ce5c71ee-f917-4578-99ad-19bb4e79d5ea");
    expect(bundle.artifactRef).toBe(`deployment_artifact:sha256:${bundle.artifactSha256}`);
    expect(bundle.manifest).not.toHaveProperty("bytesBase64");
    expect(bundle.manifest.storeExport).toEqual({
      byteLength: 2_048,
      compression: "none",
      encoding: "bundle-entry",
      entry: "store.tar",
      kind: "drwn-store-export-tar",
      sha256: "913926c3301df67838d06f3882dd3602a608b9acb181098d91a535305f4cef45",
    });
    expect(() => assertDeploymentBundleBytes(bundle.bytes)).not.toThrow();
  });

  test("is deterministic and changes identity for manifest or store bytes", () => {
    const first = buildDeterministicDeploymentBundle(fixturePayload());
    const second = buildDeterministicDeploymentBundle(structuredClone(fixturePayload()));
    expect(second).toEqual(first);

    const changedManifest = fixturePayload();
    changedManifest.entrypoint.requested = "@fixture/worker@1.0.1";
    expect(buildDeterministicDeploymentBundle(changedManifest).artifactSha256).not.toBe(first.artifactSha256);

    const changedStore = fixturePayload();
    const store = Buffer.from(changedStore.storeExport.bytesBase64, "base64");
    store[store.length - 1] = store[store.length - 1]! ^ 1;
    changedStore.storeExport.bytesBase64 = store.toString("base64");
    changedStore.storeExport.sha256 = createHash("sha256").update(store).digest("hex");
    expect(buildDeterministicDeploymentBundle(changedStore).artifactSha256).not.toBe(first.artifactSha256);
  });

  test("creates independent fresh identical bodies for retries", async () => {
    const bundle = buildDeterministicDeploymentBundle(fixturePayload());
    const first = createDeploymentBundleBody(bundle);
    const second = createDeploymentBundleBody(bundle);
    expect(first).not.toBe(second);
    expect(Buffer.from(await new Response(first).arrayBuffer())).toEqual(Buffer.from(bundle.bytes));
    expect(Buffer.from(await new Response(second).arrayBuffer())).toEqual(Buffer.from(bundle.bytes));
  });

  test("rejects every D45 body and provider negative on its intended constraint", () => {
    const negatives = managementContract.vectors.negative.filter(({ routeKey, surface }) => (
      routeKey === "deployment_artifacts.put" && (surface === "body" || surface === "provider")
    ));
    expect(negatives).toHaveLength(13);
    for (const vector of negatives) {
      const action = vector.surface === "body"
        ? () => assertDeploymentBundleBytes(Buffer.from(String(vector.candidate.bytesBase64), "base64"))
        : () => assertDeploymentProviderOutcome(vector.candidate);
      expect(action, vector.caseId).toThrow();
      try {
        action();
      } catch (error) {
        expect((error as { code?: string }).code, vector.caseId).toBe(vector.expectedClientError);
      }
    }
  });
});
