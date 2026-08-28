// ABOUTME: Pins the merged I321 D52 Phase-A contract, executor, and manifest as exact Worker package bytes.
// ABOUTME: Refuses local reimplementation or mutable Services-checkout authority.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const authorityRoot = join(root, "registry", "contracts", "cli-management-phase-a.v1");
const lockPath = join(root, "cli", "generated", "dah-cli-management-phase-a-lock.json");

const expected = {
  "contract.json": "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601",
  "executor.mjs": "074be4206780d60e605ca222ae3311605cc00cfe8c593625a93f7954e76c9e0d",
  "manifest.json": "b84190c6879795f84f433e36be35ee97573f3b70961d0af901cd113c9158490f",
} as const;
const sourceCommitSha = "a".repeat(40);
const validationTime = Date.parse("2030-08-27T17:05:00.000Z");
const ownerPlan = {
  schema: "cl.dah.cli-management-phase-a-plan.v1",
  environmentId: "staging-1",
  sourceCommitSha,
  qualificationRunId: "11111111-1111-4111-8111-111111111111",
  contractSha256: expected["contract.json"],
  providerPolicyVersion: `sha256:${"c".repeat(64)}`,
  relayUrl: "wss://kc.communities.buzz.xyz",
  httpsBase: "https://kc.communities.buzz.xyz",
  workflow: { repository: "curation-labs/darwinian-services", runId: 33127773220, runAttempt: 1 },
};
const organization = { organizationId: "org_acme", displayName: "Acme", revision: 7 };
const otherOrganization = { organizationId: "org_other", displayName: "Other", revision: 2 };

type ContractVector = {
  name: string;
  kind: string;
  expected: "result" | "refusal";
  refusalCode?: string;
  field?: string;
  value?: unknown;
  organizationCount?: number;
  request?: { operation: string; component?: string };
  override?: Record<string, unknown>;
  evidenceDigestSha256?: string;
  operation?: string;
  cleanupCalls: number;
};

function canonicalJson(value: unknown): string {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError("fixture_invalid");
}

function authorizedRead(digestOverride?: string) {
  const evidence = {
    schema: "cl.dah.authorized-organization-read.v1",
    requestId: "22222222-2222-4222-8222-222222222222",
    organization,
    communityId: "7234a403-cb91-4dab-812c-c6a3dc50a6ef",
  };
  return {
    ...evidence,
    evidenceDigestSha256: digestOverride ?? createHash("sha256").update(canonicalJson({
      schema: "cl.dah.authorized-organization-read-digest.v1",
      evidence,
    })).digest("hex"),
  };
}

function portFor(vector: ContractVector) {
  const requests: Array<{ operation: string; component?: string; organizationId?: string; eligibility?: string }> = [];
  let cleanupCalls = 0;
  return {
    requests,
    cleanupCalls: () => cleanupCalls,
    port: {
      async execute(request: { operation: string; component?: string; organizationId?: string; eligibility?: string }) {
        requests.push(structuredClone(request));
        if (
          vector.kind === "operation_failure" &&
          request.operation === vector.request?.operation &&
          request.component === vector.request?.component
        ) throw new Error("BEARER_OPERATION_FAILURE_SENTINEL");
        switch (request.operation) {
          case "version_readback":
            return { ...request, sourceCommitSha, versionReadbackSha256: request.component === "auth_hub" ? "d".repeat(64) : "e".repeat(64) };
          case "fresh_login":
            return {
              operation: request.operation,
              outcome: "passed",
              issuedAt: "2030-08-27T17:00:00.000Z",
              expiresAt: "2030-08-27T17:15:00.000Z",
              storedCredentialUsed: false,
              ...(vector.kind === "fresh_login_override" ? vector.override : {}),
            };
          case "displayed_consent":
            return {
              operation: request.operation,
              outcome: "passed",
              consentDisplayed: true,
              consentApproved: true,
              ...(vector.kind === "observation_leak" && vector.operation === request.operation
                ? { [String(vector.field)]: vector.value }
                : {}),
            };
          case "api_management_family_separation":
            return { operation: request.operation, outcome: "passed", apiFamilyDeniedByManagement: true, managementFamilyAccepted: true, managementCredentialExposed: false };
          case "organizations_list": {
            const count = vector.kind === "organization_cardinality" ? vector.organizationCount : 1;
            return {
              operation: request.operation,
              outcome: "passed",
              eligibility: request.eligibility,
              organizations: count === 0 ? [] : count === 2 ? [organization, otherOrganization] : [organization],
            };
          }
          case "organizations_read":
            return {
              operation: request.operation,
              outcome: "passed",
              authorizedOrganizationRead: authorizedRead(vector.kind === "organization_read_digest" ? vector.evidenceDigestSha256 : undefined),
            };
          case "legacy_route_410":
            return { operation: request.operation, outcome: "retired", status: 410, code: "legacy_route_retired" };
          case "unsupported_protocol_426":
            return { operation: request.operation, outcome: "unsupported", status: 426, code: "client_protocol_unsupported" };
          default:
            return { operation: request.operation, outcome: "denied" };
        }
      },
      async cleanup() {
        cleanupCalls += 1;
        const cleanup: Record<string, unknown> = {
          schema: "cl.dah.cli-management-phase-a-cleanup.v1",
          temporarySessionsRemaining: 0,
          temporaryManagementGrantsRemaining: 0,
          unconsumedOboJtisRemaining: 0,
          domainMutationsCreated: 0,
          maintenanceCommandsCreated: 0,
          queueMessagesCreated: 0,
          providerMutationsCreated: 0,
          auditRecordsVerified: 12,
        };
        if (vector.kind === "cleanup_override") cleanup[String(vector.field)] = vector.value;
        return cleanup;
      },
    },
  };
}

describe("I321 D52 Phase-A authority", () => {
  test("vendors the exact merged contract, dependency-closed executor, and manifest bytes", async () => {
    for (const [name, sha256] of Object.entries(expected)) {
      const path = join(authorityRoot, name);
      expect(await Bun.file(path).exists(), name).toBe(true);
      const bytes = await readFile(path);
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(sha256);
    }
  });

  test("pins the exact I321 source, merge, file digests, and vector count", async () => {
    expect(await Bun.file(lockPath).exists()).toBe(true);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual({
      schema: "dah.cli-management-phase-a-contract-lock",
      schemaVersion: 1,
      servicesRepository: "curation-labs/darwinian-services",
      sourceCommit: "6b1f95c6a51733801cf6f6489bcfd8a45e4ac5ba",
      mergedMainCommit: "70cbe3805b17e5046150bd3863504ae300c039ba",
      contractSha256: expected["contract.json"],
      executorSha256: expected["executor.mjs"],
      manifestSha256: expected["manifest.json"],
      vectorCount: 38,
    });
  });

  test("admits the exact manifest, owner surface, operation order, refusal set, and vector inventory", async () => {
    const manifest = JSON.parse(await readFile(join(authorityRoot, "manifest.json"), "utf8"));
    expect(manifest).toEqual({
      schema: "cl.dah.cli-management-phase-a-artifact-manifest.v1",
      schemaVersion: 1,
      sourceAuthority: "containing_git_commit",
      contractFile: "contract.json",
      contractSha256: expected["contract.json"],
      contractBytes: 12_103,
      executorFile: "executor.mjs",
      executorSha256: expected["executor.mjs"],
      executorBytes: 291_541,
      vectorCount: 38,
    });

    const contract = JSON.parse(await readFile(join(authorityRoot, "contract.json"), "utf8"));
    expect(contract.schema).toBe("cl.dah.cli-management-phase-a-interoperability.v1");
    expect(contract.schemaVersion).toBe(1);
    expect(contract.authority).toMatchObject({
      owner: "I321",
      executorEntryPoint: "executeI321CliManagementPhaseAV1",
      organizationSelection: "exactly_one_active_management_eligible",
      processBoundary: "bearer_and_organization_process_local",
    });
    expect(contract.operationOrder).toHaveLength(14);
    expect(contract.refusalCodes).toEqual([
      "plan_invalid", "port_failed", "version_readback_invalid", "check_failed",
      "organization_cardinality_invalid", "organization_read_invalid", "cleanup_invalid", "receipt_invalid",
    ]);
    expect(contract.vectors).toHaveLength(38);
    expect(contract.vectors.filter(({ expected }: { expected: string }) => expected === "result")).toHaveLength(1);
    expect(contract.vectors.filter(({ expected }: { expected: string }) => expected === "refusal")).toHaveLength(37);
  });

  test("loads only the dependency-closed owner executor with its bound contract digest", async () => {
    const executor = await import(join(authorityRoot, "executor.mjs"));
    expect(Object.keys(executor).sort()).toEqual([
      "I321CliManagementPhaseARefusal",
      "I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256",
      "executeI321CliManagementPhaseAV1",
    ]);
    expect(executor.I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256).toBe(expected["contract.json"]);
    expect(typeof executor.executeI321CliManagementPhaseAV1).toBe("function");
  });

  test("executes all thirty-eight owner vectors without changing their outcomes or cleanup counts", async () => {
    const contract = JSON.parse(await readFile(join(authorityRoot, "contract.json"), "utf8")) as { vectors: ContractVector[] };
    const executor = await import(join(authorityRoot, "executor.mjs")) as {
      executeI321CliManagementPhaseAV1(input: unknown): Promise<unknown>;
    };
    for (const vector of contract.vectors) {
      const fixture = portFor(vector);
      const candidatePlan = vector.kind === "plan_extra_field"
        ? { ...ownerPlan, [String(vector.field)]: vector.value }
        : vector.kind === "contract_digest_mismatch"
          ? { ...ownerPlan, contractSha256: "0".repeat(64) }
          : ownerPlan;
      let result: unknown;
      let refusal: unknown;
      try {
        result = await executor.executeI321CliManagementPhaseAV1({
          plan: candidatePlan,
          port: fixture.port,
          now: () => validationTime,
          randomUuid: () => "33333333-3333-4333-8333-333333333333",
        });
      } catch (error) {
        refusal = error;
      }
      if (vector.expected === "result") {
        expect(refusal, vector.name).toBeUndefined();
        expect(result, vector.name).toMatchObject({
          organization,
          authorizedOrganizationRead: authorizedRead(),
        });
      } else {
        expect(result, vector.name).toBeUndefined();
        expect(refusal, vector.name).toMatchObject({
          name: "I321CliManagementPhaseARefusal",
          code: vector.refusalCode,
          message: "I321 Phase-A qualification refused.",
        });
        expect(String(refusal), vector.name).not.toMatch(/BEARER|organizationId|communityId|human/i);
      }
      if (vector.kind === "organization_cardinality") {
        expect(fixture.requests.some(({ operation }) => operation === "organizations_read"), vector.name).toBe(false);
      }
      expect(fixture.cleanupCalls(), vector.name).toBe(vector.cleanupCalls);
    }
  });
});
