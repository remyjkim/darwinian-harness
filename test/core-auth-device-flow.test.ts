// ABOUTME: Verifies the native DAH device flow and v3 credential creation.
// ABOUTME: Proves the retired Analyzer-client overload is absent and timing/identity are injected.

import { describe, expect, test } from "bun:test";
import { runDeviceFlow } from "../cli/core/auth/device-flow";
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
