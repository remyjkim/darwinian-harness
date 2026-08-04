// ABOUTME: Verifies trustedSources policy through CLI command wiring.
// ABOUTME: Ensures strict mode blocks before resolution unless explicitly overridden.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function writeStrictMachinePolicy(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
  await writeFile(
    join(fixture.agentsDir, "drwn", "machine.json"),
    `${JSON.stringify({
      schema: "drwn.machine",
      schemaVersion: 2,
      policy: { trustedSources: { strict: true, gitOwners: ["curation-labs"] } },
      capabilities: { activeWorker: null, workerLock: null },
    }, null, 2)}\n`,
  );
}

async function writeFileCardFixture(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const cardDir = join(fixture.root, "file-card");
  await mkdir(cardDir, { recursive: true });
  await writeFile(
    join(cardDir, "card.json"),
    `${JSON.stringify({ name: "@local/file-card", version: "1.0.0" }, null, 2)}\n`,
  );
  return cardDir;
}

test("card show rejects untrusted git owner in strict mode before cloning", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeStrictMachinePolicy(fixture);

  const result = await runAgentsCli(["card", "show", "github:other/card@1.0.0"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("CARD_SOURCE_UNTRUSTED");
  expect(result.stderr).not.toContain("git clone");
});

test("card validate override allows a strict-mode file ref", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeStrictMachinePolicy(fixture);
  const cardDir = await writeFileCardFixture(fixture);

  const blocked = await runAgentsCli(["card", "validate", `file:${cardDir}`, "--json"], envFor(fixture));
  expect(blocked.exitCode).toBe(1);
  expect(blocked.stdout).toContain("CARD_SOURCE_UNTRUSTED");

  const allowed = await runAgentsCli(
    ["card", "validate", `file:${cardDir}`, "--json", "--allow-untrusted-source"],
    envFor(fixture),
  );
  expect(allowed.exitCode).toBe(0);
  expect(allowed.stderr).toContain("--allow-untrusted-source used");
  expect(JSON.parse(allowed.stdout).ok).toBe(true);
});
