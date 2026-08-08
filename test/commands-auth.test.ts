// ABOUTME: Command-level tests for drwn login/logout/whoami.
// ABOUTME: Exercises Clipanion command wiring with injected network and browser dependencies.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { PassThrough, Writable } from "node:stream";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LoginCommand } from "../cli/commands/auth/login";
import { LogoutCommand } from "../cli/commands/auth/logout";
import { WhoamiCommand } from "../cli/commands/auth/whoami";
import type { AgentsContext } from "../cli/context";
import { readCredentials, writeCredentials } from "../cli/core/auth/credentials";
import { deriveCredentialScope } from "../cli/core/auth/credential-scope";
import { parseAuthOperationReceipt } from "../cli/core/auth/receipt";
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(
  email = "x@y.z",
  exp = Math.floor(Date.now() / 1000) + 900,
  options: { issuer?: string; resource?: string } = {},
): string {
  const iat = exp - 900;
  return `${b64({ alg: "none" })}.${b64({
    iss: options.issuer ?? "https://auth.darwinian.dev/api/auth",
    aud: options.resource ?? "https://api.darwinian.dev",
    sub: "user_123",
    email,
    iat,
    exp,
  })}.sig`;
}

function storedCredential(options: { issuer?: string; resource?: string } = {}) {
  const issuer = options.issuer ?? "https://auth.darwinian.dev/api/auth";
  const resource = options.resource ?? "https://api.darwinian.dev";
  const accessToken = fakeJwt("x@y.z", undefined, { issuer, resource });
  const claims = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8")) as {
    iat: number;
    exp: number;
  };
  return {
    version: 3 as const,
    credentialId: "77777777-7777-4777-8777-777777777777",
    generation: 1,
    issuer,
    clientId: "drwn-cli" as const,
    resource,
    accessToken,
    refreshToken: "refresh-1",
    issuedAt: new Date(claims.iat * 1000).toISOString(),
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    savedAt: "2026-08-08T00:00:00.000Z",
    userEmail: "x@y.z",
  };
}

class CaptureStream extends Writable {
  chunks: Buffer[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

afterEach(async () => {
  LoginCommand.testDeps = undefined;
  LogoutCommand.testDeps = undefined;
  WhoamiCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

async function runAuthCommand(
  args: string[],
  options?: {
    fixture?: Awaited<ReturnType<typeof scaffoldCliFixture>>;
    config?: Record<string, unknown>;
    cwd?: string;
  },
) {
  const fixture = options?.fixture ?? await scaffoldCliFixture();
  if (!options?.fixture) tempRoots.push(fixture.root);
  if (options?.config) {
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(options.config, null, 2));
  }

  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = false;
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: options?.cwd ?? fixture.repoRoot,
    projectConfigPath: null,
    stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(LoginCommand);
  cli.register(LogoutCommand);
  cli.register(WhoamiCommand);
  const exitCode = await cli.run(args, context);
  return { fixture, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

function deviceFlowFetch(): typeof fetch {
  return (async (url: string) => {
    const u = new URL(url);
    if (u.pathname === "/api/auth/device/code") {
      return Response.json({
        device_code: "dev",
        user_code: "ABCD",
        verification_uri: "https://app.test/device",
        verification_uri_complete: "https://app.test/device?user_code=ABCD",
        expires_in: 600,
        interval: 1,
      });
    }
    if (u.pathname === "/api/auth/device/token") {
      return Response.json({
        access_token: "opaque-device-session",
        token_type: "Bearer",
        expires_in: 604800,
      });
    }
    if (u.pathname === "/api/auth/oauth2/authorize") {
      return Response.json({ code: "auth-code" });
    }
    if (u.pathname === "/api/auth/oauth2/token") {
      return Response.json({
        access_token: fakeJwt(),
        refresh_token: "refresh-1",
        token_type: "Bearer",
        expires_in: 900,
      });
    }
    throw new Error(`unexpected URL ${url}`);
  }) as unknown as typeof fetch;
}

describe("auth commands", () => {
  test("login does not require Analyzer transport configuration", async () => {
    LoginCommand.testDeps = {
      env: {},
      fetch: deviceFlowFetch(),
      sleep: async () => {},
      openBrowser: () => {},
    };

    const result = await runAuthCommand(["login"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Signed in as x@y.z");
  });

  test("login completes device flow, opens browser, and writes 0600 credentials", async () => {
    const opened: string[] = [];
    LoginCommand.testDeps = {
      env: {},
      fetch: deviceFlowFetch(),
      sleep: async () => {},
      openBrowser: (url) => { opened.push(url); },
    };

    const result = await runAuthCommand(["login"]);
    const credentialsPath = resolveCredentialsPath(result.fixture.agentsDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Log in to your Darwinian account:");
    expect(result.stdout).toContain("1. Press Enter to open it in your browser");
    expect(result.stdout).toContain("2. Or open this URL manually: https://app.test/device?user_code=ABCD");
    expect(result.stdout).toContain("Waiting for browser sign-in...");
    expect(result.stdout).not.toContain("Code: ABCD");
    expect(result.stdout).toContain("Signed in as x@y.z");
    expect(opened).toEqual(["https://app.test/device?user_code=ABCD"]);
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    const onDisk = await Bun.file(credentialsPath).text();
    expect(onDisk).not.toContain("opaque-device-session");
    expect(JSON.parse(onDisk).algo).toBe("aes-256-gcm");
    expect(await readCredentials(credentialsPath)).toMatchObject({
      version: 3,
      generation: 1,
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      userEmail: "x@y.z",
    });
  });

  test("login --json writes first and emits one sanitized non-qualifying development receipt", async () => {
    const events: string[] = [];
    const actionNow = Date.now();
    LoginCommand.testDeps = {
      env: {},
      fetch: deviceFlowFetch(),
      sleep: async () => {},
      now: () => actionNow,
      randomUUID: () => "88888888-8888-4888-8888-888888888888",
      openBrowser: () => {},
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
      writeCredentials: async (path, credential) => {
        events.push("write");
        await writeCredentials(path, credential);
      },
    };

    const result = await runAuthCommand(["login", "--json"]);
    events.push("returned");
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));
    const expectedScope = await deriveCredentialScope(resolveCredentialsPath(result.fixture.agentsDir));

    expect(result.exitCode).toBe(0);
    expect(events).toEqual(["write", "returned"]);
    expect(result.stderr).toContain("Log in to your Darwinian account:");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(result.stdout).not.toContain("x@y.z");
    expect(result.stdout).not.toContain("https://app.test/device");
    expect(receipt).toMatchObject({
      worker: { version: "1.2.0", sourceCommit: "0".repeat(40) },
      qualificationNamespaceDigest: expectedScope.qualificationNamespaceDigest,
      credential: {
        credentialId: "88888888-8888-4888-8888-888888888888",
        generation: 1,
        clientId: "drwn-cli",
      },
      action: "login",
      mode: "ordinary",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "token_exchange", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
      reason: "BUILD_IDENTITY_UNQUALIFIED",
    });
  });

  test("login --json emits an accurate failure receipt after a safely identified write failure", async () => {
    const sentinel = "SENTINEL_CREDENTIAL_WRITE_FAILURE_239";
    LoginCommand.testDeps = {
      env: {},
      fetch: deviceFlowFetch(),
      sleep: async () => {},
      randomUUID: () => "99999999-9999-4999-8999-999999999999",
      openBrowser: () => {},
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
      writeCredentials: async () => { throw new Error(sentinel); },
    };

    const result = await runAuthCommand(["login", "--json"]);
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(receipt).toMatchObject({
      credential: { credentialId: "99999999-9999-4999-8999-999999999999", generation: 1 },
      action: "login",
      outcome: "failed",
      qualificationEligible: false,
      local: { action: "write", result: "failed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_WRITE_FAILED",
    });
    expect(result.stderr).toContain("CREDENTIAL_WRITE_FAILED");
    expect(result.stderr).not.toContain(sentinel);
    expect(await Bun.file(resolveCredentialsPath(result.fixture.agentsDir)).exists()).toBe(false);
  });

  test("login --json emits no receipt when device flow fails before credential identity exists", async () => {
    const sentinel = "SENTINEL_DEVICE_NETWORK_FAILURE_239";
    LoginCommand.testDeps = {
      env: {},
      fetch: (async () => { throw new TypeError(sentinel); }) as unknown as typeof fetch,
      sleep: async () => {},
      openBrowser: () => {},
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
    };

    const result = await runAuthCommand(["login", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("AUTH_REMOTE_INDETERMINATE\n");
    expect(result.stderr).not.toContain(sentinel);
  });

  test("login --json never reports a success-shaped 4xx token response as confirmed 2xx", async () => {
    const successfulFetch = deviceFlowFetch();
    LoginCommand.testDeps = {
      env: {},
      fetch: (async (url: string, init?: RequestInit) => {
        const response = await successfulFetch(url, init);
        if (new URL(url).pathname !== "/api/auth/oauth2/token") return response;
        return new Response(await response.text(), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
      sleep: async () => {},
      openBrowser: () => {},
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
    };

    const result = await runAuthCommand(["login", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toEndWith("AUTH_REMOTE_REJECTED\n");
    expect(await Bun.file(resolveCredentialsPath(result.fixture.agentsDir)).exists()).toBe(false);
  });

  test("login --json does not echo malformed remote response bodies", async () => {
    const sentinel = "SENTINEL_MALFORMED_RESPONSE_BODY_239";
    const successfulFetch = deviceFlowFetch();
    LoginCommand.testDeps = {
      env: {},
      fetch: (async (url: string, init?: RequestInit) => {
        if (new URL(url).pathname === "/api/auth/oauth2/token") {
          return new Response(sentinel, { status: 200, headers: { "content-type": "application/json" } });
        }
        return successfulFetch(url, init);
      }) as typeof fetch,
      sleep: async () => {},
      openBrowser: () => {},
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.2.0",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
    };

    const result = await runAuthCommand(["login", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toEndWith("AUTH_RESPONSE_INVALID\n");
    expect(result.stderr).not.toContain(sentinel);
  });

  test("logout removes credentials and best-effort signs out", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const called: string[] = [];
    LogoutCommand.testDeps = {
      fetch: (async (url: string) => {
        called.push(url);
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
    };
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await writeCredentials(credentialsPath, storedCredential());

    const result = await runAuthCommand(["logout"], { fixture });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Logged out. Credentials removed.");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
    expect(called).toEqual(["https://auth.darwinian.dev/api/auth/oauth2/revoke"]);
  });

  test("logout deletes credentials and exits 0 when the revoke returns 400", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    LogoutCommand.testDeps = {
      fetch: (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch,
    };
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await writeCredentials(credentialsPath, storedCredential({
      issuer: "https://auth.darwiniantools.com/api/auth",
    }));

    const result = await runAuthCommand(["logout"], { fixture });

    // I49 TC-A6: a failed remote revoke must not strand local credentials.
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
    expect(result.stderr).toContain("revoke failed");
    expect(result.stdout).toContain("Logged out. Credentials removed.");
  });

  test("logout deletes credentials and exits 0 when the revoke throws", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    LogoutCommand.testDeps = {
      fetch: (async () => {
        throw new TypeError("fetch failed: getaddrinfo ENOTFOUND auth.darwiniantools.com");
      }) as unknown as typeof fetch,
    };
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await writeCredentials(credentialsPath, storedCredential({
      issuer: "https://auth.darwiniantools.com/api/auth",
    }));

    const result = await runAuthCommand(["logout"], { fixture });

    expect(result.exitCode).toBe(0);
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
    expect(result.stderr).toContain("revoke failed");
  });

  test("logout reports not logged in when credentials are absent", async () => {
    const result = await runAuthCommand(["logout"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Not logged in.");
  });

  test("whoami uses env token and prints email", async () => {
    WhoamiCommand.testDeps = {
      env: { DRWN_TOKEN: fakeJwt("env@example.com") },
    };

    const result = await runAuthCommand(["whoami"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("env@example.com");
  });

  test("whoami reports not authenticated without env or credentials", async () => {
    WhoamiCommand.testDeps = { env: {} };

    const result = await runAuthCommand(["whoami"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Not authenticated.");
  });

  test("whoami reports expired session on null session", async () => {
    WhoamiCommand.testDeps = {
      env: { DRWN_TOKEN: "opaque" },
    };

    const result = await runAuthCommand(["whoami"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Token is not JWT-shaped.");
  });
});
