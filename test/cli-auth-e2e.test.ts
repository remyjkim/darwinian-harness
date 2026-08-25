// ABOUTME: Auth E2E tests against a real fake-DAH HTTP server and explicit credential custody.
// ABOUTME: Keeps storage journeys in-process while preserving storage-free env-token subprocess coverage.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { LoginCommand } from "../cli/commands/auth/login";
import { LogoutCommand } from "../cli/commands/auth/logout";
import { RefreshCommand } from "../cli/commands/auth/refresh";
import { WhoamiCommand } from "../cli/commands/auth/whoami";
import type { AgentsContext } from "../cli/context";
import { readCredentials, writeCredentials } from "../cli/core/auth/credentials";
import { drwnCliProfile } from "../cli/core/auth/profile";
import { parseAuthOperationReceipt } from "../cli/core/auth/receipt";
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { InMemoryKeychainBackend } from "./helpers/keychain-backend";

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

class CaptureStream extends Writable {
  private readonly chunks: Buffer[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
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
  const iat = exp - 900;
  return `${b64({ alg: "none" })}.${b64({
    iss: options.iss ?? profile.issuer,
    aud: options.aud ?? profile.resource,
    sub: "user_123",
    email,
    iat,
    exp,
  })}.sig`;
}

afterEach(async () => {
  LoginCommand.testDeps = undefined;
  LogoutCommand.testDeps = undefined;
  RefreshCommand.testDeps = undefined;
  WhoamiCommand.testDeps = undefined;
  for (const server of servers.splice(0)) {
    server.stop(true);
  }
  await cleanupTempRoots(tempRoots);
});

async function runStoredAuthCommand(
  args: string[],
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  env: Record<string, string | undefined>,
  keychainBackend: InMemoryKeychainBackend,
) {
  LoginCommand.testDeps = {
    env,
    fetch,
    sleep: async () => {},
    openBrowser: () => {},
    keychainBackend,
  };
  LogoutCommand.testDeps = { env, fetch, keychainBackend };
  RefreshCommand.testDeps = { env, fetch, keychainBackend };
  WhoamiCommand.testDeps = { env, fetch, keychainBackend };

  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = false;
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    projectConfigPath: null,
    stdin,
    stdout,
    stderr,
    env,
    colorDepth: 1,
  };
  const cli = new Cli({
    binaryName: "drwn",
    binaryLabel: "drwn",
    binaryVersion: "0.0.0",
    enableColors: false,
  });
  cli.register(LoginCommand);
  cli.register(LogoutCommand);
  cli.register(RefreshCommand);
  cli.register(WhoamiCommand);
  const exitCode = await cli.run(args, context);
  return { exitCode, stdout: stdout.text(), stderr: stderr.text() };
}

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
          verification_uri: new URL("/device", request.url).toString(),
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
  test("login --json, stored whoami, refresh, and logout use one explicitly injected backend", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl, state } = startAuthServer({ pendingPolls: 1 });
    const env = { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl };
    const keychainBackend = new InMemoryKeychainBackend();

    const login = await runStoredAuthCommand(["login", "--json"], fixture, env, keychainBackend);

    expect(login.exitCode).toBe(0);
    expect(login.stderr).toContain("Log in to your Darwinian account:");
    expect(login.stderr).toContain("1. Press Enter to open it in your browser");
    expect(login.stderr).toContain("2. Or open this URL manually: ");
    expect(login.stderr).toContain("/device?user_code=ABCD-EFGH");
    expect(login.stderr).toContain("Waiting for browser sign-in...");
    expect(login.stderr).not.toContain("Code: ABCD-EFGH");
    const loginReceipt = parseAuthOperationReceipt(JSON.parse(login.stdout));
    expect(loginReceipt).toMatchObject({
      worker: { sourceCommit: "0".repeat(40) },
      credential: { generation: 1, issuer: `${apiUrl}/api/auth` },
      action: "login",
      mode: "ordinary",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "token_exchange", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
      reason: "BUILD_IDENTITY_UNQUALIFIED",
    });
    expect(login.stdout).not.toContain("cli-e2e@example.com");
    expect(login.stdout.trim().split("\n")).toHaveLength(1);
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
    const credentials = await readCredentials(credentialsPath, keychainBackend);
    expect(credentials).toMatchObject({
      version: 3,
      generation: 1,
      issuer: `${apiUrl}/api/auth`,
      refreshToken: "refresh-token",
      userEmail: "cli-e2e@example.com",
    });
    expect(credentials && "version" in credentials ? credentials.accessToken : "").toContain(".");
    expect(Date.parse(credentials!.savedAt)).not.toBeNaN();

    const whoami = await runStoredAuthCommand(["whoami", "--json"], fixture, env, keychainBackend);
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

    const refresh = await runStoredAuthCommand(["refresh", "--json"], fixture, env, keychainBackend);
    expect(refresh.exitCode).toBe(0);
    const refreshReceipt = parseAuthOperationReceipt(JSON.parse(refresh.stdout));
    expect(refreshReceipt).toMatchObject({
      worker: { sourceCommit: "0".repeat(40) },
      credential: { generation: 2, issuer: `${apiUrl}/api/auth` },
      action: "refresh",
      mode: "ordinary",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
      reason: "BUILD_IDENTITY_UNQUALIFIED",
    });
    expect(refresh.stdout).not.toContain("cli-e2e@example.com");
    expect(state.oauthTokenRequests).toHaveLength(2);
    expect(state.oauthTokenRequests[1]).toContain("grant_type=refresh_token");

    const logout = await runStoredAuthCommand(
      ["logout"],
      fixture,
      { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl },
      keychainBackend,
    );
    expect(logout.exitCode).toBe(0);
    expect(logout.stdout).toContain("Logged out. Credentials removed.");
    expect(state.revokeRequests).toEqual(["token=refresh-token&client_id=drwn-cli&token_type_hint=refresh_token"]);
    expect(await Bun.file(credentialsPath).exists()).toBe(false);

    const afterLogout = await runStoredAuthCommand(["whoami"], fixture, envFor(fixture), keychainBackend);
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
      DRWN_TOKEN: fakeJwt("env-e2e@example.com", Math.floor(Date.now() / 1000) + 900, {
        iss: `${apiUrl}/api/auth`,
      }),
      DRWN_DAH_HUB_URL: apiUrl,
    });

    expect(valid.exitCode).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({
      email: "env-e2e@example.com",
      issuer: `${apiUrl}/api/auth`,
      source: "env",
    });
    expect(await Bun.file(resolveCredentialsPath(fixture.agentsDir)).exists()).toBe(false);

    const wrongAudience = await runAgentsCli(["whoami"], {
      ...baseEnv,
      DRWN_TOKEN: fakeJwt("bad@example.com", Math.floor(Date.now() / 1000) + 900, {
        aud: "https://wrong.example",
        iss: `${apiUrl}/api/auth`,
      }),
      DRWN_DAH_HUB_URL: apiUrl,
    });
    expect(wrongAudience.exitCode).toBe(1);
    expect(wrongAudience.stderr).toContain("Token audience does not include https://api.darwinian.dev.");

    const expired = await runAgentsCli(["whoami"], {
      ...baseEnv,
      DRWN_TOKEN: fakeJwt("expired@example.com", Math.floor(Date.now() / 1000) - 60, {
        iss: `${apiUrl}/api/auth`,
      }),
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
    expect(result.stderr).toContain("DAH device request failed (500).");
    expect(await Bun.file(resolveCredentialsPath(fixture.agentsDir)).exists()).toBe(false);
  });

  test("logout removes stored credentials after revoking the refresh token", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl } = startAuthServer();
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const keychainBackend = new InMemoryKeychainBackend();
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const profile = drwnCliProfile({ DRWN_DAH_HUB_URL: apiUrl });
    const accessToken = fakeJwt("cli-e2e@example.com", undefined, {
      iss: profile.issuer,
      aud: profile.resource,
    });
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8")) as {
      iat: number;
      exp: number;
    };
    await writeCredentials(credentialsPath, {
      version: 3,
      credentialId: "88888888-8888-4888-8888-888888888888",
      generation: 1,
      issuer: profile.issuer,
      clientId: "drwn-cli",
      resource: profile.resource,
      accessToken,
      refreshToken: "refresh-token",
      issuedAt: new Date(claims.iat * 1000).toISOString(),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      savedAt: "2026-08-08T00:00:00.000Z",
      userEmail: "cli-e2e@example.com",
    }, keychainBackend);

    const result = await runStoredAuthCommand(
      ["logout"],
      fixture,
      { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl },
      keychainBackend,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Logged out. Credentials removed.");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
  });

  test("strict logout emits ordered non-qualifying source receipt after confirmed revoke and deletion", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl, state } = startAuthServer();
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const keychainBackend = new InMemoryKeychainBackend();
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    const profile = drwnCliProfile({ DRWN_DAH_HUB_URL: apiUrl });
    const accessToken = fakeJwt("cli-e2e@example.com", undefined, {
      iss: profile.issuer,
      aud: profile.resource,
    });
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8")) as {
      iat: number;
      exp: number;
    };
    await writeCredentials(credentialsPath, {
      version: 3,
      credentialId: "99999999-9999-4999-8999-999999999999",
      generation: 2,
      issuer: profile.issuer,
      clientId: "drwn-cli",
      resource: profile.resource,
      accessToken,
      refreshToken: "strict-refresh-token",
      issuedAt: new Date(claims.iat * 1000).toISOString(),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      savedAt: "2026-08-08T00:00:00.000Z",
      userEmail: "cli-e2e@example.com",
    }, keychainBackend);

    const result = await runStoredAuthCommand(
      ["logout", "--json", "--require-remote-revoke"],
      fixture,
      { ...envFor(fixture), DRWN_DAH_HUB_URL: apiUrl },
      keychainBackend,
    );
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(receipt).toMatchObject({
      worker: { sourceCommit: "0".repeat(40) },
      credential: { credentialId: "99999999-9999-4999-8999-999999999999", generation: 2 },
      action: "logout",
      mode: "require_remote_revoke",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "revoke", result: "confirmed", httpClass: "2xx" },
      local: { action: "delete", result: "confirmed", afterConfirmedRemoteRevoke: true },
      reason: "BUILD_IDENTITY_UNQUALIFIED",
    });
    expect(result.stdout).not.toContain("strict-refresh-token");
    expect(result.stdout).not.toContain("cli-e2e@example.com");
    expect(state.revokeRequests).toContain("token=strict-refresh-token&client_id=drwn-cli&token_type_hint=refresh_token");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
  });
});
