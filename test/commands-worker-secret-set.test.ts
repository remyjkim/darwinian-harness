// ABOUTME: Proves secret CLI ingestion is stdin-only, target-bound, metadata-only, and non-retaining.
// ABOUTME: Kind/env mapping remains strict while the wire contract receives one canonical uppercase name.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { rm } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { WorkerSecretSetCommand } from "../cli/commands/worker/secret-set";
import { createManagementCommandFixture, managementToken } from "./management-command-helpers";

const roots: string[] = [];
const detailId = "123e4567-e89b-42d3-a456-426614174004";
const secretId = "123e4567-e89b-42d3-a456-426614174008";

async function run(args: string[], secret: string, fetcher: typeof fetch, tty = false) {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = tty; stdin.end(secret);
  const f = await createManagementCommandFixture(stdin); roots.push(f.fixture.root);
  const ids = [detailId, secretId];
  WorkerSecretSetCommand.testDeps = {
    env: { DRWN_TOKEN: managementToken() }, fetcher,
    requestId: () => ids.shift()!, now: () => "2026-08-25T12:10:00.000Z",
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerSecretSetCommand);
  const exitCode = await cli.run(args, f.context);
  return { ...f, exitCode, stdout: f.stdout.text(), stderr: f.stderr.text() };
}

afterEach(async () => {
  WorkerSecretSetCommand.testDeps = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function server(requests: Array<{ path: string; body: unknown; requestId: string }>): typeof fetch {
  return (async (input, init) => {
    const path = new URL(String(input)).pathname;
    const requestId = new Headers(init?.headers).get("x-request-id")!;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ path, body, requestId });
    if (path === "/api/deployed-workers/deployed_worker_alpha") {
      return Response.json({ requestId, worker: {
        organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
        name: "worker-alpha", environment: "staging", workerRevision: 3, bindingRevision: 1, retired: false,
      } });
    }
    return Response.json({
      requestId, deployedWorkerId: "deployed_worker_alpha", name: path.split("/").at(-1),
      secretRevision: 1, workerRevision: 4, observedAt: "2026-08-25T12:10:00.000Z",
    });
  }) as typeof fetch;
}

describe("worker secret set", () => {
  test("sends an env secret from stdin and returns only canonical metadata", async () => {
    const requests: Array<{ path: string; body: unknown; requestId: string }> = [];
    const sentinel = "sk_SENTINEL_COMMAND_SECRET_123456";
    const result = await run([
      "worker", "secret", "set", "provider-label", "--kind", "env", "--env-var", "PROVIDER_API_KEY", "--json",
    ], `${sentinel}\n`, server(requests));
    expect(result.exitCode).toBe(0);
    expect(requests.map(({ path }) => path)).toEqual([
      "/api/deployed-workers/deployed_worker_alpha",
      "/api/deployed-workers/deployed_worker_alpha/secrets/PROVIDER_API_KEY",
    ]);
    expect(requests[1]!.body).toEqual({ expectedWorkerRevision: 3, value: sentinel });
    expect(JSON.parse(result.stdout)).toMatchObject({ command: "secrets.set", data: { name: "PROVIDER_API_KEY", secretRevision: 1 } });
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
    expect(await Bun.file(`${result.fixture.repoRoot}/.agents/drwn/.cloud-operations`).exists()).toBe(false);
  });

  test("TTY, empty input, and invalid kind/env/name combinations fail before fetch", async () => {
    for (const [args, secret, tty] of [
      [["worker", "secret", "set", "MCP_TOKEN"], "secret", true],
      [["worker", "secret", "set", "MCP_TOKEN"], "\n", false],
      [["worker", "secret", "set", "label", "--kind", "env"], "secret", false],
      [["worker", "secret", "set", "MCP_TOKEN", "--kind", "mcp", "--env-var", "X"], "secret", false],
      [["worker", "secret", "set", "lowercase"], "secret", false],
    ] as const) {
      let calls = 0;
      const result = await run([...args], secret, (async () => { calls += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch, tty);
      expect(result.exitCode).toBe(1);
      expect(calls).toBe(0);
    }
  });

  test("a reflected typed server error never retains the secret", async () => {
    const sentinel = "sk_SENTINEL_REFLECTED_COMMAND_123456";
    const result = await run(["worker", "secret", "set", "MCP_TOKEN"], sentinel, (async (input, init) => {
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      const path = new URL(String(input)).pathname;
      if (path.endsWith("deployed_worker_alpha")) return server([])(input, init);
      return Response.json({
        schema: "cl.drwn.error.v1", requestId, code: "VALIDATION_FAILED",
        message: `rejected ${sentinel}`, retryable: false,
      }, { status: 400 });
    }) as typeof fetch);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SERVER_RESPONSE_INVALID");
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
  });
});
