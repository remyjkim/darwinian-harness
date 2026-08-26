// ABOUTME: Proves Worker collection, detail, and project selection use deployed Worker IDs only.
// ABOUTME: Demotion, wrong-organization readback, output, and help remain fail-closed.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { realpath } from "node:fs/promises";
import { Writable } from "node:stream";
import { WorkerCommand } from "../cli/commands/worker/worker";
import { WorkerListCommand } from "../cli/commands/worker/list";
import { WorkerStatusCommand } from "../cli/commands/worker/status";
import { WorkerUseCommand } from "../cli/commands/worker/use";
import type { AgentsContext } from "../cli/context";
import {
  loadMachineCloudContext,
  loadProjectCloudContext,
  selectMachineOrganization,
  writeProjectCloudContext,
} from "../cli/core/management/context-store";
import { resolveCloudProfile } from "../cli/core/management/profile";
import { cleanupTempRoots, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];
const ids = [
  "123e4567-e89b-42d3-a456-426614174003",
  "123e4567-e89b-42d3-a456-426614174004",
  "123e4567-e89b-42d3-a456-426614174013",
];

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }
  text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
}

function b64(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function token(): string {
  const profile = resolveCloudProfile({});
  const iat = Math.floor(Date.now() / 1000) - 1;
  return `${b64({ alg: "none" })}.${b64({
    iss: profile.issuer,
    aud: profile.resource,
    azp: "drwn-cli",
    sub: "user_worker_reader",
    scope: "openid email offline_access dah:management.delegate",
    iat,
    exp: iat + 900,
  })}.sig`;
}

function response(value: unknown, status = 200): Response { return Response.json(value, { status }); }
function publicError(requestId: string, code: string, status: number): Response {
  const wireCode = {
    RESOURCE_UNAVAILABLE: "resource_unavailable",
    AUTHORIZATION_DENIED: "authorization_denied",
  }[code];
  if (!wireCode) throw new Error("unsupported fixture error");
  return response({
    requestId,
    error: wireCode,
  }, status);
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

type ManagementFixture = Awaited<ReturnType<typeof scaffoldManagementFixture>>;

async function fixtureRun(args: string[], fetcher: typeof fetch, options: { project?: boolean; requestIds?: string[] } = {}) {
  const fixture = await scaffoldManagementFixture();
  tempRoots.push(fixture.root);
  const projectConfigPath = options.project ? await writeSupportedProjectConfig(fixture.repoRoot) : null;
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const queue = [...(options.requestIds ?? ids)];
  const deps = {
    env: { DRWN_TOKEN: token() },
    fetcher,
    requestId: () => queue.shift() ?? ids[0]!,
    now: () => "2026-08-25T12:00:00.000Z",
  };
  WorkerListCommand.testDeps = deps;
  WorkerStatusCommand.testDeps = deps;
  WorkerUseCommand.testDeps = deps;
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    projectConfigPath,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerCommand);
  cli.register(WorkerListCommand);
  cli.register(WorkerStatusCommand);
  cli.register(WorkerUseCommand);
  const exitCode = await cli.run(args, context);
  return { fixture, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

afterEach(async () => {
  WorkerListCommand.testDeps = undefined;
  WorkerStatusCommand.testDeps = undefined;
  WorkerUseCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

async function selectProductionOrganization(fixture: ManagementFixture, organizationId = "org_acme") {
  await selectMachineOrganization(
    fixture.homeDir,
    resolveCloudProfile({}).profileDigest,
    organizationId,
    "2026-08-25T11:00:00.000Z",
  );
}

function worker(organizationId = "org_acme") {
  return {
    organizationId,
    workerId: "worker_alpha",
    deployedWorkerId: "deployed_worker_alpha",
    name: "worker-alpha",
    environment: "staging",
    workerRevision: 4,
    bindingRevision: 2,
    retired: false,
  };
}

describe("read-only Worker management commands", () => {
  test("worker list uses the selected organization, exact pagination, and never a Mind or slug route", async () => {
    const paths: string[] = [];
    let currentFixture: ManagementFixture | null = null;
    const fetcher = (async (input, init) => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      return response({ requestId, workers: [worker()], nextCursor: null });
    }) as typeof fetch;
    const fixture = await scaffoldManagementFixture();
    tempRoots.push(fixture.root);
    await selectProductionOrganization(fixture);
    currentFixture = fixture;

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    WorkerListCommand.testDeps = {
      env: { DRWN_TOKEN: token() }, fetcher, requestId: () => ids[0]!, now: () => "2026-08-25T12:00:00.000Z",
    };
    const context: AgentsContext = {
      repoRoot: currentFixture.repoRoot, agentsDir: currentFixture.agentsDir, homeDir: currentFixture.homeDir,
      cwd: currentFixture.repoRoot, projectConfigPath: null, stdin: process.stdin, stdout, stderr, env: {}, colorDepth: 1,
    };
    const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
    cli.register(WorkerCommand); cli.register(WorkerListCommand);
    expect(await cli.run(["worker", "list", "--environment", "staging", "--limit", "100"], context)).toBe(0);
    expect(paths).toEqual(["/api/deployed-workers?environment=staging&limit=100&organizationId=org_acme"]);
    expect(paths.join("\n")).not.toContain("/api/minds");
    expect(paths.join("\n")).not.toContain("worker-alpha");
    expect(stdout.text()).toContain("deployed_worker_alpha");
  });

  test("organization demotion clears only that profile hint and returns one non-enumerating refusal", async () => {
    const fixture = await scaffoldManagementFixture();
    tempRoots.push(fixture.root);
    const production = resolveCloudProfile({});
    const staging = resolveCloudProfile({ DRWN_CLOUD_PROFILE: "staging" });
    await selectMachineOrganization(fixture.homeDir, production.profileDigest, "org_acme", "2026-08-25T11:00:00.000Z");
    await selectMachineOrganization(fixture.homeDir, staging.profileDigest, "org_staging", "2026-08-25T11:01:00.000Z");
    const requestId = ids[0]!;
    const fetcher = (async () => publicError(requestId, "RESOURCE_UNAVAILABLE", 404)) as unknown as typeof fetch;
    WorkerListCommand.testDeps = {
      env: { DRWN_TOKEN: token() }, fetcher, requestId: () => requestId, now: () => "2026-08-25T12:00:00.000Z",
    };
    const stdout = new CaptureStream(); const stderr = new CaptureStream();
    const context: AgentsContext = {
      repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir, homeDir: fixture.homeDir, cwd: fixture.repoRoot,
      projectConfigPath: null, stdin: process.stdin, stdout, stderr, env: {}, colorDepth: 1,
    };
    const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
    cli.register(WorkerCommand); cli.register(WorkerListCommand);
    expect(await cli.run(["worker", "list"], context)).toBe(1);
    expect(stderr.text()).toContain("RESOURCE_UNAVAILABLE");
    expect(stderr.text()).not.toContain("org_acme");
    expect((await loadMachineCloudContext(fixture.homeDir))!.selections).toEqual([{
      profileDigest: staging.profileDigest,
      organizationId: "org_staging",
      updatedAt: "2026-08-25T11:01:00.000Z",
    }]);
  });

  test("worker use validates explicit ID and organization readback before writing project context", async () => {
    const paths: string[] = [];
    const fetcher = (async (input, init) => {
      paths.push(new URL(String(input)).pathname);
      const requestId = new Headers(init?.headers).get("x-request-id")!;
      return response({ requestId, worker: worker() });
    }) as typeof fetch;
    const result = await fixtureRun(["worker", "use", "deployed_worker_alpha", "--json"], fetcher, {
      project: true,
      requestIds: [ids[1]!],
    });
    await selectProductionOrganization(result.fixture);
    // The first run intentionally happened without a selected organization and cannot write.
    expect(result.exitCode).toBe(1);
    expect(paths).toEqual([]);

    WorkerUseCommand.testDeps = undefined;
    const second = await runExistingFixture(result.fixture, ["worker", "use", "deployed_worker_alpha", "--json"], fetcher, ids[1]!);
    expect(second.exitCode).toBe(0);
    expect(paths).toEqual(["/api/deployed-workers/deployed_worker_alpha"]);
    expect(await loadProjectCloudContext(result.fixture.repoRoot)).toEqual({
      schema: "drwn.project-cloud-context",
      schemaVersion: 1,
      profileDigest: resolveCloudProfile({}).profileDigest,
      organizationId: "org_acme",
      deployedWorkerId: "deployed_worker_alpha",
      verifiedAt: "2026-08-25T12:00:00.000Z",
    });
  });

  test("wrong-organization detail and malformed IDs never write or disclose candidate existence", async () => {
    const fixture = await scaffoldManagementFixture(); tempRoots.push(fixture.root);
    const projectConfigPath = await writeSupportedProjectConfig(fixture.repoRoot);
    await selectProductionOrganization(fixture);
    let calls = 0;
    const wrongOrgFetch = (async (_input, init) => {
      calls += 1;
      return response({ requestId: new Headers(init?.headers).get("x-request-id")!, worker: worker("org_other") });
    }) as typeof fetch;
    const wrong = await runExistingFixture(fixture, ["worker", "use", "deployed_worker_alpha"], wrongOrgFetch, ids[1]!, projectConfigPath);
    expect(wrong.exitCode).toBe(1);
    expect(wrong.stderr).toContain("RESOURCE_UNAVAILABLE");
    expect(wrong.stderr).not.toContain("org_other");
    expect(await loadProjectCloudContext(fixture.repoRoot)).toBeNull();

    const invalid = await runExistingFixture(fixture, ["worker", "use", "bad/id"], wrongOrgFetch, ids[1]!, projectConfigPath);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("VALIDATION_FAILED");
    expect(calls).toBe(1);
  });

  test("status uses a verified project ID binding and human and JSON output share the same model", async () => {
    const fixture = await scaffoldManagementFixture(); tempRoots.push(fixture.root);
    const projectConfigPath = await writeSupportedProjectConfig(fixture.repoRoot);
    const profile = resolveCloudProfile({});
    await selectProductionOrganization(fixture);
    await writeProjectCloudContext(fixture.repoRoot, {
      schema: "drwn.project-cloud-context", schemaVersion: 1, profileDigest: profile.profileDigest,
      organizationId: "org_acme", deployedWorkerId: "deployed_worker_alpha", verifiedAt: "2026-08-25T11:00:00.000Z",
    });
    const fetcher = (async (_input, init) => response({
      requestId: new Headers(init?.headers).get("x-request-id")!, worker: worker(),
    })) as typeof fetch;
    const human = await runExistingFixture(fixture, ["worker", "status"], fetcher, ids[1]!, projectConfigPath);
    const machine = await runExistingFixture(fixture, ["worker", "status", "--json"], fetcher, ids[1]!, projectConfigPath);
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Deployed Worker: deployed_worker_alpha");
    expect(human.stdout).toContain("Worker ID: worker_alpha");
    expect(JSON.parse(machine.stdout).data.worker).toEqual(worker());
  });

  test("help performs no profile, custody, context, or network work", async () => {
    let calls = 0;
    const result = await fixtureRun(["worker", "status", "--help"], (async () => {
      calls += 1; throw new Error("must not fetch");
    }) as unknown as typeof fetch);
    expect(result.exitCode).toBe(0);
    expect(calls).toBe(0);
    expect(result.stdout).toContain("deployedWorkerId");
  });
});

async function runExistingFixture(
  fixture: ManagementFixture,
  args: string[],
  fetcher: typeof fetch,
  requestId: string,
  projectConfigPath: string | null = `${fixture.repoRoot}/.agents/drwn/config.json`,
) {
  const stdout = new CaptureStream(); const stderr = new CaptureStream();
  const deps = {
    env: { DRWN_TOKEN: token() }, fetcher, requestId: () => requestId, now: () => "2026-08-25T12:00:00.000Z",
  };
  WorkerListCommand.testDeps = deps; WorkerStatusCommand.testDeps = deps; WorkerUseCommand.testDeps = deps;
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot, agentsDir: fixture.agentsDir, homeDir: fixture.homeDir, cwd: fixture.repoRoot,
    projectConfigPath, stdin: process.stdin, stdout, stderr, env: {}, colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0", enableColors: false });
  cli.register(WorkerCommand); cli.register(WorkerListCommand); cli.register(WorkerStatusCommand); cli.register(WorkerUseCommand);
  const exitCode = await cli.run(args, context);
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
}
