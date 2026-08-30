// ABOUTME: Proves organization discovery and selection use the strict management kernel.
// ABOUTME: Pagination, context writes, output, and help remain bounded and non-authoritative.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { readFile, realpath } from "node:fs/promises";
import { Writable } from "node:stream";
import { OrgCommand } from "../cli/commands/org/org";
import { OrgListCommand } from "../cli/commands/org/list";
import { OrgUseCommand } from "../cli/commands/org/use";
import type { AgentsContext } from "../cli/context";
import { resolveCloudProfile } from "../cli/core/management/profile";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const requestIds = [
  "123e4567-e89b-42d3-a456-426614174000",
  "123e4567-e89b-42d3-a456-426614174001",
  "123e4567-e89b-42d3-a456-426614174010",
  "123e4567-e89b-42d3-a456-426614174011",
];

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }
  text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function delegationToken(): string {
  const profile = resolveCloudProfile({});
  const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer,
    aud: profile.resource,
    azp: "drwn-cli",
    sub: "user_org_reader",
    scope: "openid email offline_access dah:management.delegate",
    iat,
    exp: iat + 900,
  })}.sig`;
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

async function scaffoldManagementFixture() {
  const fixture = await scaffoldCliFixture();
  const root = await realpath(fixture.root);
  const canonical = (path: string) => path.replace(fixture.root, root);
  return {
    ...fixture,
    root,
    repoRoot: canonical(fixture.repoRoot),
    homeDir: canonical(fixture.homeDir),
    agentsDir: canonical(fixture.agentsDir),
  };
}

async function runOrg(
  args: string[],
  fetcher: typeof fetch,
  options: { requestIds?: string[] } = {},
) {
  const fixture = await scaffoldManagementFixture();
  tempRoots.push(fixture.root);
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const ids = [...(options.requestIds ?? requestIds)];
  const deps = {
    env: { DRWN_TOKEN: delegationToken() },
    fetcher,
    requestId: () => ids.shift() ?? requestIds[0]!,
    now: () => "2026-08-25T12:00:00.000Z",
  };
  OrgListCommand.testDeps = deps;
  OrgUseCommand.testDeps = deps;
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(OrgCommand);
  cli.register(OrgListCommand);
  cli.register(OrgUseCommand);
  const exitCode = await cli.run(args, context);
  return { fixture, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

afterEach(async () => {
  OrgListCommand.testDeps = undefined;
  OrgUseCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

describe("organization management commands", () => {
  test("list admits limits 1 through 100 and rejects other limits or oversized opaque cursors before fetch", async () => {
    const seen: string[] = [];
    const fetcher = (async (input, init) => {
      const url = String(input);
      seen.push(url);
      const requestId = new Headers(init?.headers).get("x-request-id") ?? requestIds[0]!;
      return response({ requestId, organizations: [], nextCursor: null });
    }) as typeof fetch;

    expect((await runOrg(["org", "list", "--limit", "1"], fetcher, { requestIds: [requestIds[0]!] })).exitCode).toBe(0);
    expect((await runOrg(["org", "list", "--limit", "100"], fetcher, { requestIds: [requestIds[1]!] })).exitCode).toBe(0);
    expect(seen.map((url) => new URL(url).searchParams.get("limit"))).toEqual(["1", "100"]);

    for (const args of [
      ["org", "list", "--limit", "0"],
      ["org", "list", "--limit", "101"],
      ["org", "list", "--limit", "1.5"],
      ["org", "list", "--cursor", "x".repeat(513)],
    ]) {
      const before = seen.length;
      const result = await runOrg(args, fetcher);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("VALIDATION_FAILED");
      expect(seen).toHaveLength(before);
    }
  });

  test("org use verifies the exact detail route before writing one profile-isolated hint", async () => {
    const events: string[] = [];
    const fetcher = (async (input, init) => {
      const url = new URL(String(input));
      events.push(`fetch:${url.pathname}`);
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      return response({
        requestId,
        organization: { organizationId: "org_acme", displayName: "Acme", revision: 7 },
      });
    }) as typeof fetch;
    const result = await runOrg(["org", "use", "org_acme", "--json"], fetcher, { requestIds: [requestIds[1]!] });
    expect(result.exitCode).toBe(0);
    expect(events).toEqual(["fetch:/api/organizations/org_acme"]);
    const contextPath = `${result.fixture.homeDir}/.agents/drwn/cloud-context.json`;
    const stored = JSON.parse(await readFile(contextPath, "utf8"));
    expect(stored.selections).toEqual([{
      profileDigest: resolveCloudProfile({}).profileDigest,
      organizationId: "org_acme",
      updatedAt: "2026-08-25T12:00:00.000Z",
    }]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "organizations.read",
      outcome: "succeeded",
      data: { organization: { organizationId: "org_acme", revision: 7 } },
    });
  });

  test("ordinary org JSON and cloud context remain authority-header free", async () => {
    const communitySentinel = "community-authority-must-not-project";
    const digestSentinel = "a".repeat(64);
    const result = await runOrg(["org", "use", "org_acme", "--json"], (async (_input, init) => {
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      return Response.json({
        requestId,
        organization: { organizationId: "org_acme", displayName: "Acme", revision: 7 },
      }, { headers: {
        "x-dah-buzz-community-id": communitySentinel,
        "x-dah-organization-read-sha256": digestSentinel,
        "cf-ray": "ordinary-routing-metadata",
      } });
    }) as typeof fetch, { requestIds: [requestIds[1]!] });
    expect(result.exitCode).toBe(0);
    const context = await readFile(`${result.fixture.homeDir}/.agents/drwn/cloud-context.json`, "utf8");
    expect(`${result.stdout}${result.stderr}${context}`).not.toContain(communitySentinel);
    expect(`${result.stdout}${result.stderr}${context}`).not.toContain(digestSentinel);
    expect(`${result.stdout}${result.stderr}${context}`).not.toContain("x-dah-");
  });

  test("org use refusal leaves local context absent and never reflects the candidate ID", async () => {
    const requestId = requestIds[1]!;
    const result = await runOrg(["org", "use", "org_hidden"], (async () => response({
      requestId,
      error: "resource_unavailable",
    }, 404)) as unknown as typeof fetch, { requestIds: [requestId] });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("RESOURCE_UNAVAILABLE");
    expect(result.stderr).not.toContain("org_hidden");
    expect(await Bun.file(`${result.fixture.homeDir}/.agents/drwn/cloud-context.json`).exists()).toBe(false);
  });

  test("human and JSON organization output are projections of the same strict result", async () => {
    const fetcher = (async (_input, init) => {
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      return response({
        requestId,
        organizations: [{ organizationId: "org_acme", displayName: "Acme", revision: 3 }],
        nextCursor: "opaque-next",
      });
    }) as typeof fetch;
    const human = await runOrg(["org", "list", "--limit", "50"], fetcher, { requestIds: [requestIds[0]!] });
    const machine = await runOrg(["org", "list", "--limit", "50", "--json"], fetcher, { requestIds: [requestIds[0]!] });
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("org_acme");
    expect(human.stdout).toContain("Acme");
    expect(human.stdout).toContain("opaque-next");
    const model = JSON.parse(machine.stdout);
    expect(model.data.organizations[0]).toEqual({ organizationId: "org_acme", displayName: "Acme", revision: 3 });
    expect(model.data.nextCursor).toBe("opaque-next");
  });

  test("help performs no profile, credential, filesystem, or network work", async () => {
    let calls = 0;
    const result = await runOrg(["org", "list", "--help"], (async () => {
      calls += 1;
      throw new Error("must not fetch");
    }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("--limit");
    expect(result.stdout).toContain("--cursor");
  });
});
