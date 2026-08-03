// ABOUTME: Writes drwn-managed files with backups and dry-run change reporting.
// ABOUTME: Shared by MCP sync and hook materialization.

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureParentDir } from "./fs";
import type { SyncResult } from "./types";

function nextBackupPath(pathValue: string) {
  let candidate = `${pathValue}.bak`;
  let index = 1;
  while (existsSync(candidate)) {
    candidate = `${pathValue}.bak.${index}`;
    index += 1;
  }
  return candidate;
}

export function backupExistingPath(pathValue: string, dryRun: boolean, result: SyncResult) {
  const backupPath = nextBackupPath(pathValue);
  result.changes.push(`backup ${pathValue} -> ${backupPath}`);
  if (!dryRun) {
    renameSync(pathValue, backupPath);
  }
}

function bestEffortFsync(fd: number) {
  // fsync is a durability optimization, not a correctness requirement; some platforms
  // (notably Windows) reject fsync on certain handles. The atomic rename is what matters.
  try {
    fsyncSync(fd);
  } catch {
    // ignore: best-effort durability only
  }
}

function atomicWriteFile(pathValue: string, content: string | Uint8Array) {
  const tmpPath = `${pathValue}.tmp`;
  const fd = openSync(tmpPath, "w");
  try {
    writeFileSync(fd, content);
    bestEffortFsync(fd);
  } finally {
    closeSync(fd);
  }

  renameSync(tmpPath, pathValue);
  // Directory fsync is unsupported on Windows (opening a directory handle fails outright).
  try {
    const dirFd = openSync(dirname(pathValue), "r");
    try {
      bestEffortFsync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    // ignore: platforms without directory fsync
  }
}

export function writeManagedFile(pathValue: string, nextContent: string, dryRun: boolean, result: SyncResult) {
  const exists = existsSync(pathValue);
  const currentContent = exists ? readFileSync(pathValue, "utf8") : undefined;

  if (currentContent === nextContent) {
    return;
  }

  ensureParentDir(pathValue, dryRun);
  if (exists) {
    backupExistingPath(pathValue, dryRun, result);
  }
  result.changes.push(`write ${pathValue}`);
  if (!dryRun) {
    atomicWriteFile(pathValue, nextContent);
  }
}

export function writeManagedBytes(
  pathValue: string,
  nextContent: Uint8Array,
  dryRun: boolean,
  result: SyncResult,
) {
  const exists = existsSync(pathValue);
  const currentContent = exists ? readFileSync(pathValue) : undefined;
  if (currentContent && Buffer.from(currentContent).equals(Buffer.from(nextContent))) {
    return;
  }
  ensureParentDir(pathValue, dryRun);
  if (exists) backupExistingPath(pathValue, dryRun, result);
  result.changes.push(`write ${pathValue}`);
  if (!dryRun) atomicWriteFile(pathValue, nextContent);
}
