// ABOUTME: Pure-JS tar archive helpers (create/list/extract) over node-tar.
// ABOUTME: Removes the dependency on a system `tar` binary so the write path runs on every OS.

import { mkdirSync } from "node:fs";
import * as tar from "tar";

export interface ExtractOptions {
  strip?: number;
  filter?: (path: string, entry: unknown) => boolean;
}

/** Extract an archive into destDir. gzip is auto-detected on read. */
export async function extract(archivePath: string, destDir: string, options: ExtractOptions = {}): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  await tar.x({ file: archivePath, cwd: destDir, strip: options.strip, filter: options.filter });
}

/** List member paths in an archive. gzip is auto-detected on read. */
export async function list(archivePath: string): Promise<string[]> {
  const entries: string[] = [];
  await tar.t({ file: archivePath, onentry: (entry) => entries.push(entry.path) });
  return entries;
}

export interface CreateOptions {
  cwd: string;
  entries: string[];
  gzip?: boolean;
  /** Omit mtimes so identical content archives to identical bytes. */
  noMtime?: boolean;
}

/** Create a portable tar (no platform-specific metadata) from entries relative to cwd. */
export async function create(outputPath: string, options: CreateOptions): Promise<void> {
  await tar.c(
    { file: outputPath, cwd: options.cwd, gzip: options.gzip === true, portable: true, noMtime: options.noMtime === true },
    options.entries,
  );
}
