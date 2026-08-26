// ABOUTME: Pins non-secret mutation replay journals and crash-safe phase progression.
// ABOUTME: Exact bytes and profile/route fingerprints resume once; secret requests never persist.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advanceClientOperation,
  createClientOperation,
  findMatchingClientOperation,
  loadClientOperation,
  removeCompletedClientOperation,
} from "../cli/core/management/operation-journal";

const profileDigest = "a".repeat(64);
const operationId = "123e4567-e89b-42d3-a456-426614174000";
const bytes = new TextEncoder().encode('{"environment":"staging","name":"worker-alpha","organizationId":"org_alpha"}');
let root: string | null = null;
async function fixture(): Promise<string> {
  root = await realpath(await mkdtemp(join(tmpdir(), "drwn-operation-")));
  return root;
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = null; });

describe("client operation journal", () => {
  test("persists exact non-secret request bytes before send and resumes one fingerprint", async () => {
    const project = await fixture();
    const created = await createClientOperation(project, {
      operationId,
      profileDigest,
      routeKey: "deployed_workers.register",
      requestBytes: bytes,
      now: "2026-08-25T12:00:00.000Z",
    });
    expect(created.phase).toBe("prepared");
    expect(Buffer.from(created.requestBase64, "base64")).toEqual(Buffer.from(bytes));
    expect(created.requestFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await findMatchingClientOperation(project, { profileDigest, routeKey: "deployed_workers.register", requestBytes: bytes }))
      .toEqual(created);
    expect(await loadClientOperation(project, operationId)).toEqual(created);
  });

  test("advances monotonically and removes only after receipt plus context durability", async () => {
    const project = await fixture();
    await createClientOperation(project, {
      operationId, profileDigest, routeKey: "deployed_workers.register", requestBytes: bytes,
      now: "2026-08-25T12:00:00.000Z",
    });
    await expect(advanceClientOperation(project, operationId, "receipt_verified", "2026-08-25T12:01:00.000Z"))
      .rejects.toMatchObject({ code: "CLIENT_OPERATION_INVALID" });
    await advanceClientOperation(project, operationId, "sent", "2026-08-25T12:01:00.000Z");
    await expect(advanceClientOperation(project, operationId, "indeterminate", "2026-08-25T12:00:30.000Z"))
      .rejects.toMatchObject({ code: "CLIENT_OPERATION_INVALID" });
    for (const [phase, now] of [
      ["indeterminate", "2026-08-25T12:02:00.000Z"],
      ["receipt_verified", "2026-08-25T12:03:00.000Z"],
      ["context_committed", "2026-08-25T12:04:00.000Z"],
    ] as const) {
      await advanceClientOperation(project, operationId, phase, now);
    }
    await removeCompletedClientOperation(project, operationId);
    expect(await loadClientOperation(project, operationId)).toBeNull();
  });

  test("rejects changed-byte reuse, phase regression, ambiguous matches, and secret replay", async () => {
    const project = await fixture();
    await createClientOperation(project, {
      operationId, profileDigest, routeKey: "deployed_workers.register", requestBytes: bytes,
      now: "2026-08-25T12:00:00.000Z",
    });
    await expect(createClientOperation(project, {
      operationId, profileDigest, routeKey: "deployed_workers.register", requestBytes: new TextEncoder().encode('{"different":true}'),
      now: "2026-08-25T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "OPERATION_ID_CONFLICT" });
    await advanceClientOperation(project, operationId, "sent", "2026-08-25T12:01:00.000Z");
    await expect(advanceClientOperation(project, operationId, "prepared", "2026-08-25T12:02:00.000Z"))
      .rejects.toMatchObject({ code: "CLIENT_OPERATION_INVALID" });
    await expect(createClientOperation(project, {
      operationId: "123e4567-e89b-42d3-a456-426614174001",
      profileDigest,
      routeKey: "secrets.set",
      requestBytes: new TextEncoder().encode('{"value":"low-entropy"}'),
      now: "2026-08-25T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "SECRET_REPLAY_FORBIDDEN" });
    const sentinel = "SENTINEL_JOURNAL_CREDENTIAL";
    try {
      await createClientOperation(project, {
        operationId: "123e4567-e89b-42d3-a456-426614174003",
        profileDigest,
        routeKey: "deployed_workers.register",
        requestBytes: new TextEncoder().encode(JSON.stringify({ access_token: sentinel })),
        now: "2026-08-25T12:00:00.000Z",
      });
      throw new Error("credential-shaped journal unexpectedly passed");
    } catch (error) {
      expect(error).toMatchObject({ code: "CLIENT_OPERATION_INVALID" });
      expect(String(error)).not.toContain(sentinel);
      expect(JSON.stringify(error)).not.toContain(sentinel);
    }
    await expect(createClientOperation(project, {
      operationId: "123e4567-e89b-42d3-a456-426614174004",
      profileDigest,
      routeKey: "runs.create",
      requestBytes: new TextEncoder().encode(JSON.stringify({ input: "human-authored prompt" })),
      now: "2026-08-25T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "SENSITIVE_REPLAY_FORBIDDEN" });
    await createClientOperation(project, {
      operationId: "123e4567-e89b-42d3-a456-426614174002",
      profileDigest,
      routeKey: "deployed_workers.register",
      requestBytes: bytes,
      now: "2026-08-25T12:03:00.000Z",
    });
    await expect(findMatchingClientOperation(project, {
      profileDigest,
      routeKey: "deployed_workers.register",
      requestBytes: bytes,
    })).rejects.toMatchObject({ code: "OPERATION_RESUME_AMBIGUOUS" });
  });
});
