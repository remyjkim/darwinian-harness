// ABOUTME: Proves portable Worker payloads become deterministic target-scoped immutable artifacts.
// ABOUTME: Artifact response loss replays exact bytes and a digest-derived UUID without local journaling.

import { describe, expect, test } from "bun:test";
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
  return JSON.parse(Buffer.from(String(vector.request.payloadBase64), "base64").toString("utf8")) as WorkerDeployPayload;
}

describe("deployment artifact staging", () => {
  test("canonical bytes, SHA, ref, and UUID are deterministic and byte-sensitive", () => {
    const first = buildDeploymentArtifact(fixturePayload());
    const second = buildDeploymentArtifact(structuredClone(fixturePayload()));
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      artifactSha256: "6867241440ef87a70a4875c40b56afde567ccdb261ae4317c87a13c25b0314e1",
      artifactRef: "deployment_artifact:sha256:6867241440ef87a70a4875c40b56afde567ccdb261ae4317c87a13c25b0314e1",
      requestId: "68672414-40ef-47a7-8a48-75c40b56afde",
      byteLength: 980,
    });
    expect(Buffer.from(first.payloadBase64, "base64")).toEqual(Buffer.from(first.bytes));
    const changed = fixturePayload();
    changed.entrypoint.requested = "@fixture/worker@1.0.1";
    expect(buildDeploymentArtifact(changed).artifactSha256).not.toBe(first.artifactSha256);
    expect(buildDeploymentArtifact(changed).requestId).not.toBe(first.requestId);
  });

  test("response loss and restart replay identical target, request ID, and payload bytes", async () => {
    const requests: unknown[] = [];
    let calls = 0;
    const dependencies: DeploymentArtifactDependencies = {
      execute: async (input) => {
        requests.push(structuredClone(input.request));
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
    expect(resumed.artifact.artifactRef).toBe("deployment_artifact:sha256:6867241440ef87a70a4875c40b56afde567ccdb261ae4317c87a13c25b0314e1");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(JSON.stringify(resumed.result)).not.toContain(String((requests[0] as { payloadBase64: string }).payloadBase64));
  });

  test("oversized canonical artifact refuses before transport", async () => {
    let calls = 0;
    const payload = fixturePayload();
    payload.entrypoint.requested = "x".repeat(managementContract.artifactStaging.maxPayloadBytes);
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
