// ABOUTME: Proves a fresh CLI process can apply a complete frozen Org Worker handoff.
// ABOUTME: Covers complete-argument enforcement, plan-only modes, replay, and durable evidence.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveOrgWorkerMaterializationJournalPath,
  resolveOrgWorkerMaterializationRecordPath,
} from "../cli/core/paths";
import {
  resolveWorkerMaterializationReceiptsRoot,
} from "../cli/core/worker-materialization-receipt";
import { resolveProjectVendorTree } from "../cli/core/vendor";
import {
  cleanupTempRoots,
  envFor,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const roots: string[] = [];
afterEach(async () => {
  await cleanupTempRoots(roots);
});

async function handoffFixture() {
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const handoffRoot = join(fixture.root, "handoff");
  const projectRoot = join(fixture.root, "fresh-project");
  await Promise.all([mkdir(handoffRoot), mkdir(projectRoot)]);
  const sourceRoot = fileURLToPath(
    new URL(
      "./fixtures/org-worker-materialization-v1/",
      import.meta.url,
    ),
  );
  const snapshotPath = join(handoffRoot, "snapshot.json");
  await Promise.all([
    cp(
      join(sourceRoot, "snapshot.valid.json"),
      snapshotPath,
    ),
    cp(
      join(sourceRoot, "packet-root", "artifacts"),
      join(handoffRoot, "artifacts"),
      { recursive: true },
    ),
  ]);
  const bundlePath = fileURLToPath(
    new URL(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
      import.meta.url,
    ),
  );
  return { fixture, handoffRoot, projectRoot, snapshotPath, bundlePath };
}

function args(input: Awaited<ReturnType<typeof handoffFixture>>) {
  return [
    "install",
    "--frozen",
    "--org-worker-bundle",
    input.bundlePath,
    "--worker-artifact-snapshot",
    input.snapshotPath,
    "--operation-id",
    "operation:fresh-cli:1",
    "--json",
  ];
}

test("fresh process materializes, verifies, records, and idempotently replays one receipt", async () => {
  const input = await handoffFixture();
  const first = await runAgentsCli(
    args(input),
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );

  expect(first.exitCode).toBe(0);
  const firstPayload = JSON.parse(first.stdout);
  expect(firstPayload).toMatchObject({
    ok: true,
    cards: 1,
    applied: true,
    replayed: false,
    action: "materialize",
    outcome: "verified",
  });
  expect(
    await readFile(join(input.projectRoot, "AGENTS.md"), "utf8"),
  ).toContain("reviewed instructions");
  expect(
    existsSync(
      resolveOrgWorkerMaterializationRecordPath(input.projectRoot),
    ),
  ).toBe(true);
  expect(
    existsSync(
      resolveOrgWorkerMaterializationJournalPath(input.projectRoot),
    ),
  ).toBe(false);

  const repeated = await runAgentsCli(
    args(input),
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );
  expect(repeated.exitCode).toBe(0);
  expect(JSON.parse(repeated.stdout)).toMatchObject({
    ok: true,
    applied: true,
    replayed: true,
    receiptId: firstPayload.receiptId,
  });
  expect(
    (
      await Array.fromAsync(
        new Bun.Glob("*.json").scan(
          resolveWorkerMaterializationReceiptsRoot(
            input.projectRoot,
          ),
        ),
      )
    ).length,
  ).toBe(1);
});

test("dry-run and no-write verify a complete handoff without creating project state", async () => {
  for (const mode of ["--dry-run", "--no-write"] as const) {
    const input = await handoffFixture();
    const result = await runAgentsCli(
      [...args(input), mode],
      envFor(input.fixture),
      input.projectRoot,
      { skipWriteScopeAuto: true },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      cards: 1,
      applied: false,
      replayed: false,
      action: "materialize",
    });
    expect(existsSync(join(input.projectRoot, ".agents"))).toBe(false);
  }
});

test("complete Org Worker handoff requires frozen mode", async () => {
  const input = await handoffFixture();
  const result = await runAgentsCli(
    args(input).filter((argument) => argument !== "--frozen"),
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );

  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(
    /materialization requires --frozen/i,
  );
  expect(existsSync(join(input.projectRoot, ".agents"))).toBe(false);
});

test("fresh CLI preserves stable semantic bundle error codes", async () => {
  const input = await handoffFixture();
  const candidate = JSON.parse(
    await readFile(input.bundlePath, "utf8"),
  );
  candidate.contributionConsents[0].workerId = "worker:other";
  const invalidBundlePath = join(
    input.handoffRoot,
    "invalid-bundle.json",
  );
  await writeFile(
    invalidBundlePath,
    `${JSON.stringify(candidate, null, 2)}\n`,
  );
  const command = args(input);
  command[command.indexOf(input.bundlePath)] = invalidBundlePath;
  const result = await runAgentsCli(
    command,
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );

  expect(result.exitCode).toBe(1);
  const output = `${result.stdout}${result.stderr}`;
  expect(output).toContain("ORG_WORKER_CONSENT_INVALID");
  expect(output).not.toContain("worker:other");
  expect(
    existsSync(
      resolveOrgWorkerMaterializationRecordPath(input.projectRoot),
    ),
  ).toBe(false);
});

test("fresh reconcile process repairs record-owned vendor drift", async () => {
  const input = await handoffFixture();
  expect(
    (
      await runAgentsCli(
        args(input),
        envFor(input.fixture),
        input.projectRoot,
        { skipWriteScopeAuto: true },
      )
    ).exitCode,
  ).toBe(0);
  const lock = JSON.parse(
    await readFile(
      join(input.projectRoot, ".agents", "drwn", "card.lock"),
      "utf8",
    ),
  );
  const card = lock.cards[0];
  const instructionsPath = join(
    resolveProjectVendorTree(
      input.projectRoot,
      card.name,
      card.treeSha,
    ),
    "instructions.md",
  );
  await writeFile(instructionsPath, "drifted\n");
  const reconcileArgs = args(input).map((argument) =>
    argument === "operation:fresh-cli:1"
      ? "operation:fresh-cli:reconcile:1"
      : argument,
  );
  reconcileArgs.push("--reconcile");

  const reconciled = await runAgentsCli(
    reconcileArgs,
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );
  expect(reconciled.exitCode).toBe(0);
  expect(JSON.parse(reconciled.stdout)).toMatchObject({
    action: "reconcile",
    outcome: "verified",
  });
  expect(await readFile(instructionsPath, "utf8")).toBe(
    "reviewed instructions\n",
  );
});

test("fresh remove process retains a durable removed-state record", async () => {
  const input = await handoffFixture();
  expect(
    (
      await runAgentsCli(
        args(input),
        envFor(input.fixture),
        input.projectRoot,
        { skipWriteScopeAuto: true },
      )
    ).exitCode,
  ).toBe(0);
  const removeArgs = args(input).map((argument) =>
    argument === "operation:fresh-cli:1"
      ? "operation:fresh-cli:remove:1"
      : argument,
  );
  removeArgs.push("--remove");

  const removed = await runAgentsCli(
    removeArgs,
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );
  expect(removed.exitCode).toBe(0);
  expect(JSON.parse(removed.stdout)).toMatchObject({
    action: "remove",
    outcome: "removed",
  });
  const record = JSON.parse(
    await readFile(
      resolveOrgWorkerMaterializationRecordPath(input.projectRoot),
      "utf8",
    ),
  );
  expect(record).toMatchObject({
    materializationState: "removed",
  });

  const conflicting = await runAgentsCli(
    [...removeArgs, "--reconcile"],
    envFor(input.fixture),
    input.projectRoot,
    { skipWriteScopeAuto: true },
  );
  expect(conflicting.exitCode).not.toBe(0);
  expect(`${conflicting.stdout}\n${conflicting.stderr}`).toMatch(
    /mutually exclusive/i,
  );
});
