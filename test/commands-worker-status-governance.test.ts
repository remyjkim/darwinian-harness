// ABOUTME: Locks I220's declared-vs-enforced governance section in worker status: declared tool
// ABOUTME: rule counts render with the literal not-enforced statement, and never render as enforced.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { Cli } from "clipanion";
import { WorkerStatusCommand } from "../cli/commands/worker/status";


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

async function scaffoldProject(tools?: { allow?: string[]; deny?: string[] }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drwn-i220-status-"));
  const drwnDir = join(root, ".agents", "drwn");
  await mkdir(drwnDir, { recursive: true });
  const manifest: Record<string, unknown> = {
    name: "@test/blueprint",
    version: "1.0.0",
    kind: "blueprint",
    composedFrom: ["@test/member@^1.0.0"],
    ...(tools ? { tools } : {}),
  };
  await writeFile(
    join(drwnDir, "config.json"),
    JSON.stringify({
      schema: "drwn.project-config",
      schemaVersion: 1,
      workers: ["@test/blueprint@^1.0.0"],
      activeWorker: "@test/blueprint",
    }),
  );
  await writeFile(
    join(drwnDir, "card.lock"),
    JSON.stringify({
      schema: "drwn.project-lock",
      schemaVersion: 1,
      store: { minDrwnVersion: "0.8.0" },
      workerRoots: [
        { name: "@test/blueprint", requested: "@test/blueprint@^1.0.0", kind: "blueprint", members: ["@test/member"] },
      ],
      cards: [
        {
          name: "@test/blueprint",
          requested: "@test/blueprint@^1.0.0",
          version: "1.0.0",
          path: `/tmp/store/drwn/extracted/${TREE_A}`,
          integrity: "sha256-x",
          treeSha: TREE_A,
          manifest,
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
      ],
    }),
  );
  return root;
}

function stubApi() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/minds")) {
      return Response.json({
        minds: [{ slug: "probe", status: "ready", active_deployment: "dep_1", model: "default", updated: "now" }],
      });
    }
    if (url.includes("/deployments")) {
      return Response.json({ deployments: [] });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function runStatus(projectRoot: string): Promise<{ stdout: string; exit: number }> {
  const restoreFetch = stubApi();
  const previousCwd = process.cwd();
  const previousToken = process.env.DRWN_TOKEN;
  process.env.DRWN_TOKEN = fakeJwt();
  process.chdir(projectRoot);
  try {
    const cli = new Cli({ binaryName: "drwn" });
    cli.register(WorkerStatusCommand);
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await cli.run(["worker", "status", "probe"], {
      stdin: process.stdin,
      stdout,
      stderr,
      env: process.env,
      agentsDir: projectRoot,
    } as never);
    return { stdout: stdout.text, exit };
  } finally {
    process.chdir(previousCwd);
    if (previousToken === undefined) delete process.env.DRWN_TOKEN;
    else process.env.DRWN_TOKEN = previousToken;
    restoreFetch();
  }
}

describe("worker status governance section (I220)", () => {
  afterEach(() => {
    // stubApi restores per-run; nothing global persists
  });

  test("declared tools render with the literal not-enforced statement", async () => {
    const root = await scaffoldProject({ allow: ["a", "b", "c"], deny: ["d"] });
    const { stdout } = await runStatus(root);
    expect(stdout).toContain("Governance");
    expect(stdout).toContain("tools.allow: 3");
    expect(stdout).toContain("tools.deny: 1");
    expect(stdout).toContain("declared — not enforced by the deployed runtime");
    expect(stdout.toLowerCase()).not.toContain("enforced by the deployed runtime: yes");
  });

  test("no declared tools means no governance section", async () => {
    const root = await scaffoldProject(undefined);
    const { stdout } = await runStatus(root);
    expect(stdout).not.toContain("Governance");
  });
});
