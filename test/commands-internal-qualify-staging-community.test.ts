// ABOUTME: Proves the hidden D52 command delegates one ceremony and keeps authority process-local.
// ABOUTME: The only durable outputs are the paired create-only mode-0600 I321 receipts.

import { afterEach, describe, expect, test } from "bun:test";
import { Builtins, Cli } from "clipanion";
import { lstat, realpath, readFile, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { join } from "node:path";
import { QualifyStagingCommunityCommand } from "../cli/commands/internal/qualify-staging-community";
import type { AgentsContext } from "../cli/context";
import { stagingCommunityContract } from "../cli/core/management/staging-community-qualification";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const tokenSentinel = "ACCESS_TOKEN_SENTINEL_QUALIFICATION";
const refreshSentinel = "REFRESH_TOKEN_SENTINEL_QUALIFICATION";
const verificationSentinel = "https://auth-staging-main.darwinian.dev/device?user_code=VERIFY-SENTINEL";

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); callback();
  }
  text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
}

async function fixture() {
  const raw = await scaffoldCliFixture();
  const root = await realpath(raw.root);
  const canonical = (path: string) => path.replace(raw.root, root);
  const value = { ...raw, root, repoRoot: canonical(raw.repoRoot), homeDir: canonical(raw.homeDir), agentsDir: canonical(raw.agentsDir) };
  tempRoots.push(value.root);
  const planPath = join(root, "qualification-plan.json");
  const outputPath = join(root, "i321-staging-slot-community.json");
  const readinessOutputPath = join(root, "i321-cli-management-readiness.json");
  const communityOutputPath = join(root, "i321-staging-slot-community.json");
  const noticePath = join(root, "approval-notice.json");
  await writeFile(planPath, `${JSON.stringify({
    schema: "cl.dah.cli-management-phase-a-plan.v1",
    environmentId: "staging-1",
    sourceCommitSha: "a".repeat(40),
    qualificationRunId: "11111111-1111-4111-8111-111111111111",
    contractSha256: "c7c66461c9dfc37069691f36826e1ac9e20d59412745a81941cff9de42d5a601",
    providerPolicyVersion: `sha256:${"b".repeat(64)}`,
    relayUrl: "wss://kc.communities.buzz.xyz",
    httpsBase: "https://kc.communities.buzz.xyz",
    workflow: {
      repository: "curation-labs/darwinian-services",
      runId: 33181185126,
      runAttempt: 1,
    },
  })}\n`, { mode: 0o600 });
  return {
    ...value,
    planPath,
    outputPath,
    readinessOutputPath,
    communityOutputPath,
    noticePath,
  };
}

type TestDeps = NonNullable<typeof QualifyStagingCommunityCommand.testDeps>;

function defaultDependencies(state: { requests: Request[] }): TestDeps {
  return {
    executeCeremony: async (input) => {
      await writeFile(input.readinessOutputPath, '{"schema":"cl.dah.cli-management-readiness.v1"}\n', { mode: 0o600 });
      await writeFile(input.communityOutputPath, '{"schema":"cl.dah.staging-slot-community.v1"}\n', { mode: 0o600 });
    },
    runDeviceFlow: async (input) => {
      expect(input.profile.cloudProfileId).toBe("staging");
      await input.onUserAction({
        verification_uri_complete: verificationSentinel,
        user_code: "VERIFY-SENTINEL",
        expires_at: "2026-08-27T17:10:00.000Z",
      });
      return {
        version: 3, credentialId: "55555555-5555-4555-8555-555555555555", generation: 1,
        issuer: input.profile.issuer, clientId: "drwn-cli", resource: input.profile.resource,
        accessToken: tokenSentinel, refreshToken: refreshSentinel,
        issuedAt: "2026-08-27T16:59:00.000Z", expiresAt: "2026-08-27T17:14:00.000Z",
        savedAt: "2026-08-27T16:59:00.000Z", userEmail: "human-sentinel@example.test",
      };
    },
    env: {},
    now: () => Date.parse(stagingCommunityContract.deviceApproval.validationTime),
    requestId: () => "22222222-2222-4222-8222-222222222222",
    fetcher: (async (input, init) => {
      const request = new Request(String(input), init); state.requests.push(request);
      expect(request.headers.get("authorization")).toBe(`Bearer ${tokenSentinel}`);
      return new Response(JSON.stringify(stagingCommunityContract.baseResponse.body), { status: 200, headers: {
        "content-type": "application/json",
        "x-dah-buzz-community-id": "7234a403-cb91-4dab-812c-c6a3dc50a6ef",
        "x-dah-organization-read-sha256": "7a0810d23c9ad22dbd64e0b68c100de45c8cfc11f3e945f40f96fae99351ad1b",
        "cf-ray": "ordinary-routing-metadata",
      } });
    }) as typeof fetch,
  };
}

async function run(
  args: string[] | ((value: Awaited<ReturnType<typeof fixture>>) => string[]),
  overrides: Partial<TestDeps> = {},
) {
  const f = await fixture();
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const state = { requests: [] as Request[] };
  QualifyStagingCommunityCommand.testDeps = {
    ...defaultDependencies(state),
    env: { RUNNER_TEMP: f.root },
    ...overrides,
  };
  const context: AgentsContext = {
    repoRoot: f.repoRoot, projectConfigPath: null, agentsDir: f.agentsDir, homeDir: f.homeDir, cwd: f.root,
    stdin: process.stdin, stdout, stderr, env: {}, colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "1.4.2", enableColors: false });
  cli.register(QualifyStagingCommunityCommand);
  cli.register(Builtins.HelpCommand);
  const exitCode = await cli.run(typeof args === "function" ? args(f) : args, context);
  return { ...f, ...state, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

afterEach(async () => {
  QualifyStagingCommunityCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

describe("hidden staging Community qualification command", () => {
  test("accepts only the composite Phase-A invocation and delegates every exact path", async () => {
    const calls: unknown[] = [];
    const result = await run((f) => [
      "__internal", "qualify-staging-community",
      "--plan-file", f.planPath,
      "--approval-notice-file", f.noticePath,
      "--phase-a-adapter-origin", "http://127.0.0.1:8787",
      "--readiness-output-file", f.readinessOutputPath,
      "--community-output-file", f.communityOutputPath,
    ], {
      executeCeremony: async (input: unknown) => { calls.push(input); },
    } as unknown as Partial<TestDeps>);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(calls).toEqual([{
      planPath: result.planPath,
      approvalNoticePath: result.noticePath,
      adapterOrigin: "http://127.0.0.1:8787",
      readinessOutputPath: result.readinessOutputPath,
      communityOutputPath: result.communityOutputPath,
      runnerTemp: result.root,
    }]);
  });

  test("writes only the paired public mode-0600 receipts", async () => {
    const result = await run((f) => [
      "__internal", "qualify-staging-community",
      "--plan-file", f.planPath,
      "--approval-notice-file", f.noticePath,
      "--phase-a-adapter-origin", "http://127.0.0.1:8787",
      "--readiness-output-file", f.readinessOutputPath,
      "--community-output-file", f.communityOutputPath,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.requests).toHaveLength(0);
    expect((await lstat(result.readinessOutputPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(result.communityOutputPath)).mode & 0o777).toBe(0o600);
    await expect(lstat(result.noticePath)).rejects.toMatchObject({ code: "ENOENT" });
    const publicBytes = `${await readFile(result.readinessOutputPath, "utf8")}${await readFile(result.communityOutputPath, "utf8")}`;
    expect(`${result.stdout}${result.stderr}${publicBytes}`).not.toMatch(/ACCESS_TOKEN|REFRESH_TOKEN|human-sentinel|VERIFY-SENTINEL|organizationId|displayName|headerPairs/i);
    await expect(lstat(join(result.agentsDir, "drwn", "credentials.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(join(result.agentsDir, "drwn", "cloud-context.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("refuses before output and reflects no hostile identity or authority material", async () => {
    const result = await run((f) => [
      "__internal", "qualify-staging-community",
      "--plan-file", f.planPath,
      "--approval-notice-file", f.noticePath,
      "--phase-a-adapter-origin", "http://127.0.0.1:8787",
      "--readiness-output-file", f.readinessOutputPath,
      "--community-output-file", f.communityOutputPath,
    ], {
      executeCeremony: async () => { throw new Error("HOSTILE_COMMUNITY_SENTINEL"); },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("STAGING_COMMUNITY_QUALIFICATION_FAILED\n");
    await expect(lstat(result.readinessOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(result.communityOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.stderr).not.toMatch(/HOSTILE|ACCESS|REFRESH|VERIFY|organization/i);
  });

  test("hard-removes the legacy output-file grammar before effects", async () => {
    let effects = 0;
    const result = await run((f) => [
      "__internal", "qualify-staging-community",
      "--plan-file", f.planPath,
      "--approval-notice-file", f.noticePath,
      "--output-file", f.outputPath,
    ], {
      executeCeremony: async () => { effects += 1; },
    });
    expect(result.exitCode).not.toBe(0);
    expect(effects).toBe(0);
    await expect(lstat(result.outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("stays out of public help and rejects operator authority flags before auth", async () => {
    let effects = 0;
    const overrides: Partial<TestDeps> = {
      runDeviceFlow: async () => { effects += 1; throw new Error("must not run"); },
      fetcher: (async () => { effects += 1; throw new Error("must not fetch"); }) as unknown as typeof fetch,
    };
    const help = await run(["--help"], overrides);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).not.toContain("qualify-staging-community");
    for (const flag of ["--community-id", "--relay-url", "--https-base", "--provider-policy"]) {
      const result = await run((f) => [
        "__internal", "qualify-staging-community",
        "--plan-file", f.planPath,
        "--approval-notice-file", f.noticePath,
        "--phase-a-adapter-origin", "http://127.0.0.1:8787",
        "--readiness-output-file", f.readinessOutputPath,
        "--community-output-file", f.communityOutputPath,
        flag, "forbidden",
      ], overrides);
      expect(result.exitCode).not.toBe(0);
    }
    expect(effects).toBe(0);
  });

  test("refuses a missing RUNNER_TEMP before reading the plan or starting device authorization", async () => {
    let effects = 0;
    const result = await run((f) => [
      "__internal", "qualify-staging-community",
      "--plan-file", f.planPath,
      "--approval-notice-file", f.noticePath,
      "--phase-a-adapter-origin", "http://127.0.0.1:8787",
      "--readiness-output-file", f.readinessOutputPath,
      "--community-output-file", f.communityOutputPath,
    ], {
      env: {},
      executeCeremony: async () => { effects += 1; throw new Error("must not execute"); },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("STAGING_COMMUNITY_QUALIFICATION_FAILED\n");
    expect(effects).toBe(0);
    await expect(lstat(result.noticePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(result.readinessOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(result.communityOutputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
