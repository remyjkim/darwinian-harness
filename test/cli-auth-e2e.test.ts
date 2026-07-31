// ABOUTME: Subprocess E2E tests for drwn auth commands against a fake analyzer backend.
// ABOUTME: Exercises the real CLI entrypoint, process env, HTTP boundaries, and credential files.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readCredentials, writeCredentials } from "../cli/core/auth/credentials";
import { drwnCliProfile } from "../cli/core/auth/profile";
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];

interface AuthServerState {
  deviceCodeRequests: unknown[];
  tokenRequests: unknown[];
  authorizeAuthHeaders: string[];
  oauthTokenRequests: string[];
  sessionAuthHeaders: string[];
  revokeRequests: string[];
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(
  email = "cli-e2e@example.com",
  exp = Math.floor(Date.now() / 1000) + 900,
  options: { aud?: string; iss?: string } = {},
): string {
  const profile = drwnCliProfile({});
  return `${b64({ alg: "none" })}.${b64({
    iss: options.iss ?? profile.issuer,
    aud: options.aud ?? profile.resource,
    sub: "user_123",
    email,
    exp,
  })}.sig`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop(true);
  }
  await cleanupTempRoots(tempRoots);
});

function startAuthServer(options: { pendingPolls?: number } = {}) {
  const pendingPolls = options.pendingPolls ?? 0;
  const state: AuthServerState = {
    deviceCodeRequests: [],
    tokenRequests: [],
    authorizeAuthHeaders: [],
    oauthTokenRequests: [],
    sessionAuthHeaders: [],
    revokeRequests: [],
  };

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/api/auth/device/code") {
        state.deviceCodeRequests.push(await request.json());
        return Response.json({
          device_code: "device-code",
          user_code: "ABCD-EFGH",
          verification_uri_complete: new URL("/device?user_code=ABCD-EFGH", request.url).toString(),
          expires_in: 600,
          interval: 1,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/device/token") {
        state.tokenRequests.push(await request.json());
        if (state.tokenRequests.length <= pendingPolls) {
          return Response.json({ error: "authorization_pending" }, { status: 400 });
        }
        return Response.json({
          access_token: "device-session-token",
          token_type: "Bearer",
          expires_in: 604800,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/auth/oauth2/authorize") {
        state.authorizeAuthHeaders.push(request.headers.get("authorization") ?? "");
        return Response.json({ code: "auth-code" });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/oauth2/token") {
        state.oauthTokenRequests.push(await request.text());
        return Response.json({
          access_token: fakeJwt("cli-e2e@example.com", Math.floor(Date.now() / 1000) + 900, {
            iss: new URL("/api/auth", request.url).href,
          }),
          refresh_token: "refresh-token",
          token_type: "Bearer",
          expires_in: 900,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        const auth = request.headers.get("authorization") ?? "";
        state.sessionAuthHeaders.push(auth);
        return new Response("expired", { status: 401 });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/oauth2/revoke") {
        state.revokeRequests.push(await request.text());
        return new Response(null, { status: 204 });
      }

      return new Response("not found", { status: 404 });
    },
  });
  servers.push(server);
  return { apiUrl: `http://127.0.0.1:${server.port}`, state };
}

describe("auth CLI E2E", () => {
  test("login --json, stored whoami, and logout work through the real CLI process", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl, state } = startAuthServer({ pendingPolls: 1 });
    const env = { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl };

    const login = await runAgentsCli(["login", "--json"], env);

    expect(login.exitCode).toBe(0);
    expect(login.stderr).toContain("Log in to your Darwinian account:");
    expect(login.stderr).toContain("1. Press Enter to open it in your browser");
    expect(login.stderr).toContain("2. Or open this URL manually: ");
    expect(login.stderr).toContain("/device?user_code=ABCD-EFGH");
    expect(login.stderr).toContain("Waiting for browser sign-in...");
    expect(login.stderr).not.toContain("Code: ABCD-EFGH");
    expect(JSON.parse(login.stdout)).toMatchObject({ email: "cli-e2e@example.com" });
    expect(state.deviceCodeRequests).toEqual([{ client_id: "drwn-cli", scope: "openid email offline_access" }]);
    expect(state.tokenRequests).toHaveLength(2);
    expect(state.tokenRequests.at(-1)).toMatchObject({
      device_code: "device-code",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "drwn-cli",
    });

    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    const onDisk = await Bun.file(credentialsPath).text();
    expect(onDisk).not.toContain("cli-e2e@example.com");
    expect(JSON.parse(onDisk).algo).toBe("aes-256-gcm");
    const credentials = await readCredentials(credentialsPath);
    expect(credentials).toMatchObject({
      version: 2,
      issuer: `${apiUrl}/api/auth`,
      refreshToken: "refresh-token",
      user_email: "cli-e2e@example.com",
    });
    expect(credentials && "version" in credentials ? credentials.accessToken : "").toContain(".");
    expect(Date.parse(credentials!.saved_at)).not.toBeNaN();

    const whoami = await runAgentsCli(["whoami", "--json"], envFor(fixture));
    expect(whoami.exitCode).toBe(0);
    expect(JSON.parse(whoami.stdout)).toMatchObject({
      email: "cli-e2e@example.com",
      issuer: `${apiUrl}/api/auth`,
      audience: "https://api.darwinian.dev",
      user_id: "user_123",
      expires_at: credentials && "version" in credentials ? credentials.expiresAt : undefined,
      source: "stored",
    });
    expect(state.authorizeAuthHeaders).toEqual(["Bearer device-session-token"]);
    expect(state.sessionAuthHeaders).toEqual([]);

    const logout = await runAgentsCli(["logout"], { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl });
    expect(logout.exitCode).toBe(0);
    expect(logout.stdout).toContain("Logged out. Credentials removed.");
    expect(state.revokeRequests).toEqual(["token=refresh-token&client_id=drwn-cli&token_type_hint=refresh_token"]);
    expect(await Bun.file(credentialsPath).exists()).toBe(false);

    const afterLogout = await runAgentsCli(["whoami"], envFor(fixture));
    expect(afterLogout.exitCode).toBe(1);
    expect(afterLogout.stderr).toContain("Not authenticated. Run `drwn login` first");
  });

  test("whoami env-token path bypasses credentials and validates JWT claims", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl, state } = startAuthServer();
    const baseEnv = envFor(fixture);

    const valid = await runAgentsCli(["whoami", "--json"], {
      ...baseEnv,
      DRWN_TOKEN: fakeJwt("env-e2e@example.com"),
      DRWN_DAH_HUB_URL: apiUrl,
    });

    expect(valid.exitCode).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({
      email: "env-e2e@example.com",
      issuer: "https://auth.darwiniantools.com/api/auth",
      source: "env",
    });
    expect(await Bun.file(resolveCredentialsPath(fixture.agentsDir)).exists()).toBe(false);

    const wrongAudience = await runAgentsCli(["whoami"], {
      ...baseEnv,
      DRWN_TOKEN: fakeJwt("bad@example.com", Math.floor(Date.now() / 1000) + 900, { aud: "https://wrong.example" }),
      DRWN_DAH_HUB_URL: apiUrl,
    });
    expect(wrongAudience.exitCode).toBe(1);
    expect(wrongAudience.stderr).toContain("Token audience does not include https://api.darwinian.dev.");

    const expired = await runAgentsCli(["whoami"], {
      ...baseEnv,
      DRWN_TOKEN: fakeJwt("expired@example.com", Math.floor(Date.now() / 1000) - 60),
      DRWN_DAH_HUB_URL: apiUrl,
    });
    expect(expired.exitCode).toBe(1);
    expect(expired.stderr).toContain("Token is expired.");
    expect(state.sessionAuthHeaders).toEqual([]);
  });

  test("login failure leaves credentials unwritten", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ error: "broken" }, { status: 500 });
      },
    });
    servers.push(server);

    const result = await runAgentsCli(["login"], {
      ...envFor(fixture),
      DRWN_DAH_HUB_URL: `http://127.0.0.1:${server.port}`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("DAH device authorization response missing device_code/user_code.");
    expect(await Bun.file(resolveCredentialsPath(fixture.agentsDir)).exists()).toBe(false);
  });

  test("logout removes stored credentials after revoking the refresh token", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl } = startAuthServer();
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const profile = drwnCliProfile({ DRWN_DAH_HUB_URL: apiUrl });
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: profile.issuer,
      clientId: "drwn-cli",
      resource: profile.resource,
      accessToken: fakeJwt(),
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "cli-e2e@example.com",
      saved_at: "2026-06-03T00:00:00Z",
    });

    const result = await runAgentsCli(["logout"], { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Logged out. Credentials removed.");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
  });
});
