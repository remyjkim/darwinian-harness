// ABOUTME: Proves Worker admits and invokes the I321-owned D52 executor without reimplementing its semantics.
// ABOUTME: The Worker wrapper retains process-local authority and exposes only one stable refusal.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  executeI321ManagementPhaseA,
  type I321ManagementPhaseAOperationRequest,
  type I321ManagementPhaseAPort,
} from "../cli/core/management/phase-a";

const sourceCommitSha = "a".repeat(40);
const contractSha256 = "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601";
const now = Date.parse("2030-08-27T17:05:00.000Z");
const plan = {
  schema: "cl.dah.cli-management-phase-a-plan.v1",
  environmentId: "staging-1",
  sourceCommitSha,
  qualificationRunId: "11111111-1111-4111-8111-111111111111",
  contractSha256,
  providerPolicyVersion: `sha256:${"c".repeat(64)}`,
  relayUrl: "wss://kc.communities.buzz.xyz",
  httpsBase: "https://kc.communities.buzz.xyz",
  workflow: { repository: "curation-labs/darwinian-services", runId: 33127773220, runAttempt: 1 },
} as const;
const organization = { organizationId: "org_acme", displayName: "Acme", revision: 7 } as const;

function canonicalJson(value: unknown): string {
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError("fixture_invalid");
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function authorizedRead() {
  const evidence = {
    schema: "cl.dah.authorized-organization-read.v1",
    requestId: "22222222-2222-4222-8222-222222222222",
    organization,
    communityId: "7234a403-cb91-4dab-812c-c6a3dc50a6ef",
  } as const;
  return {
    ...evidence,
    evidenceDigestSha256: digest({ schema: "cl.dah.authorized-organization-read-digest.v1", evidence }),
  };
}

function fixturePort(organizations: ReadonlyArray<typeof organization> = [organization]) {
  const requests: I321ManagementPhaseAOperationRequest[] = [];
  let cleanupCalls = 0;
  const port: I321ManagementPhaseAPort = {
    async execute(request) {
      requests.push(structuredClone(request));
      switch (request.operation) {
        case "version_readback":
          return { ...request, sourceCommitSha, versionReadbackSha256: request.component === "auth_hub" ? "d".repeat(64) : "e".repeat(64) };
        case "fresh_login":
          return { operation: request.operation, outcome: "passed", issuedAt: "2030-08-27T17:00:00.000Z", expiresAt: "2030-08-27T17:15:00.000Z", storedCredentialUsed: false };
        case "displayed_consent":
          return { operation: request.operation, outcome: "passed", consentDisplayed: true, consentApproved: true };
        case "api_management_family_separation":
          return { operation: request.operation, outcome: "passed", apiFamilyDeniedByManagement: true, managementFamilyAccepted: true, managementCredentialExposed: false };
        case "organizations_list":
          return { operation: request.operation, outcome: "passed", eligibility: request.eligibility, organizations };
        case "organizations_read":
          return { operation: request.operation, outcome: "passed", authorizedOrganizationRead: authorizedRead() };
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
      return {
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
    },
  };
  return { port, requests, cleanupCalls: () => cleanupCalls };
}

describe("Worker I321 Phase-A wrapper", () => {
  test("invokes the exact owner operation order and returns only the frozen process-local result", async () => {
    const fixture = fixturePort();
    const result = await executeI321ManagementPhaseA({
      plan,
      port: fixture.port,
      now: () => now,
      randomUuid: () => "33333333-3333-4333-8333-333333333333",
    });

    expect(fixture.requests).toEqual([
      { operation: "version_readback", component: "auth_hub" },
      { operation: "version_readback", component: "services_web" },
      { operation: "fresh_login" },
      { operation: "displayed_consent" },
      { operation: "api_management_family_separation" },
      { operation: "organizations_list", eligibility: "active_management" },
      { operation: "organizations_read", organizationId: "org_acme" },
      { operation: "cross_organization_denial" },
      { operation: "direct_origin_denial" },
      { operation: "changed_binding_denial" },
      { operation: "replay_denial" },
      { operation: "expired_denial" },
      { operation: "legacy_route_410" },
      { operation: "unsupported_protocol_426" },
    ]);
    expect(result.organization).toEqual(organization);
    expect(result.authorizedOrganizationRead).toEqual(authorizedRead());
    expect(result.readiness.observedAt).toBe("2030-08-27T17:05:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result.readiness)).not.toMatch(/organizationId|displayName|communityId|authorization|token|human/i);
    expect(fixture.cleanupCalls()).toBe(1);
  });

  test("maps owner refusal to the existing stable Worker qualification error without reflection", async () => {
    const fixture = fixturePort([]);
    await expect(executeI321ManagementPhaseA({ plan, port: fixture.port, now: () => now })).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
      message: "Staging Community qualification refused.",
    });
    expect(fixture.cleanupCalls()).toBe(1);
  });
});
