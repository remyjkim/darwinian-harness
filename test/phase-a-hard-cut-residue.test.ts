// ABOUTME: Prevents the superseded one-file organization-read qualification path from surviving.
// ABOUTME: Keeps only the approval-notice primitives beside the new composite D52 ceremony.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("D52 qualification hard cut", () => {
  test("removes the old private organization plan and direct-read execution path", async () => {
    const source = await readFile(join(
      root,
      "cli",
      "core",
      "management",
      "staging-community-qualification.ts",
    ), "utf8");
    for (const residue of [
      "cl.drwn.staging-slot-community-plan.v1",
      "executeStagingCommunityQualification",
      "readStagingCommunityPrivatePlan",
      "writeStagingCommunityReceipt",
      "buildStagingCommunityReceipt",
      "resolveManagementRoute",
      "validateManagementHeaders",
    ]) {
      expect(source, residue).not.toContain(residue);
    }
  });
});
