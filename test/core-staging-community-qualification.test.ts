// ABOUTME: Executes the exact I321 device-approval notice vectors and filesystem lease.
// ABOUTME: D52 public receipt projection and output pairing are covered by dedicated Phase-A tests.

import { describe, expect, test } from "bun:test";
import { chmod, link, lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupStagingDeviceApprovalNotice,
  parseStagingDeviceApprovalNotice,
  preflightStagingDeviceApprovalNoticePath,
  publishStagingDeviceApprovalNotice,
  stagingCommunityContract,
} from "../cli/core/management/staging-community-qualification";

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

describe("staging device approval notice files", () => {
  test("requires owner mode-0700 RUNNER_TEMP and immediate parent before auth", async () => {
    const runnerTemp = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-notice-mode-")));
    const path = join(runnerTemp, "approval-notice.json");
    try {
      await chmod(runnerTemp, 0o755);
      await expect(preflightStagingDeviceApprovalNoticePath(path, { runnerTemp })).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
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

      const second = await publishStagingDeviceApprovalNotice(path, notice, options) as Awaited<ReturnType<typeof publishStagingDeviceApprovalNotice>> & {
        handle: FileHandle;
      };
      const heldMetadata = await second.handle.stat({ bigint: true });
      await unlink(path);
      await writeFile(path, before, { mode: 0o600 });
      const replacementMetadata = await lstat(path, { bigint: true });
      expect([replacementMetadata.dev, replacementMetadata.ino]).not.toEqual([heldMetadata.dev, heldMetadata.ino]);
      await expect(cleanupStagingDeviceApprovalNotice(second, { runnerTemp })).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
      expect(await readFile(path)).toEqual(before);
      await expect(second.handle.stat()).rejects.toMatchObject({ code: "EBADF" });
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

  test("preserves and refuses same-inode notice mutation before cleanup", async () => {
    const runnerTemp = await realpath(await mkdtemp(join(tmpdir(), "drwn-staging-approval-mutation-")));
    const path = join(runnerTemp, "approval-notice.json");
    const notice = stagingCommunityContract.deviceApproval.vectors.find(({ expected }) => expected === "notice")!.candidate;
    try {
      const lease = await publishStagingDeviceApprovalNotice(path, notice, {
        runnerTemp,
        qualificationRunId: String(notice.qualificationRunId),
        now: Date.parse(stagingCommunityContract.deviceApproval.validationTime),
      });
      const mutation = Buffer.from(await readFile(path));
      mutation[0] = mutation[0] === 0x7b ? 0x5b : 0x7b;
      await writeFile(path, mutation, { mode: 0o600 });

      await expect(cleanupStagingDeviceApprovalNotice(lease, { runnerTemp })).rejects.toMatchObject({
        code: "STAGING_DEVICE_APPROVAL_NOTICE_FILE_INVALID",
      });
      expect(await readFile(path)).toEqual(mutation);
      await expect(lease.handle.stat()).rejects.toMatchObject({ code: "EBADF" });
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  });

});
