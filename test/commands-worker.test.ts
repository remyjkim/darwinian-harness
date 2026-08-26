// ABOUTME: Command-level tests for the drwn worker command surface.
// ABOUTME: Verifies CLI routing, output contracts, env fallbacks, and API calls.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { WorkerCommand } from "../cli/commands/worker/worker";
import { WorkerDeleteCommand } from "../cli/commands/worker/delete";
import { WorkerDeployCommand } from "../cli/commands/worker/deploy";
import { WorkerDeploymentsCommand } from "../cli/commands/worker/deployments";
import { WorkerChatCommand } from "../cli/commands/worker/chat";
import { WorkerListCommand } from "../cli/commands/worker/list";
import { WorkerRollbackCommand } from "../cli/commands/worker/rollback";
import { WorkerStatusCommand } from "../cli/commands/worker/status";
import { resolveWorkerConfig } from "../cli/core/worker-config";
import {
  defaultSecretsFileCandidates,
  DRWN_SECRETS_FILE,
  parseSecretsFile,
} from "../cli/core/worker-secrets";
import type { AgentsContext } from "../cli/context";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
const originalEnv = { ...process.env };

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwinian.dev/api/auth",
    aud: "https://api.darwinian.dev",
    sub: "user_123",
    email: "worker@example.com",
    exp: Math.floor(Date.now() / 1000) + 900,
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
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  process.env = { ...originalEnv };
  await cleanupTempRoots(tempRoots);
});

async function runWorkerCommand(args: string[], fixture?: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  process.env.DRWN_TOKEN = process.env.DRWN_TOKEN ?? fakeJwt();
  const commandFixture = fixture ?? await scaffoldCliFixture();
  if (!fixture) tempRoots.push(commandFixture.root);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: commandFixture.repoRoot,
    agentsDir: commandFixture.agentsDir,
    homeDir: commandFixture.homeDir,
    cwd: process.cwd(),
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(WorkerCommand);
  cli.register(WorkerDeployCommand);
  cli.register(WorkerListCommand);
  cli.register(WorkerStatusCommand);
  cli.register(WorkerDeploymentsCommand);
  cli.register(WorkerChatCommand);
  cli.register(WorkerRollbackCommand);
  cli.register(WorkerDeleteCommand);
  const exitCode = await cli.run(args, context);
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as unknown as typeof fetch;
}

describe("worker config and secrets", () => {
  test("uses new defaults and DRWN studio endpoint overrides", () => {
    expect(resolveWorkerConfig({})).toEqual({
      apiBaseUrl: "https://api.darwinian.dev",
      webBaseUrl: "https://foundry.darwinian.dev",
    });
    expect(resolveWorkerConfig({
      IMINDS_API_URL: "https://old-api.example",
      IMINDS_GATEWAY_URL: "https://old-gw.example",
    })).toEqual({
      apiBaseUrl: "https://api.darwinian.dev",
      webBaseUrl: "https://foundry.darwinian.dev",
    });
    expect(resolveWorkerConfig({
      DRWN_STUDIO_API_URL: "https://new-api.example",
      DRWN_STUDIO_WEB_URL: "https://new-web.example",
      IMINDS_API_URL: "https://old-api.example",
      IMINDS_GATEWAY_URL: "https://old-gw.example",
    })).toEqual({
      apiBaseUrl: "https://new-api.example",
      webBaseUrl: "https://new-web.example",
    });
  });

  test("parses secrets and only tries .drwn.secrets by default", () => {
    expect(parseSecretsFile("# c\nnotion=secret_abc\n\n  search = tok2 \nk=a=b=c\n")).toEqual({
      notion: "secret_abc",
      search: "tok2",
      k: "a=b=c",
    });
    expect(defaultSecretsFileCandidates()).toEqual([DRWN_SECRETS_FILE]);
  });
});

describe("worker command routing", () => {
  test("help exposes worker commands, keeps existing top-level auth available, and omits worker login", async () => {
    const proc = Bun.spawn(["bun", "run", "cli/index.ts", "--help"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);

    for (const command of [
      "drwn worker deploy",
      "drwn worker list",
      "drwn worker status",
      "drwn worker deployments",
      "drwn worker chat",
      "drwn worker rollback",
      "drwn worker delete",
      "drwn login",
      "drwn refresh",
      "drwn whoami",
      "drwn logout",
      "drwn card list",
      "drwn status",
    ]) {
      expect(stdout).toContain(command);
    }
    expect(stdout).not.toContain("drwn worker login");
    expect(stdout).not.toContain("drwn cloud status");
  });

  test("worker command-group help lists deploy/list/status/deployments/chat/rollback/delete", async () => {
    const result = await runWorkerCommand(["worker", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("drwn worker deployments");
    expect(result.stdout).toContain("drwn worker chat");
    expect(result.stdout).toContain("<slug>");
    expect(result.stdout).not.toContain("worker login");
  });

  test("worker login is not registered", async () => {
    const result = await runWorkerCommand(["worker", "login"]);
    expect(result.exitCode).not.toBe(0);
  });

  test("the retired cloud status path is not registered", async () => {
    const result = await runWorkerCommand(["cloud", "status", "harari"]);
    expect(result.exitCode).not.toBe(0);
  });
});

describe("worker API commands", () => {
  test("chat posts messages to the metered chat API endpoint", async () => {
    let postedBody: unknown;
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      const path = new URL(url).pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      postedBody = JSON.parse(String(init?.body));
      return json({ output: "hello back", metered: true });
    });

    const result = await runWorkerCommand(["worker", "chat", "harari", "--message", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["POST /api/minds/harari/chat"]);
    expect(postedBody).toEqual({ message: "hello" });
    expect(JSON.parse(result.stdout)).toEqual({ output: "hello back", metered: true });
  });

  test("deployments marks the active deployment and supports JSON", async () => {
    const body = {
      active_deployment_id: "dep_a",
      deployments: [
        { id: "dep_a", mind_id: "mind_1", card_ref: "github:x/a#1", model: "m", status: "ready", content_hash: "hash", error: null, created_at: "c1", updated_at: "u1" },
        { id: "dep_b", mind_id: "mind_1", card_ref: "github:x/a#2", model: null, status: "failed", content_hash: null, error: "boom", created_at: "c2", updated_at: "u2" },
      ],
    };
    stubFetch(async (url) => {
      expect(new URL(url).pathname).toBe("/api/minds/harari/deployments");
      return json(body);
    });

    const result = await runWorkerCommand(["worker", "deployments", "harari"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\*\s+dep_a/m);
    expect(result.stdout).toContain("boom");

    const asJson = await runWorkerCommand(["worker", "deployments", "harari", "--json"]);
    expect(asJson.exitCode).toBe(0);
    expect(JSON.parse(asJson.stdout)).toEqual(body);
  });

  test("rollback and delete call the expected endpoints", async () => {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      const path = new URL(url).pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path.endsWith("/rollback")) return json({ activeDeploymentId: "dep_prev" });
      return json({ deleted: "harari" });
    });

    const rollback = await runWorkerCommand(["worker", "rollback", "harari"]);
    expect(rollback.exitCode).toBe(0);
    expect(rollback.stdout).toContain("dep_prev");

    const refused = await runWorkerCommand(["worker", "delete", "harari"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("without --force");

    const deleted = await runWorkerCommand(["worker", "delete", "harari", "--force"]);
    expect(deleted.exitCode).toBe(0);
    expect(deleted.stdout).toContain("Deleted");
    expect(calls).toEqual(["POST /api/minds/harari/rollback", "DELETE /api/minds/harari"]);
  });

  test("deploy ignores legacy Mind fields and never fetches or persists a storage binding", async () => {
    process.env.DRWN_POLL_MS = "1";
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["plain"] });
    const cwd = await mkdtemp(join(tmpdir(), "drwn-worker-test-"));
    tempRoots.push(cwd);
    process.chdir(cwd);

    const calls: string[] = [];
    stubFetch(async (url, init) => {
      const path = new URL(url).pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/deployments" && init?.method === "POST") {
        return json({ deploymentId: "dep_test", mindId: "mind_abc123", slug: "harari", status: "pending" }, 201);
      }
      return json({ id: "dep_test", status: "ready" });
    });

    const result = await runWorkerCommand(["worker", "deploy", "@me/plain@^1.0.0", "--name", "harari"], fixture);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Mind:");
    expect(calls).toEqual(["POST /api/deployments", "GET /api/deployments/dep_test"]);
    expect(await Bun.file(join(fixture.agentsDir, "drwn", "mind-bindings.json")).exists()).toBe(false);
  });

  test("deploy reads .drwn.secrets, redacts tokens, and reports ready output", async () => {
    process.env.DRWN_POLL_MS = "1";
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["plain"] });
    const cwd = await mkdtemp(join(tmpdir(), "drwn-worker-test-"));
    tempRoots.push(cwd);
    process.chdir(cwd);
    await writeFile(join(cwd, ".drwn.secrets"), "notion=secret_token\n");

    let postedBody: unknown;
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      const path = new URL(url).pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/deployments" && init?.method === "POST") {
        postedBody = JSON.parse(String(init.body));
        return json({ deploymentId: "dep_test" }, 201);
      }
      return json({ id: "dep_test", status: "ready" });
    });

    const result = await runWorkerCommand(["worker", "deploy", "@me/plain@^1.0.0", "--name", "harari"], fixture);
    expect(result.exitCode).toBe(0);
    expect((postedBody as Record<string, unknown>).cardRef).toBe("@me/plain@^1.0.0");
    expect((postedBody as Record<string, unknown>).name).toBe("harari");
    expect((postedBody as Record<string, unknown>).secrets).toEqual({ notion: "secret_token" });
    expect((postedBody as { blueprint?: { contractVersion?: number } }).blueprint?.contractVersion).toBe(1);
    expect((postedBody as { blueprint?: { lockfile?: { cards?: { name?: string }[] } } }).blueprint?.lockfile?.cards?.[0]?.name).toBe("@me/plain");
    expect(calls).toEqual(["POST /api/deployments", "GET /api/deployments/dep_test"]);
    expect(result.stdout).toContain("Deployment dep_test is ready.");
    expect(result.stdout).toContain("Chat: drwn worker chat harari --message <text>");
    expect(result.stdout).not.toContain("secret_token");
  });
});
