// ABOUTME: End-to-end mind lifecycle over the fake BeginningDB: provision, DB-first edit, sync drift, checkpoint.
// ABOUTME: Protects the card↔DB loop contract: DB edits survive sync and flow back into card sources for review.

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

test("mind lifecycle: provision, DB-first edit, drift-preserving sync, checkpoint into sources", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const server = startFakeBgdb();
  servers.push(server);

  const sourceDir = await createCatalogCardSource(fixture, "@me/mind");
  expect(
    (await runAgentsCli(["card", "source", "add-persona", "@me/mind", "voice", "--visibility", "internal"], envFor(fixture)))
      .exitCode,
  ).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/mind"], envFor(fixture))).exitCode).toBe(0);

  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["add", "@me/mind@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const env = { ...envFor(fixture), BGDB_BASE_URL: server.baseUrl, BGDB_TOKEN: server.token, BGDB_PATH_PREFIX: "minds/mind_x" };
  expect((await runAgentsCli(["worker", "mind", "provision"], env, projectDir)).exitCode).toBe(0);

  const seeded = server.readFile("/minds/mind_x/persona.md")!;
  await fetch(new URL("/v1/fs/minds/mind_x/persona.md", server.baseUrl), {
    method: "PUT",
    headers: { authorization: `Bearer ${server.token}` },
    body: seeded.replace("Capture stable voice", "Speak with dry wit; capture stable voice"),
  });

  const synced = await runAgentsCli(["worker", "mind", "sync", "--json"], env, projectDir);
  expect(synced.exitCode).toBe(0);
  const syncResult = JSON.parse(synced.stdout) as { skippedDrifted: string[]; updated: string[] };
  expect(syncResult.skippedDrifted).toEqual(["/minds/mind_x/persona.md"]);
  expect(server.readFile("/minds/mind_x/persona.md")).toContain("dry wit");

  const diffed = await runAgentsCli(["worker", "mind", "diff", "--json"], env, projectDir);
  expect(diffed.exitCode).toBe(0);
  const diff = JSON.parse(diffed.stdout) as { entries: Array<{ entry: string; state: string }>; outsideFences: string[] };
  expect(diff.entries.find((entry) => entry.entry === "voice")?.state).toBe("changed");
  expect(diff.outsideFences).toEqual([]);

  const checkpointed = await runAgentsCli(["worker", "mind", "checkpoint", "--json"], env, projectDir);
  expect(checkpointed.exitCode).toBe(0);
  const checkpoint = JSON.parse(checkpointed.stdout) as { written: string[] };
  expect(checkpoint.written).toHaveLength(1);

  const sourcePersona = await readFile(
    join(sourceDir, "persona", "voice", "PERSONA.md"),
    "utf8",
  );
  expect(sourcePersona).toContain("dry wit");

  const idempotent = await runAgentsCli(["worker", "mind", "sync", "--json"], env, projectDir);
  const idempotentResult = JSON.parse(idempotent.stdout) as { updated: string[]; created: string[] };
  expect(idempotentResult.updated).toEqual([]);
  expect(idempotentResult.created).toEqual([]);
});
