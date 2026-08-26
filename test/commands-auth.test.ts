// ABOUTME: Command-level tests for drwn login/logout/whoami.
// ABOUTME: Exercises Clipanion command wiring with injected network and browser dependencies.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { PassThrough, Writable } from "node:stream";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LoginCommand } from "../cli/commands/auth/login";
import { LogoutCommand } from "../cli/commands/auth/logout";
import { RefreshCommand } from "../cli/commands/auth/refresh";
import { WhoamiCommand } from "../cli/commands/auth/whoami";
import type { AgentsContext } from "../cli/context";
import {
  deleteCredentials as deleteCredentialsFromStore,
  readCredentials as readCredentialsFromStore,
  writeCredentials as writeCredentialsToStore,
  type CliDahCredentialFileV3,
} from "../cli/core/auth/credentials";
import { deriveCredentialScope } from "../cli/core/auth/credential-scope";
import { parseAuthOperationReceipt } from "../cli/core/auth/receipt";
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";
import { InMemoryKeychainBackend } from "./helpers/keychain-backend";

const tempRoots: string[] = [];
let keychainBackend: InMemoryKeychainBackend;

beforeEach(() => {
  keychainBackend = new InMemoryKeychainBackend();
});

function readCredentials(path: string) {
  return readCredentialsFromStore(path, keychainBackend);
}

function writeCredentials(path: string, credential: CliDahCredentialFileV3) {
  return writeCredentialsToStore(path, credential, keychainBackend);
}

function deleteCredentials(path: string) {
  return deleteCredentialsFromStore(path, keychainBackend);
}

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
    azp: "drwn-cli",
    sub: "user_123",
    scope: "openid email offline_access dah:management.delegate",
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

function developmentBuildIdentity() {
  return Promise.resolve({
    kind: "development",
    schema: "darwinian.worker.build-identity",
    schemaVersion: 1,
    version: "1.4.2",
    sourceCommit: "0".repeat(40),
    qualificationEligible: false,
  } as const);
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
  RefreshCommand.testDeps = undefined;
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
  LoginCommand.testDeps = { ...LoginCommand.testDeps, keychainBackend };
  LogoutCommand.testDeps = { ...LogoutCommand.testDeps, keychainBackend };
  RefreshCommand.testDeps = { ...RefreshCommand.testDeps, keychainBackend };
  WhoamiCommand.testDeps = { ...WhoamiCommand.testDeps, keychainBackend };
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
  test("retired partial cloud overrides fail before refresh or logout reads credential custody", async () => {
    for (const Command of [RefreshCommand, LogoutCommand]) {
      let reads = 0;
      Command.testDeps = {
        env: { DRWN_DAH_HUB_URL: "https://partial.example" },
        readCredentials: async () => {
          reads += 1;
          return null;
        },
      };

      const result = await runAuthCommand(Command === RefreshCommand ? ["refresh"] : ["logout"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("CLOUD_PROFILE_INVALID\n");
      expect(reads).toBe(0);
      Command.testDeps = undefined;
    }
  });

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
        version: "1.4.2",
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
      worker: { version: "1.4.2", sourceCommit: "0".repeat(40) },
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

  test("login --json clamps action time to a signed iat within normal clock skew", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const nowMillis = nowSeconds * 1000;
    const futureIat = nowSeconds + 30;
    const successfulFetch = deviceFlowFetch();
    LoginCommand.testDeps = {
      env: {},
      fetch: (async (url: string, init?: RequestInit) => {
        if (new URL(url).pathname === "/api/auth/oauth2/token") {
          return Response.json({
            access_token: fakeJwt("skew@example.test", futureIat + 900),
            refresh_token: "refresh-skew",
            token_type: "Bearer",
            expires_in: 900,
          });
        }
        return successfulFetch(url, init);
      }) as typeof fetch,
      sleep: async () => {},
      now: () => nowMillis,
      randomUUID: () => "89898989-8989-4989-8989-898989898989",
      openBrowser: () => {},
      loadBuildIdentity: developmentBuildIdentity,
    };

    const result = await runAuthCommand(["login", "--json"]);
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(receipt.actionAt).toBe(new Date(futureIat * 1000).toISOString());
    expect(receipt.actionAt).toBe(receipt.credential.issuedAt);
    expect(await readCredentials(resolveCredentialsPath(result.fixture.agentsDir))).toMatchObject({
      credentialId: "89898989-8989-4989-8989-898989898989",
      refreshToken: "refresh-skew",
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
        version: "1.4.2",
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
        version: "1.4.2",
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
        version: "1.4.2",
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
        version: "1.4.2",
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

  test("refresh help is side-effect-free and documents explicit forced refresh", async () => {
    let effects = 0;
    RefreshCommand.testDeps = {
      fetch: (async () => {
        effects += 1;
        throw new Error("must not fetch for help");
      }) as unknown as typeof fetch,
      readCredentials: async () => {
        effects += 1;
        throw new Error("must not read credentials for help");
      },
    };

    const result = await runAuthCommand(["refresh", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Details$/m);
    expect(result.stdout).toMatch(/^Examples$/m);
    expect(result.stdout).toContain("always performs");
    expect(result.stdout).toContain("--json");
    expect(effects).toBe(0);
  });

  test("refresh --json always refreshes a fresh credential and emits the persisted generation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const refreshedToken = fakeJwt("forced@example.test");
    const requestBodies: string[] = [];
    RefreshCommand.testDeps = {
      env: {},
      fetch: (async (_url: string, init?: RequestInit) => {
        requestBodies.push(String(init?.body ?? ""));
        return Response.json({
          access_token: refreshedToken,
          refresh_token: "refresh-2",
          expires_in: 900,
        });
      }) as typeof fetch,
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.4.2",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
    };

    const result = await runAuthCommand(["refresh", "--json"], { fixture });
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toContain("grant_type=refresh_token");
    expect(receipt).toMatchObject({
      worker: { version: "1.4.2", sourceCommit: "0".repeat(40) },
      credential: { credentialId: current.credentialId, generation: 2 },
      action: "refresh",
      mode: "ordinary",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
      reason: "BUILD_IDENTITY_UNQUALIFIED",
    });
    expect(await readCredentials(credentialsPath)).toMatchObject({
      credentialId: current.credentialId,
      generation: 2,
      accessToken: refreshedToken,
      refreshToken: "refresh-2",
    });
  });

  test("refresh --json reports profile mismatch without a request or write", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    let requests = 0;
    RefreshCommand.testDeps = {
      env: { DRWN_CLOUD_PROFILE: "staging" },
      fetch: (async () => {
        requests += 1;
        return Response.json({});
      }) as unknown as typeof fetch,
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.4.2",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
    };

    const result = await runAuthCommand(["refresh", "--json"], { fixture });
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(requests).toBe(0);
    expect(receipt).toMatchObject({
      credential: { credentialId: current.credentialId, generation: 1 },
      outcome: "failed",
      qualificationEligible: false,
      remote: { action: "refresh", result: "not_applicable", httpClass: "not_applicable" },
      local: { action: "write", result: "not_performed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_PROFILE_MISMATCH",
    });
    expect(await readCredentials(credentialsPath)).toEqual(current);
  });

  test("refresh --json reports write failure without advancing retained generation or leaking error text", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const sentinel = "SENTINEL_REFRESH_WRITE_FAILURE_239";
    RefreshCommand.testDeps = {
      env: {},
      fetch: (async () => Response.json({
        access_token: fakeJwt("rotated@example.test"),
        refresh_token: "rotated-refresh-token",
        expires_in: 900,
      })) as unknown as typeof fetch,
      writeCredentials: async () => { throw new Error(sentinel); },
      loadBuildIdentity: async () => ({
        kind: "development",
        schema: "darwinian.worker.build-identity",
        schemaVersion: 1,
        version: "1.4.2",
        sourceCommit: "0".repeat(40),
        qualificationEligible: false,
      }),
    };

    const result = await runAuthCommand(["refresh", "--json"], { fixture });
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(receipt).toMatchObject({
      credential: { credentialId: current.credentialId, generation: 1 },
      outcome: "failed",
      qualificationEligible: false,
      remote: { action: "refresh", result: "confirmed", httpClass: "2xx" },
      local: { action: "write", result: "failed", afterConfirmedRemoteRevoke: false },
      reason: "CREDENTIAL_WRITE_FAILED",
    });
    expect(result.stderr).toContain("CREDENTIAL_WRITE_FAILED");
    expect(result.stderr).toContain("run `drwn login` again");
    expect(result.stdout).not.toContain("rotated-refresh-token");
    expect(result.stderr).not.toContain(sentinel);
    expect(await readCredentials(credentialsPath)).toEqual(current);
  });

  test("refresh ignores DRWN_TOKEN and fails absent stored custody without output or request", async () => {
    let requests = 0;
    RefreshCommand.testDeps = {
      env: { DRWN_TOKEN: fakeJwt("env-only@example.test") },
      fetch: (async () => {
        requests += 1;
        return Response.json({});
      }) as unknown as typeof fetch,
    };

    const result = await runAuthCommand(["refresh", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("CREDENTIAL_ABSENT\n");
    expect(requests).toBe(0);
    expect(await Bun.file(resolveCredentialsPath(result.fixture.agentsDir)).exists()).toBe(false);
  });

  test("logout help is side-effect-free and documents ordinary versus confirmed-revoke modes", async () => {
    let effects = 0;
    LogoutCommand.testDeps = {
      fetch: (async () => {
        effects += 1;
        throw new Error("must not fetch for help");
      }) as unknown as typeof fetch,
      readCredentials: async () => {
        effects += 1;
        throw new Error("must not read credentials for help");
      },
    };

    const result = await runAuthCommand(["logout", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Details$/m);
    expect(result.stdout).toMatch(/^Examples$/m);
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--require-remote-revoke");
    expect(result.stdout).toContain("does not claim");
    expect(effects).toBe(0);
  });

  test("ordinary logout --json records confirmed revoke before scoped deletion and never qualifies", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const events: string[] = [];
    LogoutCommand.testDeps = {
      env: {},
      fetch: (async () => {
        events.push("revoke");
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
      deleteCredentials: async (path) => {
        events.push(`delete:${path}`);
        await deleteCredentials(path);
      },
      loadBuildIdentity: developmentBuildIdentity,
    };

    const result = await runAuthCommand(["logout", "--json"], { fixture });
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));
    const expectedScope = await deriveCredentialScope(credentialsPath);

    expect(result.exitCode).toBe(0);
    expect(events).toEqual(["revoke", `delete:${credentialsPath}`]);
    expect(receipt).toMatchObject({
      qualificationNamespaceDigest: expectedScope.qualificationNamespaceDigest,
      credential: { credentialId: current.credentialId, generation: current.generation },
      action: "logout",
      mode: "ordinary",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "revoke", result: "confirmed", httpClass: "2xx" },
      local: { action: "delete", result: "confirmed", afterConfirmedRemoteRevoke: true },
      reason: null,
    });
    expect(result.stdout).not.toContain(current.refreshToken);
    expect(result.stdout).not.toContain(current.accessToken);
    expect(result.stdout).not.toContain(credentialsPath);
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
  });

  test("ordinary logout contains locally after every degraded remote class and discloses non-qualification", async () => {
    const sentinel = "SENTINEL_REVOKE_BODY_239";
    const scenarios: Array<{
      fetch: typeof fetch;
      remote: { result: string; httpClass: string };
      reason: string;
    }> = [
      {
        fetch: (async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } })) as unknown as typeof fetch,
        remote: { result: "indeterminate", httpClass: "3xx" },
        reason: "AUTH_REMOTE_INDETERMINATE",
      },
      {
        fetch: (async () => new Response(sentinel, { status: 400 })) as unknown as typeof fetch,
        remote: { result: "rejected", httpClass: "4xx" },
        reason: "AUTH_REMOTE_REJECTED",
      },
      {
        fetch: (async () => new Response(sentinel, { status: 503 })) as unknown as typeof fetch,
        remote: { result: "indeterminate", httpClass: "5xx" },
        reason: "AUTH_REMOTE_INDETERMINATE",
      },
      {
        fetch: (async () => { throw new TypeError(sentinel); }) as unknown as typeof fetch,
        remote: { result: "indeterminate", httpClass: "network_error" },
        reason: "AUTH_REMOTE_INDETERMINATE",
      },
    ];

    for (const scenario of scenarios) {
      const fixture = await scaffoldCliFixture();
      tempRoots.push(fixture.root);
      const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
      await writeCredentials(credentialsPath, storedCredential());
      LogoutCommand.testDeps = {
        env: {},
        fetch: scenario.fetch,
        loadBuildIdentity: developmentBuildIdentity,
      };

      const result = await runAuthCommand(["logout", "--json"], { fixture });
      const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

      expect(result.exitCode).toBe(0);
      expect(receipt).toMatchObject({
        mode: "ordinary",
        outcome: "succeeded",
        qualificationEligible: false,
        remote: { action: "revoke", ...scenario.remote },
        local: { action: "delete", result: "confirmed", afterConfirmedRemoteRevoke: false },
        reason: scenario.reason,
      });
      expect(result.stderr).toContain(scenario.reason);
      expect(result.stdout).not.toContain(sentinel);
      expect(result.stderr).not.toContain(sentinel);
      expect(await Bun.file(credentialsPath).exists()).toBe(false);
    }
  });

  test("profile mismatch deletes in ordinary mode but preserves custody in strict mode without a request", async () => {
    for (const strict of [false, true]) {
      const fixture = await scaffoldCliFixture();
      tempRoots.push(fixture.root);
      const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
      const current = storedCredential();
      await writeCredentials(credentialsPath, current);
      let requests = 0;
      LogoutCommand.testDeps = {
        env: { DRWN_CLOUD_PROFILE: "staging" },
        fetch: (async () => {
          requests += 1;
          return new Response(null, { status: 204 });
        }) as unknown as typeof fetch,
        loadBuildIdentity: developmentBuildIdentity,
      };

      const args = ["logout", "--json", ...(strict ? ["--require-remote-revoke"] : [])];
      const result = await runAuthCommand(args, { fixture });
      const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

      expect(requests).toBe(0);
      expect(result.exitCode).toBe(strict ? 1 : 0);
      expect(receipt).toMatchObject({
        mode: strict ? "require_remote_revoke" : "ordinary",
        outcome: strict ? "failed" : "succeeded",
        qualificationEligible: false,
        remote: { action: "revoke", result: "not_applicable", httpClass: "not_applicable" },
        local: {
          action: "delete",
          result: strict ? "not_performed" : "confirmed",
          afterConfirmedRemoteRevoke: false,
        },
        reason: "CREDENTIAL_PROFILE_MISMATCH",
      });
      expect(await Bun.file(credentialsPath).exists()).toBe(strict);
    }
  });

  test("strict logout preserves custody for every unconfirmed remote class", async () => {
    const sentinel = "SENTINEL_STRICT_REVOKE_239";
    const scenarios: Array<{
      fetch: typeof fetch;
      remote: { result: string; httpClass: string };
      reason: string;
    }> = [
      {
        fetch: (async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } })) as unknown as typeof fetch,
        remote: { result: "indeterminate", httpClass: "3xx" },
        reason: "AUTH_REMOTE_INDETERMINATE",
      },
      {
        fetch: (async () => new Response(sentinel, { status: 400 })) as unknown as typeof fetch,
        remote: { result: "rejected", httpClass: "4xx" },
        reason: "AUTH_REMOTE_REJECTED",
      },
      {
        fetch: (async () => new Response(sentinel, { status: 503 })) as unknown as typeof fetch,
        remote: { result: "indeterminate", httpClass: "5xx" },
        reason: "AUTH_REMOTE_INDETERMINATE",
      },
      {
        fetch: (async () => { throw new TypeError(sentinel); }) as unknown as typeof fetch,
        remote: { result: "indeterminate", httpClass: "network_error" },
        reason: "AUTH_REMOTE_INDETERMINATE",
      },
    ];

    for (const scenario of scenarios) {
      const fixture = await scaffoldCliFixture();
      tempRoots.push(fixture.root);
      const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
      const current = storedCredential();
      await writeCredentials(credentialsPath, current);
      let deletes = 0;
      LogoutCommand.testDeps = {
        env: {},
        fetch: scenario.fetch,
        deleteCredentials: async () => { deletes += 1; },
        loadBuildIdentity: developmentBuildIdentity,
      };

      const result = await runAuthCommand(["logout", "--json", "--require-remote-revoke"], { fixture });
      const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

      expect(result.exitCode).toBe(1);
      expect(deletes).toBe(0);
      expect(receipt).toMatchObject({
        mode: "require_remote_revoke",
        outcome: "failed",
        qualificationEligible: false,
        remote: { action: "revoke", ...scenario.remote },
        local: { action: "delete", result: "not_performed", afterConfirmedRemoteRevoke: false },
        reason: scenario.reason,
      });
      expect(result.stdout).not.toContain(sentinel);
      expect(result.stderr).not.toContain(sentinel);
      expect(await readCredentials(credentialsPath)).toEqual(current);
    }
  });

  test("strict logout qualifies only after confirmed revoke followed by confirmed scoped deletion", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const events: string[] = [];
    LogoutCommand.testDeps = {
      env: {},
      fetch: (async () => {
        events.push("revoke");
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
      deleteCredentials: async (path) => {
        events.push("delete");
        await deleteCredentials(path);
      },
      loadBuildIdentity: developmentBuildIdentity,
    };

    const result = await runAuthCommand(["logout", "--json", "--require-remote-revoke"], { fixture });
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(events).toEqual(["revoke", "delete"]);
    expect(receipt).toMatchObject({
      mode: "require_remote_revoke",
      outcome: "succeeded",
      qualificationEligible: false,
      remote: { action: "revoke", result: "confirmed", httpClass: "2xx" },
      local: { action: "delete", result: "confirmed", afterConfirmedRemoteRevoke: true },
      reason: "BUILD_IDENTITY_UNQUALIFIED",
    });
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
  });

  test("strict logout reports partial local deletion failure after confirmed revoke without false success", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    const current = storedCredential();
    await writeCredentials(credentialsPath, current);
    const sentinel = "SENTINEL_PARTIAL_DELETE_239";
    LogoutCommand.testDeps = {
      env: {},
      fetch: (async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
      deleteCredentials: async (path) => {
        await rm(path, { force: true });
        throw new Error(sentinel);
      },
      loadBuildIdentity: developmentBuildIdentity,
    };

    const result = await runAuthCommand(["logout", "--json", "--require-remote-revoke"], { fixture });
    const receipt = parseAuthOperationReceipt(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(receipt).toMatchObject({
      mode: "require_remote_revoke",
      outcome: "failed",
      qualificationEligible: false,
      remote: { action: "revoke", result: "confirmed", httpClass: "2xx" },
      local: { action: "delete", result: "failed", afterConfirmedRemoteRevoke: true },
      reason: "CREDENTIAL_DELETE_FAILED",
    });
    expect(result.stderr).toContain("CREDENTIAL_DELETE_FAILED");
    expect(result.stdout).not.toContain(sentinel);
    expect(result.stderr).not.toContain(sentinel);
  });

  test("strict logout requires safe v3 custody before build identity, network, or deletion", async () => {
    let effects = 0;
    LogoutCommand.testDeps = {
      fetch: (async () => {
        effects += 1;
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
      deleteCredentials: async () => { effects += 1; },
      loadBuildIdentity: async () => {
        effects += 1;
        return developmentBuildIdentity();
      },
    };

    const absent = await runAuthCommand(["logout", "--json", "--require-remote-revoke"]);
    expect(absent.exitCode).toBe(1);
    expect(absent.stdout).toBe("");
    expect(absent.stderr).toBe("CREDENTIAL_ABSENT\n");
    expect(effects).toBe(0);

    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(credentialsPath, "not-an-envelope");
    const unsupported = await runAuthCommand(["logout", "--json", "--require-remote-revoke"], { fixture });
    expect(unsupported.exitCode).toBe(1);
    expect(unsupported.stdout).toBe("");
    expect(unsupported.stderr).toBe("CREDENTIAL_SCHEMA_UNSUPPORTED\n");
    expect(effects).toBe(0);
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
