// ABOUTME: Pins the first supported namespaced projection ownership record.
// ABOUTME: Rejects prototype records and invalid surface or target ownership without migration.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DrwnError } from "../cli/core/errors";
import { loadWriteRecord, saveWriteRecord } from "../cli/core/write-record";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function validRecord() {
  return {
    schema: "drwn.write-record" as const,
    schemaVersion: 1 as const,
    scope: "project" as const,
    lastWriteAt: "2026-07-13T00:00:00.000Z",
    lastWriteHarnessVersion: "0.9.0",
    managedPaths: [
      {
        path: ".mcp.json",
        kind: "managed-content" as const,
        surface: "mcp" as const,
        target: "claude" as const,
        contentHash: `sha256-${"a".repeat(64)}`,
      },
      {
        path: ".agents/drwn/generated/workers.json",
        kind: "managed-content" as const,
        surface: "worker" as const,
        contentHash: `sha256-${"b".repeat(64)}`,
      },
    ],
  };
}

function expectInvalid(operation: () => unknown, message: string) {
  try {
    operation();
    throw new Error("expected invalid write record");
  } catch (error) {
    expect(error).toBeInstanceOf(DrwnError);
    expect((error as DrwnError).code).toBe("WRITE_RECORD_INVALID");
    expect((error as Error).message).toContain(message);
  }
}

describe("drwn.write-record V1", () => {
  test("round-trips the strict namespaced project record", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");

    saveWriteRecord(recordPath, validRecord());

    expect(loadWriteRecord(recordPath, "project")).toEqual(validRecord());
    expect(JSON.parse(await readFile(recordPath, "utf8"))).toEqual(validRecord());
  });

  test("rejects the unnamespaced prototype without rewriting it", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");
    const prototype = `${JSON.stringify({
      writeRecordVersion: 1,
      lastWriteAt: "2026-07-13T00:00:00.000Z",
      lastWriteHarnessVersion: "0.8.0",
      managedPaths: [],
    }, null, 2)}\n`;
    await writeFile(recordPath, prototype);

    expectInvalid(() => loadWriteRecord(recordPath, "project"), "Unsupported write record");
    expect(await readFile(recordPath, "utf8")).toBe(prototype);
  });

  test("distinguishes malformed existing records from missing records", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");

    expect(loadWriteRecord(recordPath, "project")).toBeNull();
    await writeFile(recordPath, "{not-json");
    expectInvalid(() => loadWriteRecord(recordPath, "project"), "Invalid JSON");
  });

  test("rejects scope mismatch, unknown keys, duplicate paths, and unsafe paths", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");

    const cases: Array<[unknown, string]> = [
      [{ ...validRecord(), scope: "machine", managedPaths: [validRecord().managedPaths[0]] }, "scope"],
      [{ ...validRecord(), extra: true }, "extra"],
      [{ ...validRecord(), managedPaths: [validRecord().managedPaths[0], validRecord().managedPaths[0]] }, "duplicate"],
      [{ ...validRecord(), managedPaths: [{ ...validRecord().managedPaths[0], path: "../outside" }] }, "path"],
    ];

    for (const [value, message] of cases) {
      await writeFile(recordPath, `${JSON.stringify(value)}\n`);
      expectInvalid(() => loadWriteRecord(recordPath, "project"), message);
    }
  });

  test("rejects invalid surface and target combinations", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");
    const base = validRecord().managedPaths[0]!;
    const cases: unknown[] = [
      { ...base, surface: "mcp", target: undefined },
      { ...base, surface: "skill", target: "cursor" },
      { ...base, surface: "worker", target: "claude" },
      { ...base, surface: "vendor" },
    ];

    for (const entry of cases) {
      await writeFile(recordPath, `${JSON.stringify({ ...validRecord(), managedPaths: [entry] })}\n`);
      expectInvalid(() => loadWriteRecord(recordPath, "project"), "managedPaths");
    }
  });

  test("accepts cursor hook ownership", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");
    const base = validRecord().managedPaths[0]!;
    await writeFile(
      recordPath,
      `${JSON.stringify({ ...validRecord(), managedPaths: [{ ...base, surface: "hook", target: "cursor" }] })}\n`,
    );
    expect(loadWriteRecord(recordPath, "project")?.managedPaths[0]).toMatchObject({ surface: "hook", target: "cursor" });
  });

  test("accepts target-agnostic project instructions and rejects them at machine scope", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");
    const instructionEntry = {
      path: "AGENTS.md",
      kind: "managed-fields" as const,
      surface: "instructions" as const,
      fields: ["drwn:instructions"],
      fieldHashes: {
        "drwn:instructions": `sha256-${"d".repeat(64)}`,
      },
    };
    const project = {
      ...validRecord(),
      managedPaths: [instructionEntry],
    };

    await writeFile(recordPath, `${JSON.stringify(project)}\n`);
    expect(loadWriteRecord(recordPath, "project")?.managedPaths[0]).toEqual(instructionEntry);

    await writeFile(
      recordPath,
      `${JSON.stringify({ ...project, scope: "machine" })}\n`,
    );
    expectInvalid(() => loadWriteRecord(recordPath, "machine"), "machine");

    await writeFile(
      recordPath,
      `${JSON.stringify({
        ...project,
        managedPaths: [{ ...instructionEntry, target: "claude" }],
      })}\n`,
    );
    expectInvalid(() => loadWriteRecord(recordPath, "project"), "instructions");
  });

  test("machine records permit only machine skill and MCP ownership", async () => {
    const root = await createTempRoot("write-record-v1-");
    tempRoots.push(root);
    const recordPath = join(root, "write-record.json");
    const machine = {
      ...validRecord(),
      scope: "machine" as const,
      managedPaths: [{
        path: ".codex/skills/operator",
        kind: "managed-directory" as const,
        surface: "skill" as const,
        target: "codex" as const,
        contentHash: `sha256-${"c".repeat(64)}`,
      }],
    };

    await writeFile(recordPath, `${JSON.stringify(machine)}\n`);
    expect(loadWriteRecord(recordPath, "machine")).toEqual(machine);

    await writeFile(recordPath, `${JSON.stringify({
      ...machine,
      managedPaths: [{ ...machine.managedPaths[0], surface: "worker", target: undefined }],
    })}\n`);
    expectInvalid(() => loadWriteRecord(recordPath, "machine"), "machine");
  });
});
