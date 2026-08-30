// ABOUTME: Proves the Worker composite Phase-A port keeps ceremony local and uses the exact loopback wire.
// ABOUTME: Covers one remote execute and bearer-authenticated normal cleanup before command integration.

import { describe, expect, test } from "bun:test";

const qualificationRunId = "11111111-1111-4111-8111-111111111111";
const accessToken = "secret-access-token";
const issuedAt = "2030-08-27T17:00:00.000Z";
const expiresAt = "2030-08-27T17:15:00.000Z";

type CompositePort = {
  execute(request: Record<string, unknown>): Promise<unknown>;
  cleanup(): Promise<unknown>;
};

async function createPort(overrides: Record<string, unknown> = {}): Promise<CompositePort> {
  const module = await import("../cli/core/management/phase-a-port-client");
  return await module.createI321PhaseACompositePort({
    adapterOrigin: "http://127.0.0.1:8787",
    accessToken,
    issuedAt,
    expiresAt,
    qualificationRunId,
    requestId: () => "22222222-2222-4222-8222-222222222222",
    ...overrides,
  });
}

function jsonResponse(body: unknown): Response {
  const bytes = JSON.stringify(body);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bytes)),
    },
  });
}

describe("I321 Phase-A composite port", () => {
  test("satisfies fresh login and displayed consent without loopback traffic", async () => {
    let fetchCalls = 0;
    const port = await createPort({
      fetcher: async () => {
        fetchCalls += 1;
        throw new Error("must stay process-local");
      },
    });

    await expect(port.execute({ operation: "fresh_login" })).resolves.toEqual({
      operation: "fresh_login",
      outcome: "passed",
      issuedAt,
      expiresAt,
      storedCredentialUsed: false,
    });
    await expect(port.execute({ operation: "displayed_consent" })).resolves.toEqual({
      operation: "displayed_consent",
      outcome: "passed",
      consentDisplayed: true,
      consentApproved: true,
    });
    expect(fetchCalls).toBe(0);
  });

  test("sends one exact bearer-authenticated remote execute request", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const port = await createPort({
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          init: { ...(init ?? {}), headers: new Headers(init?.headers) },
        });
        return jsonResponse({
          operation: "version_readback",
          component: "auth_hub",
          sourceCommitSha: "a".repeat(40),
          versionReadbackSha256: "b".repeat(64),
        });
      }) as typeof fetch,
    });

    await expect(port.execute({
      operation: "version_readback",
      component: "auth_hub",
    })).resolves.toMatchObject({
      operation: "version_readback",
      component: "auth_hub",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:8787/v1/phase-a/execute");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.redirect).toBe("manual");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${accessToken}`);
    expect(headers.get("x-drwn-protocol")).toBe("deployed-worker.v1");
    expect(headers.get("x-drwn-version")).toBe("1.4.2");
    expect(headers.get("x-i321-qualification-run-id")).toBe(qualificationRunId);
    expect(headers.get("x-request-id")).toBe("22222222-2222-4222-8222-222222222222");
    expect(calls[0]?.init.body).toBe(JSON.stringify({
      operation: "version_readback",
      component: "auth_hub",
    }));
    expect(String(calls[0]?.init.body)).not.toContain(accessToken);
  });

  test("sends normal cleanup with the same Human bearer", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const cleanup = {
      schema: "cl.dah.cli-management-phase-a-cleanup.v1",
      temporarySessionsRemaining: 0,
      temporaryManagementGrantsRemaining: 0,
      unconsumedOboJtisRemaining: 0,
      domainMutationsCreated: 0,
      maintenanceCommandsCreated: 0,
      queueMessagesCreated: 0,
      providerMutationsCreated: 0,
      auditRecordsVerified: 1,
    };
    const port = await createPort({
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          init: { ...(init ?? {}), headers: new Headers(init?.headers) },
        });
        return jsonResponse(cleanup);
      }) as typeof fetch,
    });

    await expect(port.cleanup()).resolves.toEqual(cleanup);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:8787/v1/phase-a/cleanup");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      `Bearer ${accessToken}`,
    );
    expect(calls[0]?.init.body).toBe(JSON.stringify({
      schema: "cl.dah.cli-management-phase-a-port-cleanup-request.v1",
      cleanupMode: "normal",
    }));
  });

  test("refuses a valid observation that does not match the request", async () => {
    const port = await createPort({
      fetcher: (async () => jsonResponse({
        operation: "expired_denial",
        outcome: "denied",
      })) as unknown as typeof fetch,
    });

    await expect(port.execute({
      operation: "version_readback",
      component: "auth_hub",
    })).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
      message: "Staging Community qualification refused.",
    });
  });

  test("collapses remote failures without reflecting bearer or transport details", async () => {
    const port = await createPort({
      fetcher: (async () => {
        throw new Error("BEARER_TRANSPORT_SENTINEL");
      }) as unknown as typeof fetch,
    });

    let refusal: unknown;
    try {
      await port.execute({ operation: "expired_denial" });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
      message: "Staging Community qualification refused.",
    });
    expect(String(refusal)).not.toContain("BEARER_TRANSPORT_SENTINEL");
    expect(String(refusal)).not.toContain(accessToken);
  });

  test("refuses a bearer that makes the complete request header block exceed 16 KiB", async () => {
    await expect(createPort({
      accessToken: "a".repeat(16_384 - Buffer.byteLength("Bearer ")),
    })).rejects.toMatchObject({
      code: "STAGING_COMMUNITY_QUALIFICATION_INVALID",
      message: "Staging Community qualification refused.",
    });
  });
});
