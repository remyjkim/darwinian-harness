// ABOUTME: Reads and writes drwn materialization records for drift detection and safe cleanup.
// ABOUTME: Records only drwn-owned paths so cleanup never guesses ownership.

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DrwnError } from "./errors";

export interface WriteRecord {
  schema: "drwn.write-record";
  schemaVersion: 1;
  scope: WriteRecordScope;
  lastWriteAt: string;
  lastWriteHarnessVersion: string;
  managedPaths: ManagedPath[];
}

export type WriteRecordScope = "project" | "machine";
export type ProjectionSurface = "worker" | "mcp" | "skill" | "hook" | "instructions";
export type ProjectionTarget = "claude" | "codex" | "cursor" | "opencode" | "mastra";

export interface ManagedOwnership {
  surface: ProjectionSurface;
  target?: ProjectionTarget;
}

export type ManagedPathData =
  | { path: string; kind: "symlink"; linkTarget: string }
  | { path: string; kind: "managed-fields"; fields: string[]; fieldHashes: Record<string, string> }
  | { path: string; kind: "generated-symlink"; generatedPath: string }
  | { path: string; kind: "managed-content"; contentHash: string }
  | { path: string; kind: "managed-directory"; contentHash: string };

export type ManagedPath = ManagedPathData & ManagedOwnership;

export function ownManagedPath<T extends ManagedPathData>(entry: T, ownershipValue: ManagedOwnership): T & ManagedOwnership {
  return { ...entry, ...ownershipValue };
}

const safeRelativePath = z.string().min(1).superRefine((value, context) => {
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    context.addIssue({ code: "custom", message: "path must be a normalized contained POSIX relative path" });
  }
});
const hash = z.string().regex(/^sha256-[a-f0-9]{64}$/);
const ownership = {
  surface: z.enum(["worker", "mcp", "skill", "hook", "instructions"]),
  target: z.enum(["claude", "codex", "cursor", "opencode", "mastra"]).optional(),
};
const managedPathSchema = z.discriminatedUnion("kind", [
  z.object({ path: safeRelativePath, kind: z.literal("symlink"), linkTarget: z.string().min(1), ...ownership }).strict(),
  z.object({
    path: safeRelativePath,
    kind: z.literal("managed-fields"),
    fields: z.array(z.string().min(1)),
    fieldHashes: z.record(z.string(), hash),
    ...ownership,
  }).strict(),
  z.object({ path: safeRelativePath, kind: z.literal("generated-symlink"), generatedPath: z.string().min(1), ...ownership }).strict(),
  z.object({ path: safeRelativePath, kind: z.literal("managed-content"), contentHash: hash, ...ownership }).strict(),
  z.object({ path: safeRelativePath, kind: z.literal("managed-directory"), contentHash: hash, ...ownership }).strict(),
]).superRefine((entry, context) => {
  const valid = entry.surface === "worker"
    ? entry.target === undefined
    : entry.surface === "instructions"
      ? entry.target === undefined
    : entry.surface === "mcp"
      ? entry.target === "claude" || entry.target === "codex" || entry.target === "cursor" || entry.target === "opencode"
      : entry.surface === "skill"
        ? entry.target === "claude" || entry.target === "codex"
        : entry.target === "claude" || entry.target === "codex" || entry.target === "cursor" || entry.target === "opencode" || entry.target === "mastra";
  if (!valid) {
    context.addIssue({ code: "custom", message: `invalid ${entry.surface} target ownership` });
  }
  if (entry.kind === "managed-fields") {
    const fields = new Set(entry.fields);
    if (fields.size !== entry.fields.length || Object.keys(entry.fieldHashes).some((field) => !fields.has(field))) {
      context.addIssue({ code: "custom", message: "managed field names and hashes must be unique and exact" });
    }
    if (entry.fields.some((field) => !Object.hasOwn(entry.fieldHashes, field))) {
      context.addIssue({ code: "custom", message: "every managed field must have a hash" });
    }
  }
});
const writeRecordSchema = z.object({
  schema: z.literal("drwn.write-record"),
  schemaVersion: z.literal(1),
  scope: z.enum(["project", "machine"]),
  lastWriteAt: z.string().datetime(),
  lastWriteHarnessVersion: z.string().min(1),
  managedPaths: z.array(managedPathSchema),
}).strict().superRefine((record, context) => {
  const paths = new Set<string>();
  for (const [index, entry] of record.managedPaths.entries()) {
    if (paths.has(entry.path)) {
      context.addIssue({ code: "custom", path: ["managedPaths", index, "path"], message: `duplicate managed path: ${entry.path}` });
    }
    paths.add(entry.path);
    if (record.scope === "machine" && entry.surface !== "mcp" && entry.surface !== "skill") {
      context.addIssue({ code: "custom", path: ["managedPaths", index, "surface"], message: "machine records permit only skill and MCP ownership" });
    }
  }
});

function invalidWriteRecord(path: string, message: string, cause?: unknown) {
  return new DrwnError(
    "WRITE_RECORD_INVALID",
    `${message} at ${path}`,
    ["Remove the unsupported write record and run a full drwn write to create the first supported projection record."],
    cause,
  );
}

function parseWriteRecord(value: unknown, path: string, expectedScope?: WriteRecordScope): WriteRecord {
  if (value && typeof value === "object" && "writeRecordVersion" in value) {
    throw invalidWriteRecord(path, "Unsupported write record");
  }
  const parsed = writeRecordSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`)
      .join("; ");
    throw invalidWriteRecord(path, `Invalid write record (${details})`, parsed.error);
  }
  if (expectedScope && parsed.data.scope !== expectedScope) {
    throw invalidWriteRecord(path, `Invalid write record scope: expected ${expectedScope}, received ${parsed.data.scope}`);
  }
  return parsed.data as WriteRecord;
}

export function hashManagedContent(content: string | Uint8Array) {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

export function dedupeManagedPathsByPath(paths: ManagedPath[]) {
  const map = new Map<string, ManagedPath>();
  for (const entry of paths) {
    map.set(entry.path, entry);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function hashManagedDirectory(dirPath: string) {
  const records: Array<{ path: string; kind: "file" | "dir" | "symlink"; hash?: string; target?: string }> = [];

  function walk(absPath: string, relPath: string) {
    const stats = lstatSync(absPath);
    if (stats.isSymbolicLink()) {
      records.push({ path: relPath, kind: "symlink", target: readlinkSync(absPath) });
      return;
    }
    if (stats.isDirectory()) {
      records.push({ path: relPath, kind: "dir" });
      for (const entry of readdirSync(absPath).sort((a, b) => a.localeCompare(b))) {
        walk(join(absPath, entry), relPath ? `${relPath}/${entry}` : entry);
      }
      return;
    }
    if (stats.isFile()) {
      records.push({ path: relPath, kind: "file", hash: hashManagedContent(readFileSync(absPath)) });
    }
  }

  walk(dirPath, "");
  return hashManagedContent(JSON.stringify(records));
}

export function resolveProjectWriteRecordPath(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "write-record.json");
}

export function loadWriteRecord(recordPath: string, expectedScope?: WriteRecordScope): WriteRecord | null {
  if (!existsSync(recordPath)) {
    return null;
  }
  try {
    return parseWriteRecord(JSON.parse(readFileSync(recordPath, "utf8")), recordPath, expectedScope);
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw invalidWriteRecord(recordPath, "Invalid JSON", error);
  }
}

function bestEffortFsync(fd: number) {
  // Durability optimization only; some platforms (notably Windows) reject fsync on
  // certain handles. Correctness comes from the atomic rename, not the fsync.
  try {
    fsyncSync(fd);
  } catch {
    // ignore
  }
}

export function saveWriteRecord(recordPath: string, record: WriteRecord) {
  const validated = parseWriteRecord(record, recordPath, record.scope);
  mkdirSync(dirname(recordPath), { recursive: true });
  const tmp = `${recordPath}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(validated, null, 2)}\n`);
    bestEffortFsync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, recordPath);
  // Directory fsync is unsupported on Windows (opening a directory handle fails outright).
  try {
    const dirFd = openSync(dirname(recordPath), "r");
    try {
      bestEffortFsync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    // ignore
  }
}

export function diffWriteRecord(previous: WriteRecord | null, desired: ManagedPath[]) {
  const previousMap = new Map((previous?.managedPaths ?? []).map((entry) => [entry.path, entry]));
  const desiredMap = new Map(desired.map((entry) => [entry.path, entry]));
  const toRemove: ManagedPath[] = [];
  const toAdd: ManagedPath[] = [];
  const toVerify: ManagedPath[] = [];

  for (const [path, previousEntry] of previousMap) {
    const desiredEntry = desiredMap.get(path);
    if (!desiredEntry) {
      toRemove.push(previousEntry);
    } else if (previousEntry.kind === "managed-fields" && desiredEntry.kind === "managed-fields") {
      const previousFields = new Set(previousEntry.fields);
      const desiredFields = new Set(desiredEntry.fields);
      const removedFields = previousEntry.fields.filter((field) => !desiredFields.has(field));
      const addedFields = desiredEntry.fields.filter((field) => !previousFields.has(field));
      const retainedFields = previousEntry.fields.filter((field) => desiredFields.has(field));
      if (removedFields.length > 0) {
        toRemove.push(managedFieldsSubset(previousEntry, removedFields));
      }
      if (addedFields.length > 0) {
        toAdd.push(managedFieldsSubset(desiredEntry, addedFields));
      }
      if (retainedFields.length > 0) {
        toVerify.push(managedFieldsSubset(previousEntry, retainedFields));
      }
    } else if (
      previousEntry.kind !== desiredEntry.kind ||
      previousEntry.surface !== desiredEntry.surface ||
      previousEntry.target !== desiredEntry.target
    ) {
      toAdd.push(desiredEntry);
      toVerify.push(previousEntry);
    } else {
      toVerify.push(previousEntry);
    }
  }

  for (const [path, desiredEntry] of desiredMap) {
    if (!previousMap.has(path)) {
      toAdd.push(desiredEntry);
    }
  }

  return { toRemove, toAdd, toVerify };
}

function managedFieldsSubset(
  entry: Extract<ManagedPath, { kind: "managed-fields" }>,
  fields: string[],
): Extract<ManagedPath, { kind: "managed-fields" }> {
  return {
    path: entry.path,
    kind: "managed-fields",
    surface: entry.surface,
    ...(entry.target ? { target: entry.target } : {}),
    fields,
    fieldHashes: Object.fromEntries(fields.map((field) => [field, entry.fieldHashes[field]!])),
  };
}
