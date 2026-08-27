// ABOUTME: Proves portable Worker payloads become deterministic target-scoped immutable artifacts.
// ABOUTME: Artifact response loss replays exact bytes and a digest-derived UUID without local journaling.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  buildDeploymentArtifact,
  stageDeploymentArtifact,
  type DeploymentArtifactDependencies,
} from "../cli/core/management/deployment-artifacts";
import { managementContract } from "../cli/core/management/contracts";
import {
  indeterminateManagementResult,
  succeededManagementResult,
} from "../cli/core/management/results";
import type { WorkerDeployPayload } from "../cli/core/worker-deploy";

function fixturePayload(): WorkerDeployPayload {
  const vector = managementContract.vectors.positive.find(({ routeKey }) => routeKey === "deployment_artifacts.put")!;
  const bytes = Buffer.from(vector.bodyFixture!.bytesBase64, "base64");
  const manifestLength = Number.parseInt(bytes.subarray(124, 135).toString("ascii"), 8);
  const manifest = JSON.parse(bytes.subarray(512, 512 + manifestLength).toString("utf8"));
  const storeOffset = 512 + Math.ceil(manifestLength / 512) * 512;
  const storeLength = Number.parseInt(bytes.subarray(storeOffset + 124, storeOffset + 135).toString("ascii"), 8);
  const store = bytes.subarray(storeOffset + 512, storeOffset + 512 + storeLength);
  return {
    contractVersion: 1,
    materialization: "lockfile-store-export",
    entrypoint: manifest.entrypoint,
    lockfile: manifest.lockfile,
    config: manifest.config,
    governance: manifest.governance,
    storeExport: {
      kind: "drwn-store-export-tar",
      compression: "none",
      encoding: "base64",
      sha256: createHash("sha256").update(store).digest("hex"),
      byteLength: store.byteLength,
      bytesBase64: store.toString("base64"),
    },
  } as WorkerDeployPayload;
}

describe("deployment artifact staging", () => {
  test("D45 USTAR bytes, SHA, ref, and UUID are deterministic and contain no Base64 envelope", () => {
    const first = buildDeploymentArtifact(fixturePayload());
    const second = buildDeploymentArtifact(structuredClone(fixturePayload()));
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      artifactSha256: "ce5c71eef917857859ad19bb4e79d5eaf2fb4e805bdd5eefa9597b0b92da7b87",
      artifactRef: "deployment_artifact:sha256:ce5c71eef917857859ad19bb4e79d5eaf2fb4e805bdd5eefa9597b0b92da7b87",
      requestId: "ce5c71ee-f917-4578-99ad-19bb4e79d5ea",
      byteLength: 5120,
    });
    expect(first).not.toHaveProperty("payloadBase64");
    const changed = fixturePayload();
    changed.entrypoint.requested = "@fixture/worker@1.0.1";
    expect(buildDeploymentArtifact(changed).artifactSha256).not.toBe(first.artifactSha256);
    expect(buildDeploymentArtifact(changed).requestId).not.toBe(first.requestId);
  });

  test("response loss and restart replay identical target, request ID, and payload bytes", async () => {
    const requests: unknown[] = [];
    const bodies: Buffer[] = [];
    let calls = 0;
    const dependencies: DeploymentArtifactDependencies = {
      execute: async (input) => {
        requests.push(structuredClone(input.request));
        expect(input.rawBody).toBeDefined();
        bodies.push(Buffer.from(await new Response(await input.rawBody!.createBody()).arrayBuffer()));
        calls += 1;
        if (calls === 1) {
          return indeterminateManagementResult(input.routeKey, String(input.request.requestId), "2026-08-25T12:00:00.000Z");
        }
        return succeededManagementResult(input.routeKey, String(input.request.requestId), {
          requestId: String(input.request.requestId),
          deployedWorkerId: String(input.request.deployedWorkerId),
          artifactRef: `deployment_artifact:sha256:${input.request.artifactSha256}`,
          artifactSha256: String(input.request.artifactSha256),
          byteLength: Number(input.request.byteLength),
          status: "existing",
        }, "2026-08-25T12:01:00.000Z");
      },
    };
    const input = {
      deployedWorkerId: "deployed_worker_alpha",
      payload: fixturePayload(),
      credentialsPath: "/unused",
      env: {},
    };
    expect((await stageDeploymentArtifact(input, dependencies)).result.outcome).toBe("indeterminate");
    const resumed = await stageDeploymentArtifact(input, dependencies);
    expect(resumed.result.outcome).toBe("succeeded");
    expect(resumed.artifact.artifactRef).toBe("deployment_artifact:sha256:ce5c71eef917857859ad19bb4e79d5eaf2fb4e805bdd5eefa9597b0b92da7b87");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[0]).not.toHaveProperty("payloadBase64");
    expect(bodies[0]).toEqual(bodies[1]);
    expect(createHash("sha256").update(bodies[0]!).digest("hex")).toBe(resumed.artifact.artifactSha256);
    expect(JSON.stringify(resumed.result)).not.toContain(bodies[0]!.toString("base64"));
  });

  test("oversized canonical artifact refuses before transport", async () => {
    let calls = 0;
    const payload = fixturePayload();
    const store = Buffer.alloc(managementContract.artifactStaging.maxStoreBytes + 1);
    payload.storeExport.byteLength = store.byteLength;
    payload.storeExport.sha256 = createHash("sha256").update(store).digest("hex");
    payload.storeExport.bytesBase64 = store.toString("base64");
    await expect(stageDeploymentArtifact({
      deployedWorkerId: "deployed_worker_alpha",
      payload,
      credentialsPath: "/unused",
      env: {},
    }, {
      execute: async () => { calls += 1; throw new Error("must not execute"); },
    })).rejects.toMatchObject({ code: "DEPLOYMENT_ARTIFACT_TOO_LARGE" });
    expect(calls).toBe(0);
  });
});
