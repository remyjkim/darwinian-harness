// ABOUTME: Proves worker status reports governance only from an exact local/deployment Card association.
// ABOUTME: Locks truthful declaration and enforcement states into one shared human/JSON model.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { Cli } from "clipanion";
import { WorkerStatusCommand } from "../cli/commands/worker/status";
import {
  renderWorkerGovernanceStatus,
  resolveWorkerGovernanceStatus,
  selectWorkerGovernanceTarget,
  type WorkerGovernanceStatusV1,
} from "../cli/core/worker-governance-status";
import type { DeploymentRow, DeploymentsResponse } from "../cli/commands/worker/types";

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(chunk: Buffer, _enc: string, cb: () => void) {
    this.chunks.push(String(chunk));
    cb();
  }
  get text() {
    return this.chunks.join("");
  }
}

function fakeJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ aud: "https://api.darwinian.dev", exp: Math.floor(Date.now() / 1000) + 3600, sub: "user_test" }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

const TREE_A = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const COMMIT_A = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const tempRoots: string[] = [];

function deployment(id: string, cardRef: string): DeploymentRow {
  return {
    id,
    mind_id: "mind_probe",
    card_ref: cardRef,
    model: null,
    status: "ready",
    content_hash: null,
    error: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:01:00.000Z",
  };
}

function history(activeDeploymentId: string | null, deployments: DeploymentRow[]): DeploymentsResponse {
  return { active_deployment_id: activeDeploymentId, deployments };
}

interface ScaffoldOptions {
  tools?: { allow?: string[]; deny?: string[] };
  activeWorker?: string | null;
  config?: "valid" | "missing" | "malformed";
  lock?: "valid" | "missing" | "malformed";
  includeUnrelatedRoot?: boolean;
}

async function scaffoldProject(options: ScaffoldOptions = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drwn-i239-status-"));
  tempRoots.push(root);
  const drwnDir = join(root, ".agents", "drwn");
  await mkdir(drwnDir, { recursive: true });

  if (options.config !== "missing") {
    await writeFile(
      join(drwnDir, "config.json"),
      options.config === "malformed"
        ? "{not-json"
        : JSON.stringify({
          schema: "drwn.project-config",
          schemaVersion: 1,
          workers: ["@test/blueprint@^1.0.0", ...(options.includeUnrelatedRoot ? ["@test/other@^2.0.0"] : [])],
          activeWorker: options.activeWorker === undefined ? "@test/blueprint" : options.activeWorker,
        }),
    );
  }

  if (options.lock !== "missing") {
    const blueprintManifest = {
      name: "@test/blueprint",
      version: "1.0.0",
      kind: "blueprint",
      composedFrom: ["@test/member@^1.0.0"],
      ...(options.tools ? { tools: options.tools } : {}),
    };
    const workerRoots = [
      { name: "@test/blueprint", requested: "@test/blueprint@^1.0.0", kind: "blueprint", members: ["@test/member"] },
      ...(options.includeUnrelatedRoot
        ? [{ name: "@test/other", requested: "@test/other@^2.0.0", kind: "card", members: [] }]
        : []),
    ];
    const cards = [
      {
        name: "@test/blueprint",
        requested: "@test/blueprint@^1.0.0",
        version: "1.0.0",
        path: `/tmp/store/drwn/extracted/${TREE_A}`,
        integrity: "sha256-x",
        treeSha: TREE_A,
        manifest: blueprintManifest,
        skills: [],
        hooks: [],
        registry: null,
        origin: "store",
        git: { commit: COMMIT_A },
      },
      {
        name: "@test/member",
        requested: "@test/member@^1.0.0",
        version: "1.0.0",
        path: `/tmp/store/drwn/extracted/${TREE_A}`,
        integrity: "sha256-y",
        treeSha: TREE_A,
        manifest: { name: "@test/member", version: "1.0.0" },
        skills: [],
        hooks: [],
        registry: null,
        origin: "store",
        git: { commit: COMMIT_A },
      },
      ...(options.includeUnrelatedRoot
        ? [{
          name: "@test/other",
          requested: "@test/other@^2.0.0",
          version: "2.0.0",
          path: `/tmp/store/drwn/extracted/${TREE_A}`,
          integrity: "sha256-z",
          treeSha: TREE_A,
          manifest: { name: "@test/other", version: "2.0.0" },
          skills: [],
          hooks: [],
          registry: null,
          origin: "store",
          git: { commit: COMMIT_A },
        }]
        : []),
    ];
    await writeFile(
      join(drwnDir, "card.lock"),
      options.lock === "malformed"
        ? "{not-json"
        : JSON.stringify({
          schema: "drwn.project-lock",
          schemaVersion: 1,
          store: { minDrwnVersion: "0.8.0" },
          workerRoots,
          cards,
        }),
    );
  }
  return root;
}

function stubApi(response: DeploymentsResponse) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/minds")) {
      return Response.json({
        minds: [{
          id: "mind_probe",
          slug: "probe",
          status: "ready",
          active_deployment_id: response.active_deployment_id,
          model: null,
          card_ref: response.deployments[0]?.card_ref ?? null,
          updated_at: "2026-08-01T00:01:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
          serving: response.active_deployment_id !== null,
        }],
      });
    }
    if (url.includes("/deployments")) return Response.json(response);
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function runStatus(
  projectRoot: string,
  response: DeploymentsResponse,
  json = false,
): Promise<{ stdout: string; stderr: string; exit: number }> {
  const restoreFetch = stubApi(response);
  const previousCwd = process.cwd();
  const previousToken = process.env.DRWN_TOKEN;
  process.env.DRWN_TOKEN = fakeJwt();
  process.chdir(projectRoot);
  try {
    const cli = new Cli({ binaryName: "drwn" });
    cli.register(WorkerStatusCommand);
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await cli.run(["worker", "status", "probe", ...(json ? ["--json"] : [])], {
      stdin: process.stdin,
      stdout,
      stderr,
      env: process.env,
      agentsDir: projectRoot,
    } as never);
    return { stdout: stdout.text, stderr: stderr.text, exit };
  } finally {
    process.chdir(previousCwd);
    if (previousToken === undefined) delete process.env.DRWN_TOKEN;
    else process.env.DRWN_TOKEN = previousToken;
    restoreFetch();
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("worker governance target selection", () => {
  test.each([
    {
      name: "resolved active deployment",
      input: history("dep_active", [deployment("dep_latest", "@test/latest@1.0.0"), deployment("dep_active", "@test/active@1.0.0")]),
      expected: { kind: "active", cardRef: "@test/active@1.0.0", activeAliasReported: true },
    },
    {
      name: "no active deployment with history",
      input: history(null, [deployment("dep_latest", "@test/latest@1.0.0")]),
      expected: { kind: "latest", cardRef: "@test/latest@1.0.0", activeAliasReported: false },
    },
    {
      name: "no active deployment and empty history",
      input: history(null, []),
      expected: { kind: "unavailable", cardRef: null, activeAliasReported: false },
    },
    {
      name: "reported active id absent from history does not fall back",
      input: history("dep_missing", [deployment("dep_latest", "@test/latest@1.0.0")]),
      expected: { kind: "unavailable", cardRef: null, activeAliasReported: true },
    },
  ])("selects $name", ({ input, expected }) => {
    expect(selectWorkerGovernanceTarget(input)).toEqual(expected);
  });
});

describe("worker governance local declaration evidence", () => {
  test.each([
    ["locked requested ref", "@test/blueprint@^1.0.0"],
    ["canonical locked name and version", "@test/blueprint@1.0.0"],
  ])("matches the active root by %s", async (_label, cardRef) => {
    const root = await scaffoldProject({ tools: { allow: ["read", "write", "search"], deny: ["shell"] } });
    const status = await resolveWorkerGovernanceStatus(history("dep", [deployment("dep", cardRef)]), root);
    expect(status).toEqual({
      declaration: {
        state: "matched",
        source: "local_project_lock",
        cardRef,
        allowCount: 3,
        denyCount: 1,
        reason: null,
      },
      enforcement: {
        state: "unknown",
        source: "deployment_api",
        policyHash: null,
        reason: "CAPABILITY_NOT_REPORTED",
      },
    });
  });

  test("reports a matched declaration even when both rule counts are zero", async () => {
    const root = await scaffoldProject();
    const status = await resolveWorkerGovernanceStatus(
      history(null, [deployment("dep", "@test/blueprint@1.0.0")]),
      root,
    );
    expect(status.declaration).toEqual({
      state: "matched",
      source: "local_project_lock",
      cardRef: "@test/blueprint@1.0.0",
      allowCount: 0,
      denyCount: 0,
      reason: null,
    });
    expect(status.enforcement).toEqual({
      state: "not_applicable",
      source: "deployment_api",
      policyHash: null,
      reason: "NO_ACTIVE_DEPLOYMENT",
    });
  });

  test("never borrows governance rules from a non-active local Card", async () => {
    const root = await scaffoldProject({
      activeWorker: "@test/other",
      includeUnrelatedRoot: true,
      tools: { allow: ["BLUEPRINT_SECRET_SELECTOR"] },
    });
    const status = await resolveWorkerGovernanceStatus(
      history("dep", [deployment("dep", "@test/blueprint@1.0.0")]),
      root,
    );
    expect(status.declaration).toEqual({
      state: "unavailable",
      source: "local_project_lock",
      cardRef: null,
      allowCount: null,
      denyCount: null,
      reason: "LOCAL_CARD_REF_MISMATCH",
    });
    expect(JSON.stringify(status)).not.toContain("SECRET_SELECTOR");
  });

  test("reports a stable mismatch when the selected deployment names another Card", async () => {
    const root = await scaffoldProject({ tools: { allow: ["PRIVATE_SELECTOR"] } });
    const status = await resolveWorkerGovernanceStatus(
      history("dep", [deployment("dep", "@test/different@1.0.0")]),
      root,
    );
    expect(status.declaration.reason).toBe("LOCAL_CARD_REF_MISMATCH");
    expect(status.declaration.cardRef).toBeNull();
    expect(JSON.stringify(status)).not.toContain("PRIVATE_SELECTOR");
  });

  test.each([
    ["missing config", { config: "missing" as const }],
    ["malformed config", { config: "malformed" as const }],
    ["missing lock", { lock: "missing" as const }],
    ["malformed lock", { lock: "malformed" as const }],
    ["no active local root", { activeWorker: null }],
  ])("reports local project unavailable for %s", async (_label, options) => {
    const root = await scaffoldProject(options);
    const status = await resolveWorkerGovernanceStatus(
      history("dep", [deployment("dep", "@test/blueprint@1.0.0")]),
      root,
    );
    expect(status.declaration).toEqual({
      state: "unavailable",
      source: "local_project_lock",
      cardRef: null,
      allowCount: null,
      denyCount: null,
      reason: "LOCAL_PROJECT_UNAVAILABLE",
    });
  });

  test("does not inspect local state when no exact deployment target exists", async () => {
    const root = await scaffoldProject({ config: "malformed", lock: "malformed" });
    const status = await resolveWorkerGovernanceStatus(history("dep_missing", [deployment("dep", "@test/blueprint@1.0.0")]), root);
    expect(status.declaration.reason).toBe("LOCAL_TARGET_UNAVAILABLE");
    expect(status.enforcement).toEqual({
      state: "unknown",
      source: "deployment_api",
      policyHash: null,
      reason: "CAPABILITY_NOT_REPORTED",
    });
  });
});

describe("worker status governance rendering", () => {
  test.each([
    ["matched active", history("dep", [deployment("dep", "@test/blueprint@1.0.0")])],
    ["matched latest without active", history(null, [deployment("dep", "@test/blueprint@1.0.0")])],
    ["no deployment target", history(null, [])],
  ])("human and JSON output are projections of the same model: %s", async (_label, response) => {
    const root = await scaffoldProject({ tools: { allow: ["PRIVATE_ALLOW_A", "PRIVATE_ALLOW_B"], deny: ["PRIVATE_DENY"] } });
    const expected = await resolveWorkerGovernanceStatus(response, root);
    const human = await runStatus(root, response);
    const machine = await runStatus(root, response, true);

    expect(human.exit).toBe(0);
    expect(machine.exit).toBe(0);
    expect(JSON.parse(machine.stdout).governance).toEqual(expected);
    expect(human.stdout).toContain(renderWorkerGovernanceStatus(expected));
    for (const forbidden of ["PRIVATE_ALLOW_A", "PRIVATE_ALLOW_B", "PRIVATE_DENY", "policyHash:", "not enforced", "enforced by"]) {
      expect(human.stdout).not.toContain(forbidden);
      expect(machine.stdout).not.toContain(forbidden);
    }
  });

  test("successful JSON always contains the exact unavailable governance model", async () => {
    const root = await scaffoldProject({ config: "malformed" });
    const response = history("missing", [deployment("latest", "@test/blueprint@1.0.0")]);
    const result = await runStatus(root, response, true);
    const parsed = JSON.parse(result.stdout) as { governance: WorkerGovernanceStatusV1 };
    expect(parsed.governance).toEqual({
      declaration: {
        state: "unavailable",
        source: "local_project_lock",
        cardRef: null,
        allowCount: null,
        denyCount: null,
        reason: "LOCAL_TARGET_UNAVAILABLE",
      },
      enforcement: {
        state: "unknown",
        source: "deployment_api",
        policyHash: null,
        reason: "CAPABILITY_NOT_REPORTED",
      },
    });
  });
});
