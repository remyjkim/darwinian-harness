// ABOUTME: Real-BeginningDB e2e: contract checks (CAS, append, placements) plus the full mind lifecycle via the CLI.
// ABOUTME: Gated by DRWN_E2E_BGDB=1; spawns the server binary from DRWN_E2E_BGDB_BIN or targets BGDB_BASE_URL directly.

import { afterAll, beforeAll, expect, test as baseTest } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMindDbClient, type MindDbClient } from "../cli/core/mind-store/client";
import { readMindIndex } from "../cli/core/mind-store/mind-index";
import { memoryViewPath, poolEntryPath } from "../cli/core/mind-store/paths";
import { cleanupTempRoots, createCatalogCardSource, createTempRoot, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const enabled = process.env.DRWN_E2E_BGDB === "1";
const test = baseTest.skipIf(!enabled);

const E2E_TOKEN = process.env.BGDB_TOKEN ?? "drwn-e2e-token";
const E2E_TENANT = process.env.BGDB_TENANT_ID ?? "1";
let baseUrl = process.env.BGDB_BASE_URL ?? "";
let serverProc: ReturnType<typeof Bun.spawn> | null = null;
const tempRoots: string[] = [];

beforeAll(async () => {
  if (!enabled || baseUrl) {
    return;
  }
  const bin = process.env.DRWN_E2E_BGDB_BIN;
  if (!bin || !existsSync(bin)) {
    throw new Error("DRWN_E2E_BGDB=1 requires BGDB_BASE_URL or DRWN_E2E_BGDB_BIN pointing at a beginningdb binary");
  }
  const dataDir = await createTempRoot("bgdb-e2e-data-");
  tempRoots.push(dataDir);
  const port = 18091 + Math.floor(Math.random() * 500);
  baseUrl = `http://127.0.0.1:${port}`;
  serverProc = Bun.spawn([bin], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      BGDB_PROFILE: "development",
      BGDB_DATA_DIR: dataDir,
      BGDB_STORAGE: "fs",
      BGDB_BIND: `127.0.0.1:${port}`,
      BGDB_BEARER_TOKEN: E2E_TOKEN,
    },
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const probe = await fetch(`${baseUrl}/v1/fs/probe`, { headers: authHeaders() });
      if (probe.status !== 0) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("BeginningDB did not become reachable within 30s");
});

afterAll(async () => {
  serverProc?.kill();
  await cleanupTempRoots(tempRoots);
});

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${E2E_TOKEN}`, "x-tenant-id": E2E_TENANT };
}

function client(): MindDbClient {
  return createMindDbClient({ baseUrl, token: E2E_TOKEN, tenantId: Number(E2E_TENANT) });
}

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

test("contract: CAS create/update semantics match the fake", async () => {
  const db = client();
  const path = `/contract/${unique("cas")}/file.md`;

  const created = await db.put(path, "v1", { ifNoneMatch: "*" });
  expect(created.etag.length).toBeGreaterThan(0);

  await expect(db.put(path, "v2", { ifNoneMatch: "*" })).rejects.toThrow(/conflict/i);
  await db.put(path, "v2", { ifMatch: created.etag });
  expect((await db.get(path))?.content).toBe("v2");
  await expect(db.put(path, "v3", { ifMatch: created.etag })).rejects.toThrow(/conflict/i);
});

test("contract: append and placement lifecycle match the fake", async () => {
  const db = client();
  const pool = `/contract/${unique("pool")}/entry.jsonl`;
  const view = `/contract/${unique("view")}/entry.jsonl`;

  await db.put(pool, "one\n");
  await db.append(pool, "two\n");
  await db.place(pool, view);
  expect((await db.get(view))?.content).toBe("one\ntwo\n");

  const stat = await db.stat(pool);
  const placements = await db.placements(stat!.inodeId);
  expect(placements.sort()).toEqual([pool, view].sort());

  await db.unplace(view);
  expect((await db.get(pool))?.content).toBe("one\ntwo\n");
  await db.delete(pool, { everywhere: true });
  expect(await db.get(pool)).toBeNull();
});

test("contract: semantic observations and insights preserve inode identity across views", async () => {
  const db = client();
  const mindId = unique("mind_semantic");
  const now = new Date("2026-07-07T14:03:00.000Z");
  const observation = poolEntryPath({ kind: "observations", now, entryId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
  const insight = poolEntryPath({ kind: "insights", now, entryId: "01ARZ3NDEKTSV4RRFFQ69G5FAW" });
  const observationView = memoryViewPath(mindId, "observations", observation);
  const insightView = memoryViewPath(mindId, "insights", insight);
  const topicView = `/minds/${mindId}/memory/insights/by-topic/quality/current.md`;

  await db.put(observation, '{"ts":"2026-07-07T14:03:00Z","content":"fact"}\n', { ifNoneMatch: "*" });
  await db.put(insight, "---\nts: 2026-07-07T14:03:00Z\nderivedFrom: [fact]\n---\n\nInsight.\n", { ifNoneMatch: "*" });
  await db.place(observation, observationView);
  await db.place(insight, insightView);
  await db.place(insight, topicView);

  const observationStat = await db.stat(observation);
  expect(new Set(await db.placements(observationStat!.inodeId))).toEqual(new Set([observationView, observation]));
  const insightStat = await db.stat(insight);
  expect(new Set(await db.placements(insightStat!.inodeId))).toEqual(new Set([insightView, topicView, insight]));
});

test("journey: provision, DB-first edit, drift-preserving sync, checkpoint against the real server", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const sourceDir = await createCatalogCardSource(fixture, "@me/mind");
  expect(
    (await runAgentsCli(["card", "source", "add-persona", "@me/mind", "voice", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/mind"], envFor(fixture))).exitCode).toBe(0);

  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["add", "@me/mind@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const mindId = unique("mind_e2e");
  const env = {
    ...envFor(fixture),
    BGDB_BASE_URL: baseUrl,
    BGDB_TOKEN: E2E_TOKEN,
    BGDB_TENANT_ID: E2E_TENANT,
    BGDB_PATH_PREFIX: `minds/${mindId}`,
  };
  expect((await runAgentsCli(["worker", "mind", "provision"], env, projectDir)).exitCode).toBe(0);

  const db = client();
  expect((await readMindIndex(db, mindId))?.schema).toBe("drwn.mind-index");
  const personaPath = `/minds/${mindId}/persona.md`;
  const seeded = await db.get(personaPath);
  expect(seeded?.content).toContain("drwn:persona:start");
  await db.put(personaPath, seeded!.content.replace("Capture stable voice", "E2E-edited voice"));

  const synced = await runAgentsCli(["worker", "mind", "sync", "--json"], env, projectDir);
  expect(synced.exitCode).toBe(0);
  expect((JSON.parse(synced.stdout) as { skippedDrifted: string[] }).skippedDrifted).toEqual([personaPath]);
  expect((await db.get(personaPath))?.content).toContain("E2E-edited voice");

  const checkpointed = await runAgentsCli(["worker", "mind", "checkpoint", "--json"], env, projectDir);
  expect(checkpointed.exitCode).toBe(0);
  const sourcePersona = await readFile(
    join(sourceDir, "persona", "voice", "PERSONA.md"),
    "utf8",
  );
  expect(sourcePersona).toContain("E2E-edited voice");
});
