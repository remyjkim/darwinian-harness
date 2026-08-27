// ABOUTME: Executes all I321 staging Community vectors through the Worker-owned strict projection.
// ABOUTME: Proves Community is derived from one authorized organization read and never from operator input.

import { describe, expect, test } from "bun:test";
import { chmod, link, lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildStagingCommunityReceipt,
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

describe("staging Community private files", () => {
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
