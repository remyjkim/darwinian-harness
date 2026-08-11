// ABOUTME: Supplies descriptor-bound POSIX file operations for runtime-admission publication.
// ABOUTME: Self-verifies platform layout and fails closed where the semantics are unavailable.

import { dlopen, ptr } from "bun:ffi";
import { lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface DescriptorStat {
  dev: bigint;
  ino: bigint;
  mode: number;
  nlink: number;
  isDirectory: boolean;
  isRegular: boolean;
}

export interface DescriptorOps {
  /** No-follow metadata for an absolute pathname; `null` when the name does not exist. */
  statPathNoFollow(path: string): DescriptorStat | null;
  /** Opens an existing directory with directory and no-follow semantics. */
  openDirectoryNoFollow(path: string): number;
  fstat(fd: number): DescriptorStat;
  /** Descriptor-relative no-follow metadata; `null` when the name does not exist. */
  fstatatNoFollow(dirfd: number, name: string): DescriptorStat | null;
  /** Descriptor-relative exclusive creation of a regular file. */
  openTemporaryExclusive(dirfd: number, name: string): number;
  fchmod(fd: number, mode: number): void;
  write(fd: number, bytes: Uint8Array): number;
  fsync(fd: number): void;
  close(fd: number): void;
  /**
   * Descriptor-bound same-directory hard link. The return value is never the
   * verdict: descriptor-relative reconciliation decides the real namespace state.
   */
  linkat(dirfd: number, from: string, to: string): boolean;
  unlinkat(dirfd: number, name: string): void;
}

export interface DescriptorSupport {
  supported: boolean;
  reason: string;
}

export class DescriptorSemanticsUnsupported extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "DescriptorSemanticsUnsupported";
  }
}

interface PlatformLayout {
  library: string;
  openReadOnly: number;
  openWriteOnly: number;
  openCreate: number;
  openExclusive: number;
  openNoFollow: number;
  openDirectory: number;
  atSymlinkNoFollow: number;
  statSize: number;
  devOffset: number;
  devWidth: 4 | 8;
  inodeOffset: number;
  modeOffset: number;
  modeWidth: 2 | 4;
  linkOffset: number;
  linkWidth: 2 | 4 | 8;
}

// Only layouts that are exercised by the required platforms are described. Anything
// else fails closed rather than guessing an ABI that would silently corrupt the
// identity comparisons the publication contract depends on.
function platformLayout(): PlatformLayout | null {
  if (process.platform === "darwin") {
    return {
      library: "libSystem.B.dylib",
      openReadOnly: 0x0000,
      openWriteOnly: 0x0001,
      openCreate: 0x0200,
      openExclusive: 0x0800,
      openNoFollow: 0x0100,
      openDirectory: 0x0010_0000,
      atSymlinkNoFollow: 0x0020,
      statSize: 144,
      devOffset: 0,
      devWidth: 4,
      inodeOffset: 8,
      modeOffset: 4,
      modeWidth: 2,
      linkOffset: 6,
      linkWidth: 2,
    };
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return {
      library: "libc.so.6",
      openReadOnly: 0o0,
      openWriteOnly: 0o1,
      openCreate: 0o100,
      openExclusive: 0o200,
      openNoFollow: 0o400000,
      openDirectory: 0o200000,
      atSymlinkNoFollow: 0x100,
      statSize: 144,
      devOffset: 0,
      devWidth: 8,
      inodeOffset: 8,
      modeOffset: 24,
      modeWidth: 4,
      linkOffset: 16,
      linkWidth: 8,
    };
  }
  return null;
}

const SYMBOLS = {
  open: { args: ["cstring", "i32", "i32"], returns: "i32" },
  openat: { args: ["i32", "cstring", "i32", "i32"], returns: "i32" },
  fstat: { args: ["i32", "ptr"], returns: "i32" },
  fstatat: { args: ["i32", "cstring", "ptr", "i32"], returns: "i32" },
  lstat: { args: ["cstring", "ptr"], returns: "i32" },
  fchmod: { args: ["i32", "u16"], returns: "i32" },
  write: { args: ["i32", "ptr", "u64"], returns: "i64" },
  fsync: { args: ["i32"], returns: "i32" },
  close: { args: ["i32"], returns: "i32" },
  linkat: { args: ["i32", "cstring", "i32", "cstring", "i32"], returns: "i32" },
  unlinkat: { args: ["i32", "cstring", "i32"], returns: "i32" },
} as const;

function terminated(value: string): Buffer {
  return Buffer.from(`${value}\0`, "utf8");
}

let cached: { ops: DescriptorOps } | { reason: string } | null = null;

function build(): DescriptorOps {
  const layout = platformLayout();
  if (layout === null) {
    throw new DescriptorSemanticsUnsupported(
      `descriptor-bound POSIX semantics are unavailable on ${process.platform}/${process.arch}`,
    );
  }

  let symbols: Record<string, unknown>;
  try {
    symbols = dlopen(layout.library, SYMBOLS as never).symbols as never;
  } catch {
    throw new DescriptorSemanticsUnsupported(
      `${layout.library} does not expose the required descriptor-bound symbols`,
    );
  }

  const call = symbols as unknown as {
    open(path: Buffer, flags: number, mode: number): number;
    openat(dirfd: number, path: Buffer, flags: number, mode: number): number;
    fstat(fd: number, buffer: unknown): number;
    fstatat(dirfd: number, path: Buffer, buffer: unknown, flags: number): number;
    lstat(path: Buffer, buffer: unknown): number;
    fchmod(fd: number, mode: number): number;
    write(fd: number, buffer: unknown, length: bigint): bigint;
    fsync(fd: number): number;
    close(fd: number): number;
    linkat(fromDir: number, from: Buffer, toDir: number, to: Buffer, flags: number): number;
    unlinkat(dirfd: number, path: Buffer, flags: number): number;
  };

  function decode(buffer: Uint8Array): DescriptorStat {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const dev = layout!.devWidth === 8
      ? view.getBigUint64(layout!.devOffset, true)
      : BigInt(view.getUint32(layout!.devOffset, true));
    const mode = layout!.modeWidth === 4
      ? view.getUint32(layout!.modeOffset, true)
      : view.getUint16(layout!.modeOffset, true);
    const nlink = layout!.linkWidth === 8
      ? Number(view.getBigUint64(layout!.linkOffset, true))
      : layout!.linkWidth === 4
        ? view.getUint32(layout!.linkOffset, true)
        : view.getUint16(layout!.linkOffset, true);
    return {
      dev,
      ino: view.getBigUint64(layout!.inodeOffset, true),
      mode,
      nlink,
      isDirectory: (mode & 0o170000) === 0o040000,
      isRegular: (mode & 0o170000) === 0o100000,
    };
  }

  const ops: DescriptorOps = {
    statPathNoFollow(path) {
      const buffer = new Uint8Array(layout.statSize);
      if (call.lstat(terminated(path), ptr(buffer)) !== 0) return null;
      return decode(buffer);
    },
    openDirectoryNoFollow(path) {
      const fd = call.open(
        terminated(path),
        layout.openReadOnly | layout.openDirectory | layout.openNoFollow,
        0,
      );
      if (fd < 0) throw new DescriptorSemanticsUnsupported("directory open failed");
      return fd;
    },
    fstat(fd) {
      const buffer = new Uint8Array(layout.statSize);
      if (call.fstat(fd, ptr(buffer)) !== 0) throw new Error("fstat failed");
      return decode(buffer);
    },
    fstatatNoFollow(dirfd, name) {
      const buffer = new Uint8Array(layout.statSize);
      if (call.fstatat(dirfd, terminated(name), ptr(buffer), layout.atSymlinkNoFollow) !== 0) {
        return null;
      }
      return decode(buffer);
    },
    openTemporaryExclusive(dirfd, name) {
      const fd = call.openat(
        dirfd,
        terminated(name),
        layout.openWriteOnly | layout.openCreate | layout.openExclusive | layout.openNoFollow,
        0o600,
      );
      if (fd < 0) throw new Error("exclusive temporary creation failed");
      return fd;
    },
    fchmod(fd, mode) {
      if (call.fchmod(fd, mode) !== 0) throw new Error("fchmod failed");
    },
    write(fd, bytes) {
      const written = call.write(fd, ptr(bytes), BigInt(bytes.byteLength));
      return Number(written);
    },
    fsync(fd) {
      if (call.fsync(fd) !== 0) throw new Error("fsync failed");
    },
    close(fd) {
      call.close(fd);
    },
    linkat(dirfd, from, to) {
      return call.linkat(dirfd, terminated(from), dirfd, terminated(to), 0) === 0;
    },
    unlinkat(dirfd, name) {
      if (call.unlinkat(dirfd, terminated(name), 0) !== 0) throw new Error("unlinkat failed");
    },
  };

  return ops;
}

/**
 * Proves the declared struct layout against an independent reading of the same
 * pathname. A wrong offset would otherwise produce identity comparisons that are
 * quietly meaningless, which is exactly what the frozen-handle contract forbids.
 */
function verifyLayout(ops: DescriptorOps, probePath: string): void {
  const observed = ops.statPathNoFollow(probePath);
  if (observed === null) throw new DescriptorSemanticsUnsupported("layout probe is unreadable");
  const reference = lstatSync(probePath);
  if (
    observed.ino !== BigInt(reference.ino) ||
    observed.dev !== BigInt(reference.dev) ||
    (observed.mode & 0o170000) !== (reference.mode & 0o170000) ||
    observed.nlink !== reference.nlink
  ) {
    throw new DescriptorSemanticsUnsupported("platform metadata layout does not match");
  }
}

/**
 * The layout probe reads this module's own file rather than a caller-supplied
 * directory. A directory's link count changes on every `mkdir` and `rmdir` inside it,
 * so probing the publication target would let an adversary — or an ordinary
 * concurrent writer — make the two readings disagree and report the semantics as
 * conclusively unsupported.
 */
const LAYOUT_PROBE_PATH = fileURLToPath(import.meta.url);

/** Loads the descriptor-bound operations, verifying the declared layout first. */
export function loadDescriptorOps(): DescriptorOps {
  if (cached !== null && "reason" in cached) {
    throw new DescriptorSemanticsUnsupported(cached.reason);
  }
  if (cached === null) {
    try {
      cached = { ops: build() };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "descriptor semantics unavailable";
      cached = { reason };
      throw new DescriptorSemanticsUnsupported(reason);
    }
  }
  verifyLayout(cached.ops, LAYOUT_PROBE_PATH);
  return cached.ops;
}

/** Reports whether this platform can honour the descriptor-bound publication contract. */
export function describeDescriptorSupport(): DescriptorSupport {
  try {
    loadDescriptorOps();
    return { supported: true, reason: "" };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "descriptor semantics unavailable",
    };
  }
}
