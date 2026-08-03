// ABOUTME: Verifies `drwn worker mind` verbs (provision, status, doctor, pool retire) against the fake BeginningDB.
// ABOUTME: Protects provision idempotency, drift reporting, GC diagnostics, and the human-only retirement gate.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createCatalogCardSource, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

const tempRoots: string[] = [];
let servers: FakeBgdb[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop();
  }
  await cleanupTempRoots(tempRoots);
});

async function scaffoldMindProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const server = startFakeBgdb();
  servers.push(server);

  const sourceDir = await createCatalogCardSource(fixture, "@me/mind");
  expect(
    (await runAgentsCli(["card", "source", "add-persona", "@me/mind", "voice", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  expect(
    (await runAgentsCli(["card", "source", "add-belief", "@me/mind", "quality", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/mind"], envFor(fixture))).exitCode).toBe(0);

  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  const manifest = JSON.parse(
    await readFile(join(sourceDir, "card.json"), "utf8"),
  ) as { version: string };
  expect((await runAgentsCli(["add", `@me/mind@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);

  const env = {
    ...envFor(fixture),
    BGDB_BASE_URL: server.baseUrl,
    BGDB_TOKEN: server.token,
    BGDB_PATH_PREFIX: "minds/mind_t1",
  };
  return { fixture, server, projectDir, env };
}

async function scaffoldCapabilityFreeProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const server = startFakeBgdb();
  servers.push(server);
  await createCatalogCardSource(fixture, "@me/tools");
  expect((await runAgentsCli(["card", "publish", "@me/tools"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["add", "@me/tools@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  return {
    server,
    projectDir,
    env: {
      ...envFor(fixture),
      BGDB_BASE_URL: server.baseUrl,
      BGDB_TOKEN: server.token,
      BGDB_PATH_PREFIX: "minds/mind_none",
    },
  };
}

test("provision seeds the mind, is idempotent, and status reports drift states", async () => {
  const { server, projectDir, env } = await scaffoldMindProject();

  const provisioned = await runAgentsCli(["worker", "mind", "provision", "--json"], env, projectDir);
  expect(provisioned.exitCode).toBe(0);
  const first = JSON.parse(provisioned.stdout) as { mindId: string; created: string[]; alreadyProvisioned: boolean };
  expect(first.mindId).toBe("mind_t1");
  expect(first.alreadyProvisioned).toBe(false);
  expect(first.created).toContain("/minds/mind_t1/persona.md");
  expect(server.readFile("/minds/mind_t1/persona.md")).toContain("drwn:persona:start");

  const again = await runAgentsCli(["worker", "mind", "provision", "--json"], env, projectDir);
  expect(again.exitCode).toBe(0);
  expect((JSON.parse(again.stdout) as { alreadyProvisioned: boolean }).alreadyProvisioned).toBe(true);

  const clean = await runAgentsCli(["worker", "mind", "status", "--json"], env, projectDir);
  expect(clean.exitCode).toBe(0);
  const cleanStatus = JSON.parse(clean.stdout) as {
    worker?: { card: string };
    cards?: Array<{ card: string }>;
    sources?: unknown;
    drift: Array<{ path: string; state: string }>;
  };
  expect(cleanStatus.worker).toEqual(expect.objectContaining({ card: "@me/mind" }));
  expect(cleanStatus.cards?.map((card) => card.card)).toEqual(["@me/mind"]);
  expect(cleanStatus).not.toHaveProperty("sources");
  expect(cleanStatus.drift.every((row) => row.state === "in-sync")).toBe(true);

  const persona = server.readFile("/minds/mind_t1/persona.md")!;
  await fetch(new URL("/v1/fs/minds/mind_t1/persona.md", server.baseUrl), {
    method: "PUT",
    headers: { authorization: `Bearer ${server.token}` },
    body: persona.replace("voice", "voice-edited"),
  });

  const drifted = await runAgentsCli(["worker", "mind", "status", "--json"], env, projectDir);
  const driftedStatus = JSON.parse(drifted.stdout) as { drift: Array<{ path: string; state: string }> };
  expect(driftedStatus.drift.find((row) => row.path.endsWith("persona.md"))?.state).toBe("db-edited");
});

test("provision requires a mind id from flag or path prefix", async () => {
  const { projectDir, env } = await scaffoldMindProject();
  const { BGDB_PATH_PREFIX: _omitted, ...withoutPrefix } = env;

  const missing = await runAgentsCli(["worker", "mind", "provision"], withoutPrefix, projectDir);
  expect(missing.exitCode).not.toBe(0);
  expect(missing.stderr).toContain("mind id");

  const flagged = await runAgentsCli(["worker", "mind", "provision", "--mind-id", "mind_flag", "--json"], withoutPrefix, projectDir);
  expect(flagged.exitCode).toBe(0);
  expect((JSON.parse(flagged.stdout) as { mindId: string }).mindId).toBe("mind_flag");
});

test("closure-dependent commands reject a capability-free selected Worker", async () => {
  const { server, projectDir, env } = await scaffoldCapabilityFreeProject();
  for (const args of [
    ["worker", "mind", "provision", "--json"],
    ["worker", "mind", "status", "--json"],
    ["worker", "mind", "doctor", "--json"],
    ["worker", "mind", "sync", "--json"],
    ["worker", "mind", "diff", "--json"],
    ["worker", "mind", "checkpoint", "--json"],
  ]) {
    const result = await runAgentsCli(args, env, projectDir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("does not declare optional Mind capability");
  }
  expect(server.readFile("/minds/mind_none/mind.json")).toBeNull();
});

test("doctor reports unreachable bindings as warnings and finds unplaced pool entries", async () => {
  const { server, projectDir, env } = await scaffoldMindProject();
  expect((await runAgentsCli(["worker", "mind", "provision"], env, projectDir)).exitCode).toBe(0);

  await fetch(new URL("/v1/fs/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl", server.baseUrl), {
    method: "PUT",
    headers: { authorization: `Bearer ${server.token}` },
    body: '{"ts":"2026-07-07T14:03:00Z","type":"note","content":"orphan"}\n',
  });

  const doctor = await runAgentsCli(["worker", "mind", "doctor", "--json"], env, projectDir);
  expect(doctor.exitCode).toBe(0);
  const report = JSON.parse(doctor.stdout) as { ok: boolean; issues: Array<{ code: string }> };
  expect(report.issues.map((issue) => issue.code)).toContain("unplaced_pool_entry");

  const unreachableEnv = { ...env, BGDB_BASE_URL: "http://127.0.0.1:1" };
  const unreachable = await runAgentsCli(["worker", "mind", "doctor", "--json"], unreachableEnv, projectDir);
  expect(unreachable.exitCode).toBe(0);
  const unreachableReport = JSON.parse(unreachable.stdout) as { issues: Array<{ code: string; severity: string }> };
  expect(unreachableReport.issues.find((issue) => issue.code === "mind_db_unreachable")?.severity).toBe("warning");
});

test("pool retire refuses without --yes and deletes everywhere with it", async () => {
  const { server, projectDir, env } = await scaffoldMindProject();
  expect((await runAgentsCli(["worker", "mind", "provision"], env, projectDir)).exitCode).toBe(0);
  const poolPath = "/pool/insights/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.md";
  await fetch(new URL(`/v1/fs${poolPath}`, server.baseUrl), {
    method: "PUT",
    headers: { authorization: `Bearer ${server.token}` },
    body: "retire me\n",
  });

  const refused = await runAgentsCli(["worker", "mind", "pool", "retire", poolPath], env, projectDir);
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stderr).toContain("--yes");
  expect(server.readFile(poolPath)).toBe("retire me\n");

  const retired = await runAgentsCli(["worker", "mind", "pool", "retire", poolPath, "--yes"], env, projectDir);
  expect(retired.exitCode).toBe(0);
  expect(server.readFile(poolPath)).toBeNull();
});

test("pool retire rejects noncanonical paths before contacting BeginningDB", async () => {
  const { server, projectDir, env } = await scaffoldMindProject();
  for (const path of [
    "/pool/l5/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl",
    "/pool/raw_data/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl",
    "/pool/observations/not-a-date/file.jsonl",
    "/minds/mind_t1/memory/observations/by-date/file.jsonl",
  ]) {
    const before = server.state.requests.length;
    const result = await runAgentsCli(["worker", "mind", "pool", "retire", path, "--yes"], env, projectDir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("canonical semantic pool file");
    expect(server.state.requests).toHaveLength(before);
  }
});
