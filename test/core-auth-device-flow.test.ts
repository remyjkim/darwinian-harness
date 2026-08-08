// ABOUTME: Verifies the native DAH device flow and v3 credential creation.
// ABOUTME: Proves the retired Analyzer-client overload is absent and timing/identity are injected.

import { describe, expect, test } from "bun:test";
import { AuthRemoteOperationError, refreshToken, runDeviceFlow } from "../cli/core/auth/device-flow";
import { drwnCliProfile } from "../cli/core/auth/profile";

const IAT = 1_786_080_000;
const EXP = IAT + 900;
const UUID = "22222222-2222-4222-8222-222222222222";

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(issuer: string, overrides: Record<string, unknown> = {}): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: issuer,
    aud: "https://api.darwinian.dev",
    sub: "user_123",
    email: "device@example.test",
    iat: IAT,
    exp: EXP,
    ...overrides,
  })}.sig`;
}

function nativeFetcher(options: { pending?: number; terminalError?: string } = {}): {
  fetcher: typeof fetch;
  requests: Array<{ url: string; method: string; body: string }>;
} {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  let polls = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const parsed = new URL(url);
    requests.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? "") });
    if (parsed.pathname === "/api/auth/device/code") {
      return Response.json({
        device_code: "device-code",
        user_code: "ABCD",
        verification_uri: "https://app.test/device",
        verification_uri_complete: "https://app.test/device?user_code=ABCD",
        expires_in: 600,
        interval: 1,
      });
    }
    if (parsed.pathname === "/api/auth/device/token") {
      polls += 1;
      if (options.terminalError) return Response.json({ error: options.terminalError }, { status: 400 });
      if (polls <= (options.pending ?? 0)) {
        return Response.json({ error: "authorization_pending" }, { status: 400 });
      }
      return Response.json({ access_token: "opaque-device-session" });
    }
    if (parsed.pathname === "/api/auth/oauth2/authorize") {
      return Response.json({ code: "authorization-code" });
    }
    if (parsed.pathname === "/api/auth/oauth2/token") {
      return Response.json({
        access_token: fakeJwt("https://auth.darwinian.dev/api/auth"),
        refresh_token: "refresh-token",
        expires_in: 900,
      });
    }
    throw new Error(`unexpected URL ${url}`);
  }) as unknown as typeof fetch;
  return { fetcher, requests };
}

describe("runDeviceFlow", () => {
  test("runs only the native DAH flow and creates an exact generation-1 v3 credential", async () => {
    const profile = drwnCliProfile({});
    const actions: Array<{ verification_uri_complete: string; user_code: string }> = [];
    const slept: number[] = [];
    const { fetcher, requests } = nativeFetcher({ pending: 1 });

    const credential = await runDeviceFlow({
      profile,
      fetcher,
      sleep: async (ms) => { slept.push(ms); },
      now: () => (IAT + 1) * 1000,
      randomUUID: () => UUID,
      onUserAction: (info) => { actions.push(info); },
    });

    expect(credential).toEqual({
      version: 3,
      credentialId: UUID,
      generation: 1,
      issuer: profile.issuer,
      clientId: "drwn-cli",
      resource: profile.resource,
      accessToken: fakeJwt(profile.issuer),
      refreshToken: "refresh-token",
      issuedAt: new Date(IAT * 1000).toISOString(),
      expiresAt: new Date(EXP * 1000).toISOString(),
      savedAt: new Date((IAT + 1) * 1000).toISOString(),
      userEmail: "device@example.test",
    });
    expect(actions).toEqual([{
      verification_uri_complete: "https://app.test/device?user_code=ABCD",
      user_code: "ABCD",
    }]);
    expect(slept).toEqual([1000, 1000]);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/auth/device/code",
      "/api/auth/device/token",
      "/api/auth/device/token",
      "/api/auth/oauth2/authorize",
      "/api/auth/oauth2/token",
    ]);
  });

  test("fails when the final JWT omits a signed iat or coherent expiry", async () => {
    const profile = drwnCliProfile({});
    for (const claims of [{ iat: undefined }, { exp: undefined }, { exp: IAT }]) {
      const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/device/code") {
          return Response.json({
            device_code: "device-code",
            user_code: "ABCD",
            verification_uri: "https://app.test/device",
            expires_in: 600,
            interval: 1,
          });
        }
        if (path === "/api/auth/device/token") return Response.json({ access_token: "opaque" });
        if (path === "/api/auth/oauth2/authorize") return Response.json({ code: "code" });
        if (path === "/api/auth/oauth2/token") {
          return Response.json({
            access_token: fakeJwt(profile.issuer, claims),
            refresh_token: "refresh",
            expires_in: 900,
          });
        }
        throw new Error(`unexpected ${String(input)} ${String(init?.method)}`);
      }) as unknown as typeof fetch;

      await expect(runDeviceFlow({
        profile,
        fetcher,
        sleep: async () => {},
        now: () => (IAT + 1) * 1000,
        randomUUID: () => UUID,
        onUserAction: () => {},
      })).rejects.toThrow("DAH access token is missing coherent iat/exp claims.");
    }
  });

  test("preserves native device authorization terminal errors", async () => {
    const profile = drwnCliProfile({});
    const { fetcher } = nativeFetcher({ terminalError: "access_denied" });
    await expect(runDeviceFlow({
      profile,
      fetcher,
      sleep: async () => {},
      now: () => (IAT + 1) * 1000,
      randomUUID: () => UUID,
      onUserAction: () => {},
    })).rejects.toThrow("device_authorization_denied");
  });

  test("has no retired Analyzer-client overload", () => {
    if (false) {
      void runDeviceFlow({
        // @ts-expect-error The legacy Analyzer client input is intentionally unsupported.
        client: {},
        clientId: "drwn-cli",
        onUserAction: () => {},
      });
    }
    expect(true).toBe(true);
  });
});

describe("refreshToken remote classification", () => {
  test("returns a validated token bundle only from a successful response", async () => {
    const profile = drwnCliProfile({});
    const accessToken = fakeJwt(profile.issuer);

    const result = await refreshToken(
      profile,
      "refresh-token",
      (async () => Response.json({
        access_token: accessToken,
        refresh_token: "refresh-token-2",
        expires_in: 900,
      })) as unknown as typeof fetch,
    );

    expect(result).toMatchObject({ access_token: accessToken, refresh_token: "refresh-token-2" });
  });

  test("classifies redirect, rejection, server, network, and invalid success without retaining bodies", async () => {
    const profile = drwnCliProfile({});
    const sentinel = "SENTINEL_REFRESH_RESPONSE_BODY_239";
    const scenarios: Array<{
      name: string;
      fetcher: typeof fetch;
      reason: string;
      result: string;
      httpClass: string;
    }> = [
      {
        name: "redirect",
        fetcher: (async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } })) as unknown as typeof fetch,
        reason: "AUTH_REMOTE_INDETERMINATE",
        result: "indeterminate",
        httpClass: "3xx",
      },
      {
        name: "rejection",
        fetcher: (async () => new Response(sentinel, { status: 400 })) as unknown as typeof fetch,
        reason: "AUTH_REMOTE_REJECTED",
        result: "rejected",
        httpClass: "4xx",
      },
      {
        name: "server",
        fetcher: (async () => new Response(sentinel, { status: 503 })) as unknown as typeof fetch,
        reason: "AUTH_REMOTE_INDETERMINATE",
        result: "indeterminate",
        httpClass: "5xx",
      },
      {
        name: "network",
        fetcher: (async () => { throw new TypeError(sentinel); }) as unknown as typeof fetch,
        reason: "AUTH_REMOTE_INDETERMINATE",
        result: "indeterminate",
        httpClass: "network_error",
      },
      {
        name: "malformed success",
        fetcher: (async () => new Response(sentinel, { status: 200 })) as unknown as typeof fetch,
        reason: "AUTH_RESPONSE_INVALID",
        result: "rejected",
        httpClass: "2xx",
      },
      {
        name: "wrong issuer",
        fetcher: (async () => Response.json({
          access_token: fakeJwt("https://wrong-issuer.test/api/auth"),
          refresh_token: "refresh-token-2",
          expires_in: 900,
          response_body: sentinel,
        })) as unknown as typeof fetch,
        reason: "AUTH_RESPONSE_INVALID",
        result: "rejected",
        httpClass: "2xx",
      },
    ];

    for (const scenario of scenarios) {
      try {
        await refreshToken(profile, "refresh-token", scenario.fetcher);
        throw new Error(`${scenario.name} unexpectedly succeeded`);
      } catch (error) {
        expect(error, scenario.name).toBeInstanceOf(AuthRemoteOperationError);
        expect(error).toMatchObject({
          reason: scenario.reason,
          result: scenario.result,
          httpClass: scenario.httpClass,
        });
        expect(String(error)).not.toContain(sentinel);
        expect(JSON.stringify(error)).not.toContain(sentinel);
      }
    }
  });

  test("rejects a missing refresh token before any request", async () => {
    const profile = drwnCliProfile({});
    let requests = 0;

    await expect(refreshToken(
      profile,
      "",
      (async () => {
        requests += 1;
        return Response.json({});
      }) as unknown as typeof fetch,
    )).rejects.toMatchObject({ reason: "AUTH_RESPONSE_INVALID", result: "rejected", httpClass: "2xx" });
    expect(requests).toBe(0);
  });
});
