// ABOUTME: Reads and atomically writes owner-only files inside one concrete trusted root.
// ABOUTME: Refuses path escape, symlink traversal, oversized bytes, and partial replacement evidence.

import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DrwnError } from "./errors";
import { runProcess } from "./process";
import { syncDirectory } from "./fs";

export type PrivateFileCheckpoint = "after-temp-flush" | "before-rename" | "after-rename";

export interface PrivateFileDependencies {
  platform?: NodeJS.Platform;
  restrict?: (path: string) => Promise<void>;
  checkpoint?: (phase: PrivateFileCheckpoint) => void | Promise<void>;
}

function invalidFile(): DrwnError {
  return new DrwnError("PRIVATE_FILE_INVALID", "Private state path or bytes are invalid.");
}

function writeFailed(): DrwnError {
  return new DrwnError("PRIVATE_FILE_WRITE_FAILED", "Private state could not be written atomically.");
}

function isCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function contained(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function canonicalRoot(root: string): Promise<string> {
  try {
    const canonical = await realpath(root);
    if (canonical !== resolve(root)) throw invalidFile();
    const stats = await lstat(canonical);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw invalidFile();
    return canonical;
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw invalidFile();
  }
}

async function concreteParent(root: string, target: string, create: boolean): Promise<string> {
  const canonical = await canonicalRoot(root);
  const absolute = resolve(target);
  if (!contained(canonical, absolute)) throw invalidFile();
  const parent = dirname(absolute);
  const segments = relative(canonical, parent).split(sep).filter(Boolean);
  let current = canonical;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(current) !== current) throw invalidFile();
    } catch (error) {
      if (isCode(error, "ENOENT") && !create) return parent;
      if (!isCode(error, "ENOENT") || !create) {
        if (error instanceof DrwnError) throw error;
        throw invalidFile();
      }
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if (!isCode(mkdirError, "EEXIST")) throw invalidFile();
      }
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(current) !== current) throw invalidFile();
    }
  }
  return parent;
}

async function assertConcreteTarget(path: string): Promise<void> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || await realpath(path) !== resolve(path)) throw invalidFile();
  } catch (error) {
    if (isCode(error, "ENOENT")) return;
    if (error instanceof DrwnError) throw error;
    throw invalidFile();
  }
}

async function restrictOwnerOnly(path: string, platform: NodeJS.Platform): Promise<void> {
  if (platform !== "win32") {
    await chmod(path, 0o600);
    return;
  }
  const inherited = await runProcess(["icacls", path, "/inheritance:r"]);
  if (inherited.exitCode !== 0) throw writeFailed();
  const user = process.env.USERNAME;
  if (!user) throw writeFailed();
  const granted = await runProcess(["icacls", path, "/grant:r", `${user}:F`]);
  if (granted.exitCode !== 0) throw writeFailed();
}

export async function preparePrivateFilePath(input: { root: string; path: string }): Promise<void> {
  await concreteParent(input.root, input.path, true);
  await assertConcreteTarget(input.path);
}

export async function writePrivateFile(input: {
  root: string;
  path: string;
  bytes: string | Uint8Array;
} & PrivateFileDependencies): Promise<void> {
  let tempPath: string | null = null;
  try {
    const parent = await concreteParent(input.root, input.path, true);
    await assertConcreteTarget(input.path);
    tempPath = join(parent, `.private.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await open(tempPath, "wx", 0o600);
    try {
      await handle.writeFile(input.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const restrict = input.restrict ?? ((path: string) => restrictOwnerOnly(path, input.platform ?? process.platform));
    await restrict(tempPath);
    await input.checkpoint?.("after-temp-flush");
    await input.checkpoint?.("before-rename");
    await rename(tempPath, input.path);
    tempPath = null;
    await restrict(input.path);
    await syncDirectory(parent);
    await input.checkpoint?.("after-rename");
  } catch (error) {
    if (tempPath) await rm(tempPath, { force: true }).catch(() => undefined);
    if (error instanceof DrwnError && error.code === "PRIVATE_FILE_INVALID") throw error;
    throw writeFailed();
  }
}

export async function readPrivateFile(input: {
  root: string;
  path: string;
  maxBytes?: number;
}): Promise<string | null> {
  try {
    await concreteParent(input.root, input.path, false);
    let before;
    try {
      before = await lstat(input.path);
    } catch (error) {
      if (isCode(error, "ENOENT")) return null;
      throw error;
    }
    const maxBytes = input.maxBytes ?? 65_536;
    if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes || before.size < 0) throw invalidFile();
    if (await realpath(input.path) !== resolve(input.path)) throw invalidFile();
    const bytes = await readFile(input.path);
    const after = await lstat(input.path);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || bytes.byteLength !== after.size) {
      throw invalidFile();
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof DrwnError && error.code === "PRIVATE_FILE_INVALID") throw error;
    throw invalidFile();
  }
}

export async function removePrivateFile(input: { root: string; path: string }): Promise<void> {
  try {
    const parent = await concreteParent(input.root, input.path, false);
    await assertConcreteTarget(input.path);
    await unlink(input.path);
    await syncDirectory(parent);
  } catch (error) {
    if (isCode(error, "ENOENT")) return;
    if (error instanceof DrwnError && error.code === "PRIVATE_FILE_INVALID") throw error;
    throw new DrwnError("PRIVATE_FILE_DELETE_FAILED", "Private state could not be deleted.");
  }
}
