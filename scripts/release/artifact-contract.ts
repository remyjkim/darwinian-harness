// ABOUTME: Qualifies one packed Worker tarball by members, measured bytes, and packaged build identity.
// ABOUTME: Installs that exact artifact into quarantine and runs only side-effect-free version/help smokes.

import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import * as tar from "tar";
import {
  parsePackagedBuildIdentity,
  type BuildIdentityFileV1,
} from "../../cli/core/build-identity";

export const REQUIRED_RELEASE_MEMBERS = [
  "cli/commands/org/org.ts",
  "cli/commands/org/list.ts",
  "cli/commands/org/use.ts",
  "cli/commands/worker/register.ts",
  "cli/commands/worker/use.ts",
  "cli/commands/worker/list.ts",
  "cli/commands/worker/status.ts",
  "cli/commands/worker/deploy.ts",
  "cli/commands/worker/deployments.ts",
  "cli/commands/worker/rollback.ts",
  "cli/commands/worker/chat.ts",
  "cli/commands/worker/run-status.ts",
  "cli/commands/worker/retire.ts",
  "cli/commands/worker/materialize.ts",
  "cli/commands/worker/buzz-tools.ts",
  "cli/commands/worker/secret-set.ts",
  "cli/commands/worker/mind/mind.ts",
  "cli/commands/worker/launch-context/launch-context.ts",
  "cli/commands/worker/launch-context/prepare.ts",
  "cli/commands/worker/launch-context/list.ts",
  "cli/commands/worker/launch-context/prune.ts",
  "cli/core/worker-launch-context/contracts.ts",
  "cli/core/worker-launch-context/service.ts",
  "cli/core/management/contracts.ts",
  "cli/core/management/routes.ts",
  "cli/core/management/transport.ts",
  "cli/core/management/results.ts",
  "cli/core/management/context-store.ts",
  "cli/core/management/operation-journal.ts",
  "cli/core/management/deployment-artifacts.ts",
  "cli/generated/drwn-management-contract-lock.json",
  "registry/contracts/deployed-worker.v1/contract.json",
  "registry/cards/buzz-delivery-worker/card.json",
  "cli/generated/build-identity.json",
] as const;

export const SAFE_INSTALLED_SMOKES = [
  ["--version"],
  ["org", "--help"],
  ["org", "list", "--help"],
  ["org", "use", "--help"],
  ["worker", "register", "--help"],
  ["worker", "use", "--help"],
  ["worker", "list", "--help"],
  ["worker", "status", "--help"],
  ["worker", "deploy", "--help"],
  ["worker", "deployments", "--help"],
  ["worker", "rollback", "--help"],
  ["worker", "chat", "--help"],
  ["worker", "run", "status", "--help"],
  ["worker", "retire", "--help"],
  ["worker", "materialize", "--help"],
  ["worker", "buzz-tools", "--help"],
  ["worker", "secret", "set", "--help"],
  ["worker", "launch-context", "--help"],
  ["worker", "launch-context", "prepare", "--help"],
  ["worker", "launch-context", "list", "--help"],
  ["worker", "launch-context", "prune", "--help"],
  ["worker", "mind", "--help"],
  ["login", "--help"],
  ["refresh", "--help"],
  ["logout", "--help"],
] as const;

const FULL_LOWERCASE_GIT_SHA = /^[a-f0-9]{40}$/;

export class ReleaseArtifactError extends Error {
  constructor(detail: string) {
    super(`Release artifact qualification failed: ${detail}`);
    this.name = "ReleaseArtifactError";
  }
}

function isSafeMemberPath(path: string): boolean {
  return path.length > 0 && !isAbsolute(path) && !path.includes("\\") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function isForbiddenMember(path: string): boolean {
  const segments = path.split("/");
  const filename = segments.at(-1) ?? "";
  return (
    filename === ".env" || filename.startsWith(".env.") ||
    segments.includes(".ai") ||
    segments[0] === "test" ||
    segments[0] === "scripts" ||
    segments.includes(".agents") ||
    filename === "config.json" && segments.length === 1 ||
    filename === "mcp-servers.json" && segments.length === 1 ||
    filename === ".drwn.secrets" ||
    filename === ".npmrc" ||
    filename === "credentials.json"
  );
}

export function qualifyPackageMembers(paths: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const path of paths) {
    if (!isSafeMemberPath(path)) throw new ReleaseArtifactError("unsafe package member path");
    if (unique.has(path)) throw new ReleaseArtifactError("duplicate package member path");
    if (isForbiddenMember(path)) throw new ReleaseArtifactError("forbidden package state");
    unique.add(path);
  }
  for (const required of REQUIRED_RELEASE_MEMBERS) {
    if (!unique.has(required)) throw new ReleaseArtifactError(`missing required member ${required}`);
  }
  return [...paths];
}

interface NpmPackResult {
  name?: unknown;
  version?: unknown;
  filename?: unknown;
  size?: unknown;
  shasum?: unknown;
  integrity?: unknown;
  files?: unknown;
}

function parseOnePackResult(json: string): NpmPackResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ReleaseArtifactError("npm pack result is malformed");
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0] !== "object" || parsed[0] === null) {
    throw new ReleaseArtifactError("npm pack must produce exactly one result");
  }
  return parsed[0] as NpmPackResult;
}

function memberPaths(result: NpmPackResult): string[] {
  if (!Array.isArray(result.files)) throw new ReleaseArtifactError("npm pack member list is unavailable");
  const paths = result.files.map((file) => {
    if (typeof file !== "object" || file === null || typeof (file as Record<string, unknown>).path !== "string") {
      throw new ReleaseArtifactError("npm pack member is malformed");
    }
    return (file as { path: string }).path;
  });
  return qualifyPackageMembers(paths);
}

async function readBuildIdentityFromTar(artifactPath: string): Promise<unknown> {
  const destination = await mkdtemp(join(tmpdir(), "drwn-release-identity-"));
  const member = "package/cli/generated/build-identity.json";
  try {
    let found = 0;
    await tar.x({
      file: artifactPath,
      cwd: destination,
      strip: 1,
      filter: (path) => {
        if (path === member) found += 1;
        return path === member;
      },
    });
    if (found !== 1) throw new ReleaseArtifactError("generated build identity member is not unique");
    return JSON.parse(await readFile(join(destination, "cli", "generated", "build-identity.json"), "utf8"));
  } catch (error) {
    if (error instanceof ReleaseArtifactError) throw error;
    throw new ReleaseArtifactError("generated build identity cannot be read");
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
}

export interface QualifyPackedArtifactInput {
  packDirectory: string;
  packResultJson: string;
  expectedPackageName: string;
  expectedVersion: string;
  checkoutCommit: string;
}

export interface QualifyPackedArtifactDeps {
  readBuildIdentity?: (artifactPath: string) => Promise<unknown>;
}

export interface QualifiedPackedArtifact {
  packageName: string;
  version: string;
  sourceCommit: string;
  filename: string;
  byteLength: number;
  sha1: string;
  sha256: string;
  integrity: string;
  members: string[];
}

export async function qualifyPackedArtifact(
  input: QualifyPackedArtifactInput,
  deps: QualifyPackedArtifactDeps = {},
): Promise<QualifiedPackedArtifact> {
  if (!FULL_LOWERCASE_GIT_SHA.test(input.checkoutCommit)) {
    throw new ReleaseArtifactError("checkout commit must be a full lowercase Git SHA");
  }
  const result = parseOnePackResult(input.packResultJson);
  if (result.name !== input.expectedPackageName || result.version !== input.expectedVersion) {
    throw new ReleaseArtifactError("npm pack package tuple does not match the candidate");
  }
  const expectedFilename = `${input.expectedPackageName}-${input.expectedVersion}.tgz`;
  if (
    typeof result.filename !== "string" ||
    result.filename !== basename(result.filename) ||
    !isSafeMemberPath(result.filename) ||
    result.filename !== expectedFilename
  ) {
    throw new ReleaseArtifactError("npm pack filename is not the exact safe candidate name");
  }

  const members = memberPaths(result);
  const artifactPath = resolve(input.packDirectory, result.filename);
  if (relative(resolve(input.packDirectory), artifactPath).startsWith(`..${sep}`)) {
    throw new ReleaseArtifactError("npm pack filename escapes its directory");
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(artifactPath);
  } catch {
    throw new ReleaseArtifactError("packed tarball is unavailable");
  }
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (result.size !== bytes.length || result.shasum !== sha1 || result.integrity !== integrity) {
    throw new ReleaseArtifactError("npm pack byte identities do not match the measured tarball");
  }

  const readBuildIdentity = deps.readBuildIdentity ?? readBuildIdentityFromTar;
  let rawIdentity: unknown;
  try {
    rawIdentity = await readBuildIdentity(artifactPath);
  } catch (error) {
    if (error instanceof ReleaseArtifactError) throw error;
    throw new ReleaseArtifactError("generated build identity cannot be read");
  }
  let identity: ReturnType<typeof parsePackagedBuildIdentity>;
  try {
    identity = parsePackagedBuildIdentity(rawIdentity as BuildIdentityFileV1, input.expectedVersion);
  } catch {
    throw new ReleaseArtifactError("generated build identity is invalid");
  }
  if (identity.sourceCommit !== input.checkoutCommit || !identity.qualificationEligible) {
    throw new ReleaseArtifactError("checkout and generated build identity do not match");
  }

  return {
    packageName: input.expectedPackageName,
    version: input.expectedVersion,
    sourceCommit: identity.sourceCommit,
    filename: result.filename,
    byteLength: bytes.length,
    sha1,
    sha256,
    integrity,
    members,
  };
}

async function listNpmTarMembers(artifactPath: string): Promise<string[]> {
  const paths: string[] = [];
  try {
    await tar.t({
      file: artifactPath,
      onentry: (entry) => {
        if (entry.type !== "File" && entry.type !== "OldFile") return;
        if (!entry.path.startsWith("package/")) throw new ReleaseArtifactError("tar member escapes the package root");
        paths.push(entry.path.slice("package/".length));
      },
    });
  } catch (error) {
    if (error instanceof ReleaseArtifactError) throw error;
    throw new ReleaseArtifactError("tar member inventory cannot be read");
  }
  return paths;
}

export interface ReceivedArtifactExpectation {
  packageName: string;
  version: string;
  sourceCommit: string;
  filename: string;
  byteLength: number;
  sha1: string;
  sha256: string;
  integrity: string;
}

export async function requalifyReceivedArtifact(input: {
  artifactPath: string;
  expected: ReceivedArtifactExpectation;
}): Promise<QualifiedPackedArtifact> {
  if (basename(input.artifactPath) !== input.expected.filename) {
    throw new ReleaseArtifactError("received artifact filename does not match its receipt");
  }
  const members = await listNpmTarMembers(input.artifactPath);
  const packResultJson = JSON.stringify([{
    name: input.expected.packageName,
    version: input.expected.version,
    filename: input.expected.filename,
    size: input.expected.byteLength,
    shasum: input.expected.sha1,
    integrity: input.expected.integrity,
    files: members.map((path) => ({ path })),
  }]);
  const qualified = await qualifyPackedArtifact({
    packDirectory: dirname(input.artifactPath),
    packResultJson,
    expectedPackageName: input.expected.packageName,
    expectedVersion: input.expected.version,
    checkoutCommit: input.expected.sourceCommit,
  });
  if (qualified.sha256 !== input.expected.sha256) {
    throw new ReleaseArtifactError("received artifact SHA-256 does not match its receipt");
  }
  return qualified;
}

export interface PublishedRegistryExpectation {
  version: string;
  sourceCommit: string;
  sha1: string;
  integrity: string;
}

export function verifyPublishedRegistryIdentity(
  metadata: unknown,
  expected: PublishedRegistryExpectation,
  options: { requireGitHead?: boolean } = {},
): PublishedRegistryExpectation & { gitHead: string | null } {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new ReleaseArtifactError("registry metadata is malformed");
  }
  const record = metadata as Record<string, unknown>;
  const allowedKeys = record.gitHead === undefined
    ? ["dist", "version"]
    : ["dist", "gitHead", "version"];
  if (Object.keys(record).sort().join("\0") !== allowedKeys.sort().join("\0")) {
    throw new ReleaseArtifactError("registry metadata has an unsupported shape");
  }
  if (typeof record.dist !== "object" || record.dist === null || Array.isArray(record.dist)) {
    throw new ReleaseArtifactError("registry distribution metadata is malformed");
  }
  const distribution = record.dist as Record<string, unknown>;
  if (Object.keys(distribution).sort().join("\0") !== ["integrity", "shasum"].sort().join("\0")) {
    throw new ReleaseArtifactError("registry distribution metadata has an unsupported shape");
  }
  const gitHead = record.gitHead === undefined ? null : record.gitHead;
  if (
    record.version !== expected.version ||
    distribution.shasum !== expected.sha1 ||
    distribution.integrity !== expected.integrity ||
    typeof expected.sourceCommit !== "string" || !FULL_LOWERCASE_GIT_SHA.test(expected.sourceCommit) ||
    typeof expected.sha1 !== "string" || !/^[a-f0-9]{40}$/.test(expected.sha1) ||
    typeof gitHead !== "string" && gitHead !== null ||
    typeof gitHead === "string" && (!FULL_LOWERCASE_GIT_SHA.test(gitHead) || gitHead !== expected.sourceCommit) ||
    options.requireGitHead === true && gitHead === null
  ) {
    throw new ReleaseArtifactError("registry identity does not match the qualified artifact");
  }
  const integrityBytes = typeof expected.integrity === "string" && expected.integrity.startsWith("sha512-")
    ? Buffer.from(expected.integrity.slice("sha512-".length), "base64")
    : Buffer.alloc(0);
  if (integrityBytes.length !== 64 || `sha512-${integrityBytes.toString("base64")}` !== expected.integrity) {
    throw new ReleaseArtifactError("qualified registry integrity is invalid");
  }
  return { ...expected, gitHead };
}

export interface ReleaseCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ReleaseCommandRunner = (
  command: string[],
  options: { cwd: string; env: Record<string, string | undefined> },
) => Promise<ReleaseCommandResult>;

async function defaultCommandRunner(
  command: string[],
  options: { cwd: string; env: Record<string, string | undefined> },
): Promise<ReleaseCommandResult> {
  const proc = Bun.spawn(command, { cwd: options.cwd, env: options.env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function defaultResolveInstalledBin(prefix: string): Promise<string> {
  return realpath(join(prefix, "bin", "drwn"));
}

async function assertEmptyDirectories(paths: string[]): Promise<void> {
  for (const path of paths) {
    if ((await readdir(path)).length !== 0) {
      throw new ReleaseArtifactError("installed help smoke mutated quarantined state");
    }
  }
}

export interface InstalledArtifactSmokeInput {
  artifactPath: string;
  expectedVersion: string;
  workspaceRoot: string;
}

export interface InstalledArtifactSmokeDeps {
  run?: ReleaseCommandRunner;
  resolveInstalledBin?: (prefix: string) => Promise<string>;
}

export async function runInstalledArtifactSmokes(
  input: InstalledArtifactSmokeInput,
  deps: InstalledArtifactSmokeDeps = {},
): Promise<{ version: string; passed: string[] }> {
  const workspaceRoot = resolve(input.workspaceRoot);
  try {
    await mkdir(workspaceRoot);
  } catch {
    throw new ReleaseArtifactError("smoke workspace must be newly created");
  }
  const prefix = join(workspaceRoot, "prefix");
  const cache = join(workspaceRoot, "cache");
  const project = join(workspaceRoot, "project");
  const userHome = join(workspaceRoot, "user-home");
  const agentsDir = join(workspaceRoot, "agents");
  await Promise.all([prefix, cache, project, userHome, agentsDir].map((path) => mkdir(path)));

  const env: Record<string, string | undefined> = {
    ...process.env,
    AGENTS_HOME_DIR: userHome,
    AGENTS_DIR: agentsDir,
  };
  delete env.DRWN_TOKEN;
  const run = deps.run ?? defaultCommandRunner;
  const install = await run([
    "npm",
    "install",
    "--global",
    resolve(input.artifactPath),
    "--prefix",
    prefix,
    "--cache",
    cache,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ], { cwd: project, env });
  if (install.exitCode !== 0) throw new ReleaseArtifactError("clean-prefix installation failed");

  const resolveInstalledBin = deps.resolveInstalledBin ?? defaultResolveInstalledBin;
  const bin = await resolveInstalledBin(prefix);
  const resolvedPrefix = await realpath(prefix);
  if (bin !== resolvedPrefix && !bin.startsWith(`${resolvedPrefix}${sep}`)) {
    throw new ReleaseArtifactError("installed bin resolves outside the clean prefix");
  }

  const quarantine = [project, userHome, agentsDir];
  const passed: string[] = [];
  for (const smoke of SAFE_INSTALLED_SMOKES) {
    const result = await run([bin, ...smoke], { cwd: project, env });
    if (result.exitCode !== 0) throw new ReleaseArtifactError("installed version/help smoke failed");
    if (smoke.length === 1 && smoke[0] === "--version" && result.stdout.trim() !== input.expectedVersion) {
      throw new ReleaseArtifactError("installed version does not match the candidate");
    }
    await assertEmptyDirectories(quarantine);
    passed.push(smoke.join(" "));
  }
  return { version: input.expectedVersion, passed };
}
