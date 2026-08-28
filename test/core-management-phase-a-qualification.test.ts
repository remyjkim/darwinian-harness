// ABOUTME: Executes the merged I321 Phase-A owner bytes through the Worker loopback port.
// ABOUTME: Proves one grant yields exactly two owner public byte streams without authority leakage.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

const sourceCommitSha = "a".repeat(40);
const qualificationRunId = "11111111-1111-4111-8111-111111111111";
const accessToken = "qualification-access-token";
const organization = {
  organizationId: "org_acme",
  displayName: "Acme",
  revision: 7,
};

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
  throw new TypeError("fixture_invalid");
}

function authorizedOrganizationRead() {
  const evidence = {
    schema: "cl.dah.authorized-organization-read.v1",
    requestId: "44444444-4444-4444-8444-444444444444",
    organization,
    communityId: "7234a403-cb91-4dab-812c-c6a3dc50a6ef",
  };
  return {
    ...evidence,
    evidenceDigestSha256: createHash("sha256").update(canonicalJson({
      schema: "cl.dah.authorized-organization-read-digest.v1",
      evidence,
    })).digest("hex"),
  };
}

function responseFor(request: Record<string, unknown>): Record<string, unknown> {
  switch (request.operation) {
    case "version_readback":
      return {
        ...request,
        sourceCommitSha,
        versionReadbackSha256: request.component === "auth_hub"
          ? "b".repeat(64)
          : "c".repeat(64),
      };
    case "api_management_family_separation":
      return {
        operation: request.operation,
        outcome: "passed",
        apiFamilyDeniedByManagement: true,
        managementFamilyAccepted: true,
        managementCredentialExposed: false,
      };
    case "organizations_list":
      return {
        operation: request.operation,
        outcome: "passed",
        eligibility: "active_management",
        organizations: [organization],
      };
    case "organizations_read":
      return {
        operation: request.operation,
        outcome: "passed",
        authorizedOrganizationRead: authorizedOrganizationRead(),
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
}

function jsonResponse(body: unknown): Response {
  const text = JSON.stringify(body);
  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(text)),
    },
  });
}

describe("Worker I321 Phase-A qualification", () => {
  test("executes twelve remote operations and one cleanup into two owner byte streams", async () => {
    const calls: Array<{ path: string; request: Record<string, unknown> }> = [];
    let sequence = 0;
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ path: new URL(String(input)).pathname, request });
      if (new URL(String(input)).pathname === "/v1/phase-a/cleanup") {
        return jsonResponse({
          schema: "cl.dah.cli-management-phase-a-cleanup.v1",
          temporarySessionsRemaining: 0,
          temporaryManagementGrantsRemaining: 0,
          unconsumedOboJtisRemaining: 0,
          domainMutationsCreated: 0,
          maintenanceCommandsCreated: 0,
          queueMessagesCreated: 0,
          providerMutationsCreated: 0,
          auditRecordsVerified: 12,
        });
      }
      return jsonResponse(responseFor(request));
    }) as unknown as typeof fetch;

    const module = await import("../cli/core/management/phase-a-qualification");
    const result = await module.executeI321PhaseAQualification({
      plan: {
        schema: "cl.dah.cli-management-phase-a-plan.v1",
        environmentId: "staging-1",
        sourceCommitSha,
        qualificationRunId,
        contractSha256: "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601",
        providerPolicyVersion: `sha256:${"d".repeat(64)}`,
        relayUrl: "wss://kc.communities.buzz.xyz",
        httpsBase: "https://kc.communities.buzz.xyz",
        workflow: {
          repository: "curation-labs/darwinian-services",
          runId: 33181185126,
          runAttempt: 1,
        },
      },
      adapterOrigin: "http://127.0.0.1:8787",
      credential: {
        accessToken,
        issuedAt: "2030-08-27T17:00:00.000Z",
        expiresAt: "2030-08-27T17:15:00.000Z",
      },
      fetcher,
      now: () => Date.parse("2030-08-27T17:05:00.000Z"),
      requestId: () => {
        sequence += 1;
        return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      },
      receiptId: () => "33333333-3333-4333-8333-333333333333",
    });

    expect(calls).toHaveLength(13);
    expect(calls.filter(({ path }) => path === "/v1/phase-a/execute")).toHaveLength(12);
    expect(calls.filter(({ path }) => path === "/v1/phase-a/cleanup")).toHaveLength(1);
    expect(calls.map(({ request }) => request.operation).filter(Boolean)).not.toContain("fresh_login");
    expect(calls.map(({ request }) => request.operation).filter(Boolean)).not.toContain("displayed_consent");
    expect(result.readiness).toMatchObject({
      schema: "cl.dah.cli-management-readiness.v1",
      receiptId: "33333333-3333-4333-8333-333333333333",
    });
    expect("qualificationRunId" in result.readiness).toBe(false);
    expect(result.community).toMatchObject({
      schema: "cl.dah.staging-slot-community.v1",
      qualificationRunId,
      communityId: "7234a403-cb91-4dab-812c-c6a3dc50a6ef",
    });
    const emitted = [
      new TextDecoder().decode(result.readinessBytes),
      new TextDecoder().decode(result.communityBytes),
    ].join("\n");
    expect(emitted).not.toContain(accessToken);
    expect(emitted).not.toContain("organizationId");
    expect(emitted).not.toContain("displayName");
  });
});
