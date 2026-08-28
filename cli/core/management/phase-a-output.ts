// ABOUTME: Publishes the two I321 Phase-A public byte streams as one fail-closed pair.
// ABOUTME: Uses create-exclusive owner files under RUNNER_TEMP and preserves caller collisions.

import { lstat, link, open, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { DrwnError } from "../errors";

export interface WriteI321PhaseAPublicReceiptsInput {
  runnerTemp: string;
  readinessPath: string;
  communityPath: string;
  readinessBytes: Uint8Array;
  communityBytes: Uint8Array;
}

export type PreflightI321PhaseAPublicReceiptPathsInput = Omit<
  WriteI321PhaseAPublicReceiptsInput,
  "readinessBytes" | "communityBytes"
>;

export interface I321PhaseAOutputDependencies {
  link?: typeof link;
}

interface SafeOutput {
  path: string;
  parent: string;
  bytes: Uint8Array;
  temporaryPath?: string;
  identity?: { dev: bigint; ino: bigint };
  finalCreated: boolean;
}

function outputError(): DrwnError {
  return new DrwnError(
    "STAGING_COMMUNITY_OUTPUT_INVALID",
    "The staging qualification output path is invalid.",
  );
}

function ownerMatches(uid: number | bigint): boolean {
  return typeof process.getuid !== "function" || BigInt(uid) === BigInt(process.getuid());
}

function validBytes(value: Uint8Array): boolean {
  return value.byteLength >= 2 && value.byteLength <= 65_536 && value[value.byteLength - 1] === 0x0a;
}

async function safeOutput(
  path: string,
  expectedBasename: string,
  runnerRoot: string,
  bytes: Uint8Array,
): Promise<SafeOutput> {
  if (!isAbsolute(path) || basename(path) !== expectedBasename || !validBytes(bytes)) {
    throw outputError();
  }
  const resolvedPath = resolve(path);
  const child = relative(runnerRoot, resolvedPath);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw outputError();
  }
  const parent = dirname(resolvedPath);
  if (await realpath(parent) !== resolve(parent)) throw outputError();
  const metadata = await lstat(parent);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o777) !== 0o700 ||
    !ownerMatches(metadata.uid)
  ) throw outputError();
  try {
    await lstat(resolvedPath);
    throw outputError();
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  return { path: resolvedPath, parent, bytes, finalCreated: false };
}

async function removeCreated(output: SafeOutput): Promise<void> {
  if (!output.finalCreated || output.identity === undefined) return;
  const current = await lstat(output.path, { bigint: true }).catch(() => null);
  if (current?.dev === output.identity.dev && current.ino === output.identity.ino) {
    await unlink(output.path).catch(() => undefined);
  }
}

export async function preflightI321PhaseAPublicReceiptPaths(
  input: PreflightI321PhaseAPublicReceiptPathsInput,
): Promise<void> {
  try {
    if (!isAbsolute(input.runnerTemp)) throw outputError();
    const runnerRoot = await realpath(input.runnerTemp);
    if (runnerRoot !== resolve(input.runnerTemp)) throw outputError();
    const runnerMetadata = await lstat(runnerRoot);
    if (
      !runnerMetadata.isDirectory() ||
      runnerMetadata.isSymbolicLink() ||
      (runnerMetadata.mode & 0o777) !== 0o700 ||
      !ownerMatches(runnerMetadata.uid)
    ) throw outputError();
    const placeholder = new Uint8Array([0x7b, 0x0a]);
    const outputs = [
      await safeOutput(
        input.readinessPath,
        "i321-cli-management-readiness.json",
        runnerRoot,
        placeholder,
      ),
      await safeOutput(
        input.communityPath,
        "i321-staging-slot-community.json",
        runnerRoot,
        placeholder,
      ),
    ];
    if (outputs[0]!.path === outputs[1]!.path || outputs[0]!.parent !== outputs[1]!.parent) {
      throw outputError();
    }
  } catch {
    throw outputError();
  }
}

export async function writeI321PhaseAPublicReceipts(
  input: WriteI321PhaseAPublicReceiptsInput,
  dependencies: I321PhaseAOutputDependencies = {},
): Promise<void> {
  let outputs: SafeOutput[] = [];
  try {
    if (!isAbsolute(input.runnerTemp)) throw outputError();
    const runnerRoot = await realpath(input.runnerTemp);
    if (runnerRoot !== resolve(input.runnerTemp)) throw outputError();
    const runnerMetadata = await lstat(runnerRoot);
    if (
      !runnerMetadata.isDirectory() ||
      runnerMetadata.isSymbolicLink() ||
      (runnerMetadata.mode & 0o777) !== 0o700 ||
      !ownerMatches(runnerMetadata.uid)
    ) throw outputError();

    outputs = [
      await safeOutput(
        input.readinessPath,
        "i321-cli-management-readiness.json",
        runnerRoot,
        input.readinessBytes,
      ),
      await safeOutput(
        input.communityPath,
        "i321-staging-slot-community.json",
        runnerRoot,
        input.communityBytes,
      ),
    ];
    if (outputs[0]!.path === outputs[1]!.path || outputs[0]!.parent !== outputs[1]!.parent) {
      throw outputError();
    }

    for (const output of outputs) {
      output.temporaryPath = resolve(
        output.parent,
        `.i321-phase-a.${crypto.randomUUID()}.tmp`,
      );
      const handle = await open(output.temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(output.bytes);
        await handle.sync();
        const metadata = await handle.stat({ bigint: true });
        if (
          !metadata.isFile() ||
          metadata.nlink !== 1n ||
          (metadata.mode & 0o777n) !== 0o600n ||
          metadata.size !== BigInt(output.bytes.byteLength) ||
          !ownerMatches(metadata.uid)
        ) throw outputError();
        output.identity = { dev: metadata.dev, ino: metadata.ino };
      } finally {
        await handle.close();
      }
    }

    for (const output of outputs) {
      await (dependencies.link ?? link)(output.temporaryPath!, output.path);
      output.finalCreated = true;
    }
    for (const output of outputs) {
      await unlink(output.temporaryPath!);
      output.temporaryPath = undefined;
      const metadata = await lstat(output.path, { bigint: true });
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.nlink !== 1n ||
        (metadata.mode & 0o777n) !== 0o600n ||
        metadata.size !== BigInt(output.bytes.byteLength) ||
        metadata.dev !== output.identity!.dev ||
        metadata.ino !== output.identity!.ino ||
        !ownerMatches(metadata.uid)
      ) throw outputError();
    }
  } catch {
    await Promise.all(outputs.map(removeCreated));
    await Promise.all(outputs.map(async (output) => {
      if (output.temporaryPath !== undefined) {
        await unlink(output.temporaryPath).catch(() => undefined);
      }
    }));
    throw outputError();
  }
}
