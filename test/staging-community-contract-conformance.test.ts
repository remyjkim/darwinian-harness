// ABOUTME: Pins the exact merged I321 staging Community interoperability artifact in the Worker package.
// ABOUTME: Freezes the 14-vector ceremony, authority headers, public receipt, and non-retention boundaries.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageRoot = join(import.meta.dir, "..");
const contractPath = join(packageRoot, "registry", "contracts", "staging-slot-community.v1", "contract.json");
const lockPath = join(packageRoot, "cli", "generated", "dah-staging-slot-community-contract-lock.json");
const expectedSha256 = "89e7ad1410a28445678a812f1ec5e4a9e7cbb51e38c320ccdbc728843c7ea387";

function artifact(): Record<string, any> {
  return JSON.parse(readFileSync(contractPath, "utf8"));
}

describe("I321 staging Community contract", () => {
  test("vendors the exact PR638 bytes and immutable authority lock", () => {
    expect(existsSync(contractPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    const bytes = readFileSync(contractPath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedSha256);
    expect(JSON.parse(readFileSync(lockPath, "utf8"))).toEqual({
      schema: "dah.staging-slot-community-contract-lock",
      schemaVersion: 1,
      servicesRepository: "curation-labs/darwinian-services",
      sourceCommit: "29267384aee6a73d5bc4330e2ac81413e0cf15fb",
      mergedMainCommit: "864c2434c441878f4542dcfbd42a21439ba970f8",
      sha256: expectedSha256,
      vectorCount: 14,
      positiveVectorCount: 1,
      hostileVectorCount: 13,
    });
  });

  test("freezes the one read route, two authority headers, and process-local ceremony", () => {
    const contract = artifact();
    expect(Object.keys(contract)).toEqual([
      "schema", "schemaVersion", "authority", "ceremony", "baseResponse", "currentRunPlan", "vectors",
    ]);
    expect(contract.schema).toBe("cl.dah.staging-slot-community-interoperability.v1");
    expect(contract.authority).toEqual({
      routeKey: "organizations.read",
      successStatus: 200,
      communityHeader: "x-dah-buzz-community-id",
      organizationReadDigestHeader: "x-dah-organization-read-sha256",
      canonicalization: "canonical-json/v1",
      authorizedReadDigestSchema: "cl.dah.authorized-organization-read-digest.v1",
      receiptDigestSchema: "cl.dah.staging-slot-community-digest.v1",
      publicReceiptSchema: "cl.dah.staging-slot-community.v1",
    });
    expect(contract.ceremony).toMatchObject({
      invocation: "hidden_internal_qualification_only",
      authentication: "device_flow_process_local",
      currentRunPlan: "mode_0600_same_run_file",
      output: "caller_supplied_mode_0600_create_only_file",
      ordinaryJsonOutput: "unchanged_header_free",
      cloudContext: "organization_selection_only_no_authority_headers_or_receipt",
    });
    expect(contract.ceremony.forbiddenInputs).toEqual([
      "operator_community_id", "operator_relay_url", "operator_https_base", "operator_provider_policy",
    ]);
  });

  test("contains one exact receipt and thirteen refuse-no-output vectors", () => {
    const contract = artifact();
    expect(contract.vectors).toHaveLength(14);
    expect(contract.vectors.filter(({ expected }: any) => expected === "receipt")).toHaveLength(1);
    expect(contract.vectors.filter(({ expected }: any) => expected === "refuse_no_output")).toHaveLength(13);
    expect(contract.vectors.map(({ name }: any) => name)).toEqual([
      "authenticated_organization_read_emits_exact_public_receipt",
      "missing_community_header_refuses",
      "duplicate_community_header_refuses",
      "missing_read_digest_header_refuses",
      "duplicate_read_digest_header_refuses",
      "malformed_community_header_refuses",
      "malformed_read_digest_header_refuses",
      "wrong_route_refuses",
      "non_success_status_refuses",
      "malformed_body_request_id_refuses",
      "body_unknown_field_refuses",
      "body_drift_against_read_digest_refuses",
      "community_drift_against_read_digest_refuses",
      "unknown_reserved_dah_header_refuses",
    ]);
  });
});
