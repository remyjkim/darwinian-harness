// ABOUTME: Executes all I321 staging Community vectors through the Worker-owned strict projection.
// ABOUTME: Proves Community is derived from one authorized organization read and never from operator input.

import { describe, expect, test } from "bun:test";
import { chmod, link, lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildStagingCommunityReceipt,
  cleanupStagingDeviceApprovalNotice,
  executeStagingCommunityQualification,
  parseStagingDeviceApprovalNotice,
  publishStagingDeviceApprovalNotice,
  readStagingCommunityPrivatePlan,
  stagingCommunityContract,
  writeStagingCommunityReceipt,
  type QualificationOrganizationReadResponse,
  type StagingCommunityPrivatePlan,
} from "../cli/core/management/staging-community-qualification";

function responseFor(vector: (typeof stagingCommunityContract.vectors)[number]): QualificationOrganizationReadResponse {
  if (vector.response !== undefined) return structuredClone(vector.response);
  return {
    ...structuredClone(stagingCommunityContract.baseResponse),
    ...structuredClone(vector.responseOverride ?? {}),
  };
}

function plan(): StagingCommunityPrivatePlan {
  return {
    schema: "cl.drwn.staging-slot-community-plan.v1",
    organizationId: "org_qualification_fixture",
    receipt: structuredClone(stagingCommunityContract.currentRunPlan),
  };
}

describe("staging Community qualification projection", () => {
  test("builds the exact self-digested public receipt from the positive vector", () => {
    const vector = stagingCommunityContract.vectors.find(({ expected }) => expected === "receipt")!;
    const receipt = buildStagingCommunityReceipt(plan(), responseFor(vector));
    expect(receipt as unknown).toEqual(vector.expectedReceipt!);
    expect(JSON.stringify(receipt)).not.toMatch(/organizationId|displayName|human|bearer|refresh|obo|session|headerPairs/i);
  });

  test("executes all thirteen hostile vectors as one stable refusal", () => {
    const hostile = stagingCommunityContract.vectors.filter(({ expected }) => expected === "refuse_no_output");
    expect(hostile).toHaveLength(13);
    for (const vector of hostile) {
      expect(() => buildStagingCommunityReceipt(plan(), responseFor(vector)), vector.name).toThrow();
      try {
        buildStagingCommunityReceipt(plan(), responseFor(vector));
      } catch (error) {
        expect((error as { code?: string }).code, vector.name).toBe("STAGING_COMMUNITY_QUALIFICATION_INVALID");
        expect(String(error), vector.name).not.toMatch(/org_qualification|7234a403|Qualification Fixture|header/i);
      }
    }
  });

  test("ignores ordinary metadata but refuses unknown reserved DAH authority", () => {
    const vector = stagingCommunityContract.vectors.find(({ expected }) => expected === "receipt")!;
    const ordinary = responseFor(vector);
    ordinary.headerPairs.push(
      ["content-type", "application/json"],
      ["cf-ray", "public-routing-metadata"],
      ["set-cookie", "must-not-be-retained"],
    );
    expect(buildStagingCommunityReceipt(plan(), ordinary) as unknown).toEqual(vector.expectedReceipt!);

    ordinary.headerPairs.push(["x-dah-organization-id", "forbidden"]);
    expect(() => buildStagingCommunityReceipt(plan(), ordinary)).toThrow();
  });

  test("binds the successful body to the one private organization intent", () => {
    const vector = stagingCommunityContract.vectors.find(({ expected }) => expected === "receipt")!;
    const wrongPlan = { ...plan(), organizationId: "org_other" };
    expect(() => buildStagingCommunityReceipt(wrongPlan, responseFor(vector))).toThrow();
  });

  test("forbids Community, origin, and provider-policy operator fields in the private plan", () => {
    const vector = stagingCommunityContract.vectors.find(({ expected }) => expected === "receipt")!;
    for (const extra of [
      { communityId: "community_override" },
      { operatorRelayUrl: "wss://override.invalid" },
      { operatorHttpsBase: "https://override.invalid" },
      { operatorProviderPolicy: "sha256:override" },
    ]) {
      expect(() => buildStagingCommunityReceipt({ ...plan(), ...extra } as never, responseFor(vector))).toThrow();
    }
  });
});

describe("staging device approval notice", () => {
  const approval = stagingCommunityContract.deviceApproval;
  const expectedRunId = "33333333-3333-4333-8333-333333333333";
  const validationTime = Date.parse(approval.validationTime);

  test("executes the exact one-positive and twenty-six-hostile owner vectors", () => {
    expect(approval.vectors).toHaveLength(27);
    for (const vector of approval.vectors) {
      const action = () => parseStagingDeviceApprovalNotice(vector.candidate, {
        qualificationRunId: expectedRunId,
        now: validationTime,
      });
      if (vector.expected === "notice") {
        expect(action() as unknown, vector.name).toEqual(vector.candidate);
      } else {
        expect(action, vector.name).toThrow();
        try { action(); } catch (error) {
          expect((error as { code?: string }).code, vector.name).toBe("STAGING_DEVICE_APPROVAL_NOTICE_INVALID");
          expect(String(error), vector.name).not.toMatch(/ABCD|auth-staging|attacker|forbidden|org_/i);
        }
      }
    }
  });

  test("accepts exactly 2048 UTF-8 URI bytes and refuses 2049", () => {
    const prefix = `${approval.authorizedOrigin}${approval.approvalPath}?user_code=`;
    const notice = {
      schema: approval.noticeSchema,
      qualificationRunId: expectedRunId,
      verificationUriComplete: `${prefix}${"A".repeat(approval.maximumVerificationUriBytes - Buffer.byteLength(prefix))}`,
      expiresAt: new Date(validationTime + 60_000).toISOString(),
    };
    expect(Buffer.byteLength(notice.verificationUriComplete)).toBe(2_048);
    expect(parseStagingDeviceApprovalNotice(notice, { qualificationRunId: expectedRunId, now: validationTime })).toEqual(notice);
    expect(() => parseStagingDeviceApprovalNotice({
      ...notice,
      verificationUriComplete: `${notice.verificationUriComplete}A`,
    }, { qualificationRunId: expectedRunId, now: validationTime })).toThrow();
  });

  test("requires strict future expiry and makes equality non-replayable", () => {
    const notice = approval.vectors.find(({ expected }) => expected === "notice")!.candidate;
    expect(() => parseStagingDeviceApprovalNotice(notice, {
      qualificationRunId: expectedRunId,
      now: Date.parse(String(notice.expiresAt)),
    })).toThrow();
    expect(parseStagingDeviceApprovalNotice(notice, {
      qualificationRunId: expectedRunId,
      now: Date.parse(String(notice.expiresAt)) - 1,
    }) as unknown).toEqual(notice);
  });
});

describe("staging Community private files", () => {
  test("publishes the notice before polling, tolerates I336 erasure, then writes the public receipt", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-flow-")));
    const planPath = join(root, "plan.json");
    const noticePath = join(root, "approval-notice.json");
    const outputPath = join(root, "i321-staging-slot-community.json");
    const noticeVector = stagingCommunityContract.deviceApproval.vectors.find(({ expected }) => expected === "notice")!;
    let callbackComplete!: () => void;
    const callbackCompleted = new Promise<void>((resolve) => { callbackComplete = resolve; });
    let approve!: () => void;
    const approval = new Promise<void>((resolve) => { approve = resolve; });
    try {
      await writeFile(planPath, `${JSON.stringify(plan())}\n`, { mode: 0o600 });
      const execution = executeStagingCommunityQualification({
        planPath,
        outputPath,
        approvalNoticePath: noticePath,
        runnerTemp: root,
      }, {
        now: () => Date.parse(stagingCommunityContract.deviceApproval.validationTime),
        requestId: () => "22222222-2222-4222-8222-222222222222",
        runDeviceFlow: async (input) => {
          await input.onUserAction({
            verification_uri_complete: String(noticeVector.candidate.verificationUriComplete),
            user_code: "ABCD-EFGH",
            expires_at: String(noticeVector.candidate.expiresAt),
          });
          callbackComplete();
          await approval;
          return {
            version: 3, credentialId: "55555555-5555-4555-8555-555555555555", generation: 1,
            issuer: input.profile.issuer, clientId: "drwn-cli", resource: input.profile.resource,
            accessToken: "ACCESS_SENTINEL", refreshToken: "REFRESH_SENTINEL",
            issuedAt: "2026-08-27T17:00:00.000Z", expiresAt: "2026-08-27T17:15:00.000Z",
            savedAt: "2026-08-27T17:00:00.000Z", userEmail: "human@example.test",
          };
        },
        fetcher: (async () => new Response(JSON.stringify(stagingCommunityContract.baseResponse.body), { status: 200, headers: {
          "content-type": "application/json",
          "x-dah-buzz-community-id": "7234a403-cb91-4dab-812c-c6a3dc50a6ef",
          "x-dah-organization-read-sha256": "7a0810d23c9ad22dbd64e0b68c100de45c8cfc11f3e945f40f96fae99351ad1b",
        } })) as unknown as typeof fetch,
      });

      await callbackCompleted;
      expect((await lstat(noticePath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(noticePath, "utf8"))).toEqual(noticeVector.candidate);
      await unlink(noticePath); // I336 relay consumes and erases the handoff while polling continues.
      approve();
      await execution;
      await expect(lstat(noticePath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(stagingCommunityContract.vectors[0]!.expectedReceipt);
    } finally {
      approve();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("erases the approval handoff and emits no receipt when device authorization fails", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-failure-")));
    const planPath = join(root, "plan.json");
    const noticePath = join(root, "approval-notice.json");
    const outputPath = join(root, "i321-staging-slot-community.json");
    const notice = stagingCommunityContract.deviceApproval.vectors.find(({ expected }) => expected === "notice")!.candidate;
    try {
      await writeFile(planPath, `${JSON.stringify(plan())}\n`, { mode: 0o600 });
      await expect(executeStagingCommunityQualification({
        planPath, outputPath, approvalNoticePath: noticePath, runnerTemp: root,
      }, {
        now: () => Date.parse(stagingCommunityContract.deviceApproval.validationTime),
        runDeviceFlow: async (input) => {
          await input.onUserAction({
            verification_uri_complete: String(notice.verificationUriComplete),
            user_code: "ABCD-EFGH",
            expires_at: String(notice.expiresAt),
          });
          throw new Error("DEVICE_FAILURE_SENTINEL");
        },
      })).rejects.toThrow();
      await expect(lstat(noticePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("publishes and cleans one create-only mode-0600 approval notice under RUNNER_TEMP", async () => {
    const runnerTemp = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-runner-")));
    const outside = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-outside-")));
    const path = join(runnerTemp, "approval-notice.json");
    const notice = stagingCommunityContract.deviceApproval.vectors.find(({ expected }) => expected === "notice")!.candidate;
    const options = {
      runnerTemp,
      qualificationRunId: String(notice.qualificationRunId),
      now: Date.parse(stagingCommunityContract.deviceApproval.validationTime),
    };
    try {
      const identity = await publishStagingDeviceApprovalNotice(path, notice, options);
      const metadata = await lstat(path);
      expect(metadata.isFile()).toBe(true);
      expect(metadata.isSymbolicLink()).toBe(false);
      expect(metadata.mode & 0o777).toBe(0o600);
      expect(metadata.nlink).toBe(1);
      expect(Object.keys(JSON.parse(await readFile(path, "utf8")))).toEqual([
        "expiresAt", "qualificationRunId", "schema", "verificationUriComplete",
      ]);
      expect(await readdir(runnerTemp)).toEqual(["approval-notice.json"]);

      const before = await readFile(path);
      await expect(publishStagingDeviceApprovalNotice(path, notice, options)).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
      expect(await readFile(path)).toEqual(before);
      await expect(publishStagingDeviceApprovalNotice(join(outside, "notice.json"), notice, options)).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });

      await cleanupStagingDeviceApprovalNotice(identity, { runnerTemp });
      await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
      await cleanupStagingDeviceApprovalNotice(identity, { runnerTemp });

      const second = await publishStagingDeviceApprovalNotice(path, notice, options);
      await unlink(path);
      await writeFile(path, "replacement\n", { mode: 0o600 });
      await expect(cleanupStagingDeviceApprovalNotice(second, { runnerTemp })).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
      expect(await readFile(path, "utf8")).toBe("replacement\n");
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("refuses symlinked approval paths and unsafe RUNNER_TEMP aliases", async () => {
    const canonical = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-real-")));
    const aliasRoot = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-alias-")));
    const alias = join(aliasRoot, "runner-temp-link");
    const target = join(canonical, "target.json");
    const symbolic = join(canonical, "approval-notice.json");
    const notice = stagingCommunityContract.deviceApproval.vectors.find(({ expected }) => expected === "notice")!.candidate;
    const base = {
      qualificationRunId: String(notice.qualificationRunId),
      now: Date.parse(stagingCommunityContract.deviceApproval.validationTime),
    };
    try {
      await writeFile(target, "target\n", { mode: 0o600 });
      await symlink(target, symbolic);
      await expect(publishStagingDeviceApprovalNotice(symbolic, notice, { ...base, runnerTemp: canonical })).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
      await symlink(canonical, alias);
      await expect(publishStagingDeviceApprovalNotice(join(alias, "new.json"), notice, { ...base, runnerTemp: alias })).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
    } finally {
      await rm(canonical, { recursive: true, force: true });
      await rm(aliasRoot, { recursive: true, force: true });
    }
  });

  test("reads only one stable mode-0600 regular plan with exact keys", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-community-plan-")));
    const path = join(root, "plan.json");
    try {
      await writeFile(path, `${JSON.stringify(plan())}\n`, { mode: 0o600 });
      expect(await readStagingCommunityPrivatePlan(path)).toEqual(plan());

      await chmod(path, 0o644);
      await expect(readStagingCommunityPrivatePlan(path)).rejects.toMatchObject({ code: "STAGING_COMMUNITY_PLAN_INVALID" });
      await chmod(path, 0o600);

      const linked = join(root, "linked.json");
      await link(path, linked);
      await expect(readStagingCommunityPrivatePlan(path)).rejects.toMatchObject({ code: "STAGING_COMMUNITY_PLAN_INVALID" });
      await rm(linked);

      const symbolic = join(root, "symbolic.json");
      await symlink(path, symbolic);
      await expect(readStagingCommunityPrivatePlan(symbolic)).rejects.toMatchObject({ code: "STAGING_COMMUNITY_PLAN_INVALID" });

      await writeFile(path, `${JSON.stringify({ ...plan(), communityId: "forbidden" })}\n`, { mode: 0o600 });
      await expect(readStagingCommunityPrivatePlan(path)).rejects.toMatchObject({ code: "STAGING_COMMUNITY_PLAN_INVALID" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("publishes exactly one create-only mode-0600 receipt and preserves an existing target", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-community-output-")));
    const output = join(root, "i321-staging-slot-community.json");
    const vector = stagingCommunityContract.vectors.find(({ expected }) => expected === "receipt")!;
    const receipt = buildStagingCommunityReceipt(plan(), responseFor(vector));
    try {
      await writeStagingCommunityReceipt(output, receipt);
      const metadata = await lstat(output);
      expect(metadata.isFile()).toBe(true);
      expect(metadata.isSymbolicLink()).toBe(false);
      expect(metadata.mode & 0o777).toBe(0o600);
      expect(metadata.nlink).toBe(1);
      expect(JSON.parse(await readFile(output, "utf8"))).toEqual(receipt);
      expect((await readFile(output, "utf8")).match(/organizationId|displayName|bearer|refresh|headerPairs/i)).toBeNull();
      expect(await readdir(root)).toEqual(["i321-staging-slot-community.json"]);

      const before = await readFile(output);
      await expect(writeStagingCommunityReceipt(output, receipt)).rejects.toMatchObject({ code: "STAGING_COMMUNITY_OUTPUT_INVALID" });
      expect(await readFile(output)).toEqual(before);
      await expect(writeStagingCommunityReceipt(join(root, "wrong-name.json"), receipt)).rejects.toMatchObject({
        code: "STAGING_COMMUNITY_OUTPUT_INVALID",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
