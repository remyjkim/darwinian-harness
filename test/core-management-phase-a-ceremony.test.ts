// ABOUTME: Orchestrates one hidden D52 ceremony from strict plan through paired public outputs.
// ABOUTME: Proves one device grant and notice lifecycle precede owner execution without legacy REST reads.

import { describe, expect, test } from "bun:test";

const plan = {
  schema: "cl.dah.cli-management-phase-a-plan.v1",
  environmentId: "staging-1",
  sourceCommitSha: "a".repeat(40),
  qualificationRunId: "11111111-1111-4111-8111-111111111111",
  contractSha256: "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601",
  providerPolicyVersion: `sha256:${"b".repeat(64)}`,
  relayUrl: "wss://kc.communities.buzz.xyz",
  httpsBase: "https://kc.communities.buzz.xyz",
  workflow: {
    repository: "curation-labs/darwinian-services",
    runId: 33181185126,
    runAttempt: 1,
  },
} as const;

describe("I321 Phase-A hidden ceremony", () => {
  test("runs one grant, cleans its notice, executes owner bytes, and writes the output pair", async () => {
    const events: string[] = [];
    const module = await import("../cli/core/management/phase-a-ceremony");
    await module.executeI321PhaseACeremony({
      planPath: "/runner/private/plan.json",
      approvalNoticePath: "/runner/private/notice.json",
      adapterOrigin: "http://127.0.0.1:8787",
      readinessOutputPath: "/runner/public/i321-cli-management-readiness.json",
      communityOutputPath: "/runner/public/i321-staging-slot-community.json",
      runnerTemp: "/runner",
    }, {
      now: () => Date.parse("2030-08-27T17:05:00.000Z"),
      readPlan: async () => {
        events.push("plan");
        return plan;
      },
      preflightOutputs: async () => {
        events.push("outputs-preflight");
      },
      preflightApprovalNotice: async () => {
        events.push("notice-preflight");
      },
      runDeviceFlow: async (input) => {
        events.push("device");
        await input.onUserAction({
          verification_uri_complete: "https://auth-staging-main.darwinian.dev/device?user_code=ABCD",
          user_code: "ABCD",
          expires_at: "2030-08-27T17:10:00.000Z",
        });
        return {
          accessToken: "secret-access-token",
          issuedAt: "2030-08-27T17:00:00.000Z",
          expiresAt: "2030-08-27T17:15:00.000Z",
        };
      },
      publishApprovalNotice: async (_path, candidate) => {
        events.push("notice-publish");
        expect(candidate).toMatchObject({
          qualificationRunId: plan.qualificationRunId,
        });
        return { identity: "notice" };
      },
      cleanupApprovalNotice: async () => {
        events.push("notice-cleanup");
      },
      executeQualification: async (input) => {
        events.push("owner-execute");
        expect(input.plan).toEqual(plan);
        expect(input.adapterOrigin).toBe("http://127.0.0.1:8787");
        expect(input.credential.accessToken).toBe("secret-access-token");
        return {
          readiness: { schema: "cl.dah.cli-management-readiness.v1" },
          community: { schema: "cl.dah.staging-slot-community.v1" },
          readinessBytes: new TextEncoder().encode('{"readiness":true}\n'),
          communityBytes: new TextEncoder().encode('{"community":true}\n'),
        };
      },
      writeOutputs: async (input) => {
        events.push("outputs");
        expect(input.runnerTemp).toBe("/runner");
        expect(input.readinessPath).toBe(
          "/runner/public/i321-cli-management-readiness.json",
        );
        expect(input.communityPath).toBe(
          "/runner/public/i321-staging-slot-community.json",
        );
      },
    });

    expect(events).toEqual([
      "outputs-preflight",
      "notice-preflight",
      "plan",
      "device",
      "notice-publish",
      "notice-cleanup",
      "owner-execute",
      "outputs",
    ]);
  });

  test("refuses a noncanonical adapter origin before device authorization", async () => {
    let deviceCalls = 0;
    const module = await import("../cli/core/management/phase-a-ceremony");
    await expect(module.executeI321PhaseACeremony({
      planPath: "/runner/private/plan.json",
      approvalNoticePath: "/runner/private/notice.json",
      adapterOrigin: "https://127.0.0.1:8787",
      readinessOutputPath: "/runner/public/i321-cli-management-readiness.json",
      communityOutputPath: "/runner/public/i321-staging-slot-community.json",
      runnerTemp: "/runner",
    }, {
      readPlan: async () => plan,
      runDeviceFlow: async () => {
        deviceCalls += 1;
        throw new Error("must not authorize");
      },
    })).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    });
    expect(deviceCalls).toBe(0);
  });

  test("refuses an unsafe approval notice path before device authorization", async () => {
    let deviceCalls = 0;
    const module = await import("../cli/core/management/phase-a-ceremony");
    await expect(module.executeI321PhaseACeremony({
      planPath: "/runner/private/i321-cli-management-phase-a-plan.json",
      approvalNoticePath: "/outside/notice.json",
      adapterOrigin: "http://127.0.0.1:8787",
      readinessOutputPath: "/runner/public/i321-cli-management-readiness.json",
      communityOutputPath: "/runner/public/i321-staging-slot-community.json",
      runnerTemp: "/runner",
    }, {
      preflightOutputs: async () => undefined,
      preflightApprovalNotice: async () => {
        throw new Error("unsafe notice path");
      },
      readPlan: async () => plan,
      runDeviceFlow: async () => {
        deviceCalls += 1;
        throw new Error("must not authorize");
      },
    })).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    });
    expect(deviceCalls).toBe(0);
  });

  test("refuses unsafe public output paths before device authorization", async () => {
    let deviceCalls = 0;
    const module = await import("../cli/core/management/phase-a-ceremony");
    await expect(module.executeI321PhaseACeremony({
      planPath: "/runner/private/plan.json",
      approvalNoticePath: "/runner/private/notice.json",
      adapterOrigin: "http://127.0.0.1:8787",
      readinessOutputPath: "/outside/i321-cli-management-readiness.json",
      communityOutputPath: "/outside/i321-staging-slot-community.json",
      runnerTemp: "/runner",
    }, {
      preflightOutputs: async () => {
        throw new Error("unsafe output path");
      },
      readPlan: async () => plan,
      runDeviceFlow: async () => {
        deviceCalls += 1;
        throw new Error("must not authorize");
      },
    })).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
    });
    expect(deviceCalls).toBe(0);
  });
});
