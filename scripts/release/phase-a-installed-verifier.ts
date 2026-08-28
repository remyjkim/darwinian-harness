#!/usr/bin/env bun
// ABOUTME: Executes the installed I321 portable and port-wire authorities from one measured tar.
// ABOUTME: Emits only exact vector counts and never contacts a live service or persists state.

import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

const portableContractSha256 = "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601";
const sourceCommitSha = "a".repeat(40);
const validationTime = Date.parse("2030-08-27T17:05:00.000Z");
const ownerPlan = {
  schema: "cl.dah.cli-management-phase-a-plan.v1",
  environmentId: "staging-1",
  sourceCommitSha,
  qualificationRunId: "11111111-1111-4111-8111-111111111111",
  contractSha256: portableContractSha256,
  providerPolicyVersion: `sha256:${"c".repeat(64)}`,
  relayUrl: "wss://kc.communities.buzz.xyz",
  httpsBase: "https://kc.communities.buzz.xyz",
  workflow: {
    repository: "curation-labs/darwinian-services",
    runId: 33181185126,
    runAttempt: 1,
  },
};
const organization = { organizationId: "org_acme", displayName: "Acme", revision: 7 };
const otherOrganization = { organizationId: "org_other", displayName: "Other", revision: 2 };

function canonicalJson(value: unknown): string {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError("installed_phase_a_fixture_invalid");
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
  let cleanupCalls = 0;
  return {
    cleanupCalls: () => cleanupCalls,
    port: {
      async execute(request: Record<string, unknown>) {
        if (
          vector.kind === "operation_failure" &&
          request.operation === vector.request?.operation &&
          request.component === vector.request?.component
        ) throw new Error("installed_port_failure");
        switch (request.operation) {
          case "version_readback":
            return {
              ...request,
              sourceCommitSha,
              versionReadbackSha256: request.component === "auth_hub"
                ? "d".repeat(64)
                : "e".repeat(64),
            };
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
            return {
              operation: request.operation,
              outcome: "passed",
              apiFamilyDeniedByManagement: true,
              managementFamilyAccepted: true,
              managementCredentialExposed: false,
            };
          case "organizations_list": {
            const count = vector.kind === "organization_cardinality"
              ? vector.organizationCount
              : 1;
            return {
              operation: request.operation,
              outcome: "passed",
              eligibility: request.eligibility,
              organizations: count === 0
                ? []
                : count === 2 ? [organization, otherOrganization] : [organization],
            };
          }
          case "organizations_read":
            return {
              operation: request.operation,
              outcome: "passed",
              authorizedOrganizationRead: authorizedRead(
                vector.kind === "organization_read_digest"
                  ? vector.evidenceDigestSha256
                  : undefined,
              ),
            };
          case "legacy_route_410":
            return {
              operation: request.operation,
              outcome: "retired",
              status: 410,
              code: "legacy_route_retired",
            };
          case "unsupported_protocol_426":
            return {
              operation: request.operation,
              outcome: "unsupported",
              status: 426,
              code: "client_protocol_unsupported",
            };
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
        if (vector.kind === "cleanup_override") {
          cleanup[String(vector.field)] = vector.value;
        }
        return cleanup;
      },
    },
  };
}

async function main(): Promise<void> {
  const packageRoot = process.argv[2];
  if (!packageRoot || !isAbsolute(packageRoot) || await realpath(packageRoot) !== resolve(packageRoot)) {
    throw new Error("installed package root invalid");
  }
  const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (metadata.name !== "darwinian" || metadata.version !== "1.4.2") {
    throw new Error("installed package identity invalid");
  }

  const portableRoot = join(packageRoot, "registry", "contracts", "cli-management-phase-a.v1");
  const portableContract = JSON.parse(await readFile(join(portableRoot, "contract.json"), "utf8")) as {
    vectors: ContractVector[];
  };
  if (portableContract.vectors.length !== 38) throw new Error("portable vector count invalid");
  const executor = await import(pathToFileURL(join(portableRoot, "executor.mjs")).href) as {
    I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256: string;
    executeI321CliManagementPhaseAV1(input: unknown): Promise<unknown>;
  };
  if (executor.I321_CLI_MANAGEMENT_PHASE_A_CONTRACT_SHA256 !== portableContractSha256) {
    throw new Error("portable executor identity invalid");
  }
  for (const vector of portableContract.vectors) {
    const fixture = portFor(vector);
    const candidatePlan = vector.kind === "plan_extra_field"
      ? { ...ownerPlan, [String(vector.field)]: vector.value }
      : vector.kind === "contract_digest_mismatch"
        ? { ...ownerPlan, contractSha256: "0".repeat(64) }
        : ownerPlan;
    let result: unknown;
    let error: unknown;
    try {
      result = await executor.executeI321CliManagementPhaseAV1({
        plan: candidatePlan,
        port: fixture.port,
        now: () => validationTime,
        randomUuid: () => "33333333-3333-4333-8333-333333333333",
      });
    } catch (candidate) {
      error = candidate;
    }
    if (vector.expected === "result") {
      if (error !== undefined || result === undefined) throw new Error("portable positive failed");
    } else if (
      result !== undefined ||
      !(error && typeof error === "object" && "code" in error) ||
      error.code !== vector.refusalCode
    ) {
      throw new Error("portable refusal mismatch");
    }
    if (fixture.cleanupCalls() !== vector.cleanupCalls) {
      throw new Error("portable cleanup count mismatch");
    }
  }

  const loader = await import(pathToFileURL(join(
    packageRoot,
    "cli",
    "core",
    "management",
    "phase-a-port-wire.ts",
  )).href) as {
    loadI321PhaseAPortWireAuthority(): Promise<{
      contract: { vectors: Array<{ caseId: string }> };
      projector: Record<string, unknown>;
    }>;
  };
  const authority = await loader.loadI321PhaseAPortWireAuthority();
  if (
    authority.contract.vectors.length !== 66 ||
    new Set(authority.contract.vectors.map(({ caseId }) => caseId)).size !== 66
  ) throw new Error("port vector inventory invalid");
  const projector = authority.projector as Record<string, unknown> & {
    I321_PHASE_A_LOCAL_OPERATION_ORDER_V1: unknown[];
    I321_PHASE_A_REMOTE_CALL_ORDER_V1: unknown[];
    parseI321PhaseAPortExecuteRequestV1(value: unknown): unknown;
    parseI321PhaseAPortCleanupRequestV1(value: unknown): unknown;
  };
  if (
    projector.I321_PHASE_A_LOCAL_OPERATION_ORDER_V1.length !== 2 ||
    projector.I321_PHASE_A_REMOTE_CALL_ORDER_V1.length !== 12
  ) throw new Error("port operation inventory invalid");
  for (const request of projector.I321_PHASE_A_REMOTE_CALL_ORDER_V1) {
    projector.parseI321PhaseAPortExecuteRequestV1(request);
  }
  for (const cleanupMode of ["normal", "fail_safe"]) {
    projector.parseI321PhaseAPortCleanupRequestV1({
      schema: "cl.dah.cli-management-phase-a-port-cleanup-request.v1",
      cleanupMode,
    });
  }
  process.stdout.write(`${JSON.stringify({ portableVectors: 38, portVectors: 66 })}\n`);
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    process.stderr.write("Installed Phase-A authority verification failed.\n");
    process.exitCode = 1;
  }
}
