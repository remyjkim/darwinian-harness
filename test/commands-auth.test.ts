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
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(email = "x@y.z", exp = Math.floor(Date.now() / 1000) + 900): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwiniantools.com/api/auth",
    aud: "https://api.darwiniantools.com",
    sub: "user_123",
    email,
    exp,
  })}.sig`;
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
  test("login reports missing analyzer apiUrl with config path and env var", async () => {
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
      version: 2,
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      user_email: "x@y.z",
    });
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
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwiniantools.com/api/auth",
      clientId: "drwn-cli",
      resource: "https://api.darwiniantools.com",
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });

    const result = await runAuthCommand(["logout"], { fixture });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Logged out. Credentials removed.");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
    expect(called).toEqual(["https://auth.darwiniantools.com/api/auth/oauth2/revoke"]);
  });

  test("logout deletes credentials and exits 0 when the revoke returns 400", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    LogoutCommand.testDeps = {
      fetch: (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch,
    };
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwiniantools.com/api/auth",
      clientId: "drwn-cli",
      resource: "https://api.darwiniantools.com",
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });

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
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwiniantools.com/api/auth",
      clientId: "drwn-cli",
      resource: "https://api.darwiniantools.com",
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });

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
