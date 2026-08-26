// ABOUTME: Pins machine organization selection and project Deployed Worker context as non-authoritative hints.
// ABOUTME: Context is strict, profile-isolated, owner-locked, and contains no role or credential fields.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearMachineOrganization,
  clearProjectCloudContext,
  loadMachineCloudContext,
  loadProjectCloudContext,
  selectMachineOrganization,
  writeProjectCloudContext,
} from "../cli/core/management/context-store";

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
let root: string | null = null;
async function fixture(): Promise<string> {
  root = await realpath(await mkdtemp(join(tmpdir(), "drwn-context-")));
  return root;
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = null; });

describe("management context store", () => {
  test("stores machine organization selections independently by profile digest", async () => {
    const home = await fixture();
    await selectMachineOrganization(home, digestA, "org_alpha", "2026-08-25T12:00:00.000Z");
    await selectMachineOrganization(home, digestB, "org_beta", "2026-08-25T12:01:00.000Z");
    expect(await loadMachineCloudContext(home)).toEqual({
      schema: "drwn.cloud-context",
      schemaVersion: 1,
      selections: [
        { profileDigest: digestA, organizationId: "org_alpha", updatedAt: "2026-08-25T12:00:00.000Z" },
        { profileDigest: digestB, organizationId: "org_beta", updatedAt: "2026-08-25T12:01:00.000Z" },
      ],
    });
    await clearMachineOrganization(home, digestA);
    expect((await loadMachineCloudContext(home))!.selections).toHaveLength(1);
  });

  test("writes only the verified project target tuple and clears it explicitly", async () => {
    const project = await fixture();
    const value = {
      schema: "drwn.project-cloud-context" as const,
      schemaVersion: 1 as const,
      profileDigest: digestA,
      organizationId: "org_alpha",
      deployedWorkerId: "deployed_worker_alpha",
      verifiedAt: "2026-08-25T12:00:00.000Z",
    };
    await writeProjectCloudContext(project, value);
    expect(await loadProjectCloudContext(project)).toEqual(value);
    const bytes = await readFile(join(project, ".agents", "drwn", "cloud.local.json"), "utf8");
    for (const forbidden of ["role", "workerId", "authorization", "token", "keyRef", "secret"]) {
      expect(bytes).not.toContain(`\"${forbidden}\"`);
    }
    await clearProjectCloudContext(project);
    expect(await loadProjectCloudContext(project)).toBeNull();
  });

  test("rejects malformed and unknown state without treating opaque prefixes as ID kinds", async () => {
    const project = await fixture();
    const path = join(project, ".agents", "drwn", "cloud.local.json");
    await writeProjectCloudContext(project, {
      schema: "drwn.project-cloud-context",
      schemaVersion: 1,
      profileDigest: digestA,
      organizationId: "org_alpha",
      deployedWorkerId: "deployed_worker_alpha",
      verifiedAt: "2026-08-25T12:00:00.000Z",
    });
    const original = JSON.parse(await readFile(path, "utf8"));
    for (const candidate of [
      { ...original, role: "owner" },
      { ...original, organizationId: "bad/org" },
      { ...original, deployedWorkerId: "bad/id" },
      { ...original, schemaVersion: 2 },
    ]) {
      await writeFile(path, `${JSON.stringify(candidate)}\n`);
      await expect(loadProjectCloudContext(project)).rejects.toMatchObject({ code: "CLOUD_CONTEXT_INVALID" });
    }
  });

  test("maps invalid mutation inputs to one stable non-reflecting context error", async () => {
    const project = await fixture();
    await expect(writeProjectCloudContext(project, {
      schema: "drwn.project-cloud-context",
      schemaVersion: 1,
      profileDigest: digestA,
      organizationId: "bad/org",
      deployedWorkerId: "deployed_worker_alpha",
      verifiedAt: "2026-08-25T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "CLOUD_CONTEXT_INVALID" });
    await expect(selectMachineOrganization(project, digestA, "bad/org", "2026-08-25T12:00:00.000Z"))
      .rejects.toMatchObject({ code: "CLOUD_CONTEXT_INVALID" });
    await expect(clearMachineOrganization(project, "not-a-digest"))
      .rejects.toMatchObject({ code: "CLOUD_CONTEXT_INVALID" });
  });
});
