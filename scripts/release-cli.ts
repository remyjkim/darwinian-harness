#!/usr/bin/env bun
// ABOUTME: Provides thin process adapters for the importable Worker release contracts.
// ABOUTME: Derives package/Git/workflow identity locally and never echoes caller or remote failure input.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readRuntimeVersion } from "../cli/core/version";
import {
  qualifyPackedArtifact,
  requalifyReceivedArtifact,
  runInstalledArtifactSmokes,
  verifyPublishedRegistryIdentity,
  type QualifiedPackedArtifact,
} from "./release/artifact-contract";
import { validatePublicationControls } from "./release/publication-controls";
import {
  createReleaseCandidateReceipt,
  parseReleaseCandidateReceipt,
  parseRecoveryAuthorizationReceipt,
  parseReleaseTagAuthorization,
  verifyRecoveryReleaseProvenance,
  verifyReleaseProvenance,
} from "./release/provenance";
import { probeRegistryVersion } from "./release/registry-probe";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function gitHead(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: repoRoot, stdout: "pipe", stderr: "ignore" });
  const stdout = await new Response(proc.stdout).text();
  if (await proc.exited !== 0) throw new Error();
  return stdout.trim();
}

function requiredArg(args: string[], index: number): string {
  const value = args[index];
  if (!value) throw new Error();
  return value;
}

async function packageIdentity(): Promise<{ name: string; version: string }> {
  const packagePath = join(repoRoot, "package.json");
  const metadata = JSON.parse(await readFile(packagePath, "utf8")) as { name?: unknown };
  if (metadata.name !== "darwinian") throw new Error();
  return { name: metadata.name, version: readRuntimeVersion(packagePath) };
}

export async function runReleaseCli(args: string[]): Promise<string> {
  const command = requiredArg(args, 0);
  if (command === "assert-unpublished") {
    if (args.length !== 1) throw new Error();
    const identity = await packageIdentity();
    const result = await probeRegistryVersion({ packageName: identity.name, version: identity.version });
    if (result.state !== "unpublished") throw new Error();
    return `${JSON.stringify(result)}\n`;
  }
  if (command === "qualify-artifact") {
    if (args.length !== 3) throw new Error();
    const identity = await packageIdentity();
    const result = await qualifyPackedArtifact({
      packResultJson: await readFile(requiredArg(args, 1), "utf8"),
      packDirectory: requiredArg(args, 2),
      expectedPackageName: identity.name,
      expectedVersion: identity.version,
      checkoutCommit: await gitHead(),
    });
    return `${JSON.stringify(result)}\n`;
  }
  if (command === "smoke-artifact") {
    if (args.length !== 3) throw new Error();
    const identity = await packageIdentity();
    const result = await runInstalledArtifactSmokes({
      artifactPath: requiredArg(args, 1),
      expectedVersion: identity.version,
      workspaceRoot: requiredArg(args, 2),
    });
    return `${JSON.stringify(result)}\n`;
  }
  if (command === "requalify-artifact") {
    if (args.length !== 3) throw new Error();
    const receipt = parseReleaseCandidateReceipt(await readFile(requiredArg(args, 2), "utf8"));
    const result = await requalifyReceivedArtifact({
      artifactPath: requiredArg(args, 1),
      expected: {
        packageName: receipt.package.name,
        version: receipt.package.version,
        sourceCommit: receipt.build.sourceCommit,
        filename: receipt.tar.filename,
        byteLength: receipt.tar.byteLength,
        sha1: receipt.tar.sha1,
        sha256: receipt.tar.sha256,
        integrity: receipt.tar.integrity,
      },
    });
    return `${JSON.stringify(result)}\n`;
  }
  if (command === "create-receipt") {
    if (args.length !== 2) throw new Error();
    const artifact = JSON.parse(await readFile(requiredArg(args, 1), "utf8")) as QualifiedPackedArtifact;
    return createReleaseCandidateReceipt({
      artifact,
      createdAt: new Date().toISOString(),
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      ref: process.env.GITHUB_REF ?? "",
      sourceCommit: process.env.GITHUB_SHA ?? "",
    });
  }
  if (command === "verify-controls") {
    if (args.length !== 3) throw new Error();
    const result = validatePublicationControls({
      github: JSON.parse(await readFile(requiredArg(args, 1), "utf8")),
      npm: JSON.parse(await readFile(requiredArg(args, 2), "utf8")),
      policy: JSON.parse(await readFile(new URL("./release/release-policy.json", import.meta.url), "utf8")),
      now: new Date().toISOString(),
    });
    return `${JSON.stringify(result)}\n`;
  }
  if (command === "verify-registry") {
    if (args.length !== 3 && args.length !== 4) throw new Error();
    const artifact = JSON.parse(await readFile(requiredArg(args, 2), "utf8")) as QualifiedPackedArtifact;
    const result = verifyPublishedRegistryIdentity(
      JSON.parse(await readFile(requiredArg(args, 1), "utf8")),
      {
        version: artifact.version,
        sourceCommit: artifact.sourceCommit,
        sha1: artifact.sha1,
        integrity: artifact.integrity,
      },
      { requireGitHead: args[3] === "--require-git-head" },
    );
    return `${JSON.stringify(result)}\n`;
  }
  if (command === "parse-tag-authorization") {
    if (args.length !== 2) throw new Error();
    return `${JSON.stringify(parseReleaseTagAuthorization(await readFile(requiredArg(args, 1), "utf8")))}\n`;
  }
  if (command === "parse-recovery-authorization") {
    if (args.length !== 2) throw new Error();
    return `${JSON.stringify(parseRecoveryAuthorizationReceipt(await readFile(requiredArg(args, 1), "utf8")))}\n`;
  }
  if (command === "verify-provenance") {
    if (args.length !== 2) throw new Error();
    const input = JSON.parse(await readFile(requiredArg(args, 1), "utf8"));
    return `${JSON.stringify(verifyReleaseProvenance(input))}\n`;
  }
  if (command === "verify-recovery-provenance") {
    if (args.length !== 2) throw new Error();
    const input = JSON.parse(await readFile(requiredArg(args, 1), "utf8"));
    return `${JSON.stringify(verifyRecoveryReleaseProvenance(input))}\n`;
  }
  throw new Error();
}

if (import.meta.main) {
  try {
    process.stdout.write(await runReleaseCli(process.argv.slice(2)));
  } catch {
    process.stderr.write("Release command failed.\n");
    process.exitCode = 1;
  }
}
