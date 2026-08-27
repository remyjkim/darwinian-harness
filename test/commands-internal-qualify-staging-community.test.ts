// ABOUTME: Proves the hidden staging qualification command keeps auth/read authority process-local.
// ABOUTME: The only durable output is one create-only mode-0600 public I321 receipt.

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
const verificationSentinel = "https://auth.example.test/device?user_code=VERIFY-SENTINEL";

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
  await writeFile(planPath, `${JSON.stringify({
    schema: "cl.drwn.staging-slot-community-plan.v1",
    organizationId: "org_qualification_fixture",
    receipt: stagingCommunityContract.currentRunPlan,
  })}\n`, { mode: 0o600 });
  return { ...value, planPath, outputPath };
}

type TestDeps = NonNullable<typeof QualifyStagingCommunityCommand.testDeps>;

function defaultDependencies(state: { requests: Request[]; browsers: string[] }): TestDeps {
  return {
    runDeviceFlow: async (input) => {
      expect(input.profile.cloudProfileId).toBe("staging");
      input.onUserAction({ verification_uri_complete: verificationSentinel, user_code: "VERIFY-SENTINEL" });
      return {
        version: 3, credentialId: "55555555-5555-4555-8555-555555555555", generation: 1,
        issuer: input.profile.issuer, clientId: "drwn-cli", resource: input.profile.resource,
        accessToken: tokenSentinel, refreshToken: refreshSentinel,
        issuedAt: "2026-08-27T16:59:00.000Z", expiresAt: "2026-08-27T17:14:00.000Z",
        savedAt: "2026-08-27T16:59:00.000Z", userEmail: "human-sentinel@example.test",
      };
    },
    openBrowser: (url) => { state.browsers.push(url); },
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
  const state = { requests: [] as Request[], browsers: [] as string[] };
  QualifyStagingCommunityCommand.testDeps = { ...defaultDependencies(state), ...overrides };
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
  test("runs one process-local device flow/read and writes only the public mode-0600 receipt", async () => {
    const result = await run((f) => ["__internal", "qualify-staging-community", "--plan-file", f.planPath, "--output-file", f.outputPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("AUTH_DEVICE_APPROVAL_REQUIRED\n");
    expect(result.browsers).toEqual([verificationSentinel]);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]!.method).toBe("GET");
    expect(new URL(result.requests[0]!.url).pathname).toBe("/api/organizations/org_qualification_fixture");
    expect((await lstat(result.outputPath)).mode & 0o777).toBe(0o600);
    const publicBytes = await readFile(result.outputPath, "utf8");
    expect(JSON.parse(publicBytes)).toEqual(stagingCommunityContract.vectors[0]!.expectedReceipt);
    expect(`${result.stdout}${result.stderr}${publicBytes}`).not.toMatch(/ACCESS_TOKEN|REFRESH_TOKEN|human-sentinel|VERIFY-SENTINEL|organizationId|displayName|headerPairs/i);
    await expect(lstat(join(result.agentsDir, "drwn", "credentials.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(join(result.agentsDir, "drwn", "cloud-context.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("refuses before output and reflects no hostile identity or authority material", async () => {
    const result = await run((f) => ["__internal", "qualify-staging-community", "--plan-file", f.planPath, "--output-file", f.outputPath], {
      fetcher: (async () => new Response(JSON.stringify(stagingCommunityContract.baseResponse.body), { status: 200, headers: {
        "content-type": "application/json", "x-dah-buzz-community-id": "HOSTILE_COMMUNITY_SENTINEL",
        "x-dah-organization-read-sha256": "7a0810d23c9ad22dbd64e0b68c100de45c8cfc11f3e945f40f96fae99351ad1b",
      } })) as unknown as typeof fetch,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("AUTH_DEVICE_APPROVAL_REQUIRED\nSTAGING_COMMUNITY_QUALIFICATION_FAILED\n");
    await expect(lstat(result.outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.stderr).not.toMatch(/HOSTILE|ACCESS|REFRESH|VERIFY|organization/i);
  });

  test("binds the authorized response request ID to the current invocation", async () => {
    const result = await run((f) => ["__internal", "qualify-staging-community", "--plan-file", f.planPath, "--output-file", f.outputPath], {
      requestId: () => "99999999-9999-4999-8999-999999999999",
    });
    expect(result.exitCode).toBe(1);
    await expect(lstat(result.outputPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.stderr).toBe("AUTH_DEVICE_APPROVAL_REQUIRED\nSTAGING_COMMUNITY_QUALIFICATION_FAILED\n");
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
      const result = await run((f) => ["__internal", "qualify-staging-community", "--plan-file", f.planPath, "--output-file", f.outputPath, flag, "forbidden"], overrides);
      expect(result.exitCode).not.toBe(0);
    }
    expect(effects).toBe(0);
  });
});
