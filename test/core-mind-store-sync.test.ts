// ABOUTME: Verifies rebase (sync), diff, and checkpoint engines: CAS updates, DB-wins conflicts, fence round-trips.
// ABOUTME: Protects the card↔DB loop: card updates rebase seeds; live edits survive and checkpoint back into sources.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMindDbClient } from "../cli/core/mind-store/client";
import { readMindIndex } from "../cli/core/mind-store/ledger";
import { seedMind, type CardMindContent } from "../cli/core/mind-store/seed";
import { checkpointMind, diffMind, syncMind } from "../cli/core/mind-store/rebase";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

const tempRoots: string[] = [];
let servers: FakeBgdb[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop();
  }
  await cleanupTempRoots(tempRoots);
});

function start() {
  const server = startFakeBgdb();
  servers.push(server);
  return { server, client: createMindDbClient({ baseUrl: server.baseUrl, token: server.token }) };
}

function cardsAt(version: string, personaText: string, beliefText: string): CardMindContent[] {
  return [
    {
      name: "@me/mind",
      version,
      integrity: `sha256-${version}`,
      declaresMind: true,
      persona: [{ entry: "voice", content: personaText }],
      beliefs: [{ entry: "quality", content: beliefText }],
      memory: { observations: { format: "jsonl" } },
    },
  ];
}

const v1 = cardsAt("1.0.0", "# voice\n\nPlain.\n", "# quality\n\nTest first.\n");
const v2 = cardsAt("2.0.0", "# voice\n\nPlain and warm.\n", "# quality\n\nTest first, always.\n");

test("syncMind rebases clean seeds onto a new card version and refreshes the ledger", async () => {
  const { server, client } = start();
  await seedMind(client, "m1", v1);

  const result = await syncMind(client, "m1", v2, {});

  expect(result.updated.sort()).toEqual([
    "/minds/m1/beliefs/@me/mind/quality/BELIEF.md",
    "/minds/m1/persona.md",
  ]);
  expect(result.skippedDrifted).toEqual([]);
  expect(server.readFile("/minds/m1/persona.md")).toContain("Plain and warm.");
  const index = await readMindIndex(client, "m1");
  expect(index?.worker).toEqual({ card: "@me/mind", version: "2.0.0", integrity: "sha256-2.0.0" });
  expect(index?.cards).toEqual([{ card: "@me/mind", version: "2.0.0", integrity: "sha256-2.0.0" }]);
});

test("syncMind preserves DB edits (skips with drift) unless forced", async () => {
  const { server, client } = start();
  await seedMind(client, "m1", v1);
  await client.put("/minds/m1/beliefs/@me/mind/quality/BELIEF.md", "# quality\n\nEdited live.\n");

  const result = await syncMind(client, "m1", v2, {});
  expect(result.skippedDrifted).toEqual(["/minds/m1/beliefs/@me/mind/quality/BELIEF.md"]);
  expect(server.readFile("/minds/m1/beliefs/@me/mind/quality/BELIEF.md")).toBe("# quality\n\nEdited live.\n");

  const forced = await syncMind(client, "m1", v2, { force: true });
  expect(forced.updated).toContain("/minds/m1/beliefs/@me/mind/quality/BELIEF.md");
  expect(server.readFile("/minds/m1/beliefs/@me/mind/quality/BELIEF.md")).toBe("# quality\n\nTest first, always.\n");
});

test("syncMind dry-run reports the plan without writing, and a clean re-sync is a no-op", async () => {
  const { server, client } = start();
  await seedMind(client, "m1", v1);
  const before = server.readFile("/minds/m1/persona.md");

  const dryRun = await syncMind(client, "m1", v2, { dryRun: true });
  expect(dryRun.updated.length).toBe(2);
  expect(server.readFile("/minds/m1/persona.md")).toBe(before);

  await syncMind(client, "m1", v2, {});
  const idempotent = await syncMind(client, "m1", v2, {});
  expect(idempotent.updated).toEqual([]);
  expect(idempotent.skippedDrifted).toEqual([]);
});

test("diffMind reports per-entry changes and outside-fence content", async () => {
  const { server, client } = start();
  await seedMind(client, "m1", v1);
  const persona = server.readFile("/minds/m1/persona.md")!;
  await client.put("/minds/m1/persona.md", `${persona.replace("Plain.", "Plain, edited.")}\nStray note.\n`);

  const diff = await diffMind(client, "m1", v1);

  const personaRow = diff.entries.find((row) => row.section === "persona" && row.entry === "voice");
  expect(personaRow?.state).toBe("changed");
  expect(personaRow?.dbContent).toContain("Plain, edited.");
  expect(diff.outsideFences.join("\n")).toContain("Stray note.");
  expect(diff.entries.find((row) => row.section === "beliefs")?.state).toBe("same");
});

test("checkpointMind writes DB edits back into card sources and refuses outside-fence content", async () => {
  const { server, client } = start();
  await seedMind(client, "m1", v1);
  const root = await createTempRoot("mind-checkpoint-");
  tempRoots.push(root);
  const sourceDir = join(root, "sources", "@me", "mind");
  await mkdir(join(sourceDir, "persona", "voice"), { recursive: true });
  await mkdir(join(sourceDir, "beliefs", "quality"), { recursive: true });

  const persona = server.readFile("/minds/m1/persona.md")!;
  await client.put("/minds/m1/persona.md", persona.replace("Plain.", "Plain, checkpointed."));
  await client.put("/minds/m1/beliefs/@me/mind/quality/BELIEF.md", "# quality\n\nCheckpoint me.\n");

  const result = await checkpointMind(client, "m1", v1, { sourceDirs: { "@me/mind": sourceDir } });

  expect(result.written.sort()).toEqual([
    join(sourceDir, "beliefs", "quality", "BELIEF.md"),
    join(sourceDir, "persona", "voice", "PERSONA.md"),
  ]);
  expect(await readFile(join(sourceDir, "persona", "voice", "PERSONA.md"), "utf8")).toContain("Plain, checkpointed.");
  expect(await readFile(join(sourceDir, "beliefs", "quality", "BELIEF.md"), "utf8")).toBe("# quality\n\nCheckpoint me.\n");

  const edited = server.readFile("/minds/m1/persona.md")!;
  await client.put("/minds/m1/persona.md", `${edited}\nUnattributed prose.\n`);
  await expect(checkpointMind(client, "m1", v1, { sourceDirs: { "@me/mind": sourceDir } })).rejects.toThrow(
    /outside/i,
  );
});

test("checkpointMind preserves MIND_CHECKPOINT_NO_SOURCE when changed content has no authoring source", async () => {
  const { server, client } = start();
  await seedMind(client, "m1", v1);
  const persona = server.readFile("/minds/m1/persona.md")!;
  await client.put("/minds/m1/persona.md", persona.replace("Plain.", "Plain, changed."));

  await expect(checkpointMind(client, "m1", v1, { sourceDirs: {} })).rejects.toMatchObject({
    code: "MIND_CHECKPOINT_NO_SOURCE",
  });
});
