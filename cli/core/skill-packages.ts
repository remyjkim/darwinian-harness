// ABOUTME: Loads, validates, discovers, and ingests package-backed skill bundles into ~/.agents state.
// ABOUTME: Uses npm pack plus tar extraction so extension bundles stay content-oriented and source-inspectable.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { extract as extractArchive } from "./archive";
import { DrwnError } from "./errors";
import { flushDirectoryTree, syncDirectory, writeAtomically } from "./fs";
import { withInventoryLock } from "./inventory-lock";
import { tombstoneInventoryPath } from "./inventory-tombstones";
import {
  assertSafePathPart,
  assertStoreWritable,
  resolveStoreSkillPackageCurrentLink,
  resolveStoreSkillPackageRoot,
  resolveStoreSkillPackagesRoot,
  resolveStoreSkillPackageVersionRoot,
} from "./store-paths";
import { npmCommand } from "./process";
import { isStrictSemver } from "./semver-utils";
import type { BundleManifest, BundleSkillEntry, InstalledSkillBundle } from "./types";

export interface ExistingSkillRecord {
  name: string;
  sourceType?: "repo" | "npm";
  sourceId?: string;
}

export type SkillAddInputKind = "loose-skill" | "package-spec";
export type SkillPackageCommitCheckpoint =
  | "before-version-rename"
  | "after-version-rename"
  | "before-pointer-write"
  | "after-pointer-write";

export async function loadBundleManifest(bundleRoot: string): Promise<BundleManifest> {
  const manifestPath = join(bundleRoot, "bundle.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing bundle.json at ${bundleRoot}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as BundleManifest;
}

function activeSkillPackagesRoot(agentsDir: string) {
  return resolveStoreSkillPackagesRoot(agentsDir);
}

function activeSkillPackageRoot(agentsDir: string, packageName: string) {
  return resolveStoreSkillPackageRoot(agentsDir, packageName);
}

function activeSkillPackageVersionRoot(agentsDir: string, packageName: string, version: string) {
  return resolveStoreSkillPackageVersionRoot(agentsDir, packageName, version);
}

function activeSkillPackageCurrentLink(agentsDir: string, packageName: string) {
  return resolveStoreSkillPackageCurrentLink(agentsDir, packageName);
}

function isWithinRoot(root: string, candidatePath: string) {
  const rel = relative(root, candidatePath);
  return rel === "" || (!rel.startsWith("..") && rel !== "..");
}

function assertSafePackageNameForStorage(packageName: string) {
  if (!packageName || packageName.includes("\\") || packageName.includes("..")) {
    throw new Error(`Invalid skill package name: ${packageName}`);
  }

  const parts = packageName.split("/");
  if (packageName.startsWith("@")) {
    if (parts.length !== 2 || !parts[0]?.startsWith("@") || parts[0] === "@") {
      throw new Error(`Invalid skill package name: ${packageName}`);
    }
    assertSafePathPart(parts[0], "skill package scope");
    assertSafePathPart(parts[1]!, "skill package name");
    return;
  }

  if (parts.length !== 1) {
    throw new Error(`Invalid skill package name: ${packageName}`);
  }
  assertSafePathPart(packageName, "skill package name");
}

function assertSafePackageVersion(version: string) {
  if (!isStrictSemver(version)) {
    throw new Error(`Invalid skill package version: ${version}`);
  }
}

function assertValidSkillScope(scope: string): asserts scope is BundleSkillEntry["scope"] {
  if (scope !== "shared" && scope !== "claude-only" && scope !== "codex-only" && scope !== "experimental") {
    throw new Error(`Invalid skill scope: ${scope}`);
  }
}

function assertSafeSkillName(name: string) {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Invalid skill name: ${name}`);
  }
}

export async function validateBundleManifest(
  bundleRoot: string,
  manifest: BundleManifest,
  existingSkillNames: Set<string>,
  packageName: string,
  version: string,
  options: { allowedSkillNameCollisions?: Set<string> } = {},
) {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported bundle schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.bundleName !== packageName) {
    throw new Error(`Bundle name mismatch: expected ${packageName}, got ${manifest.bundleName}`);
  }
  if (manifest.version !== version) {
    throw new Error(`Bundle version mismatch: expected ${version}, got ${manifest.version}`);
  }

  const declaredSkillIds = new Set<string>();
  for (const skill of manifest.skills) {
    if (!skill.name || !skill.scope || !skill.path) {
      throw new Error(`Invalid bundle skill entry in ${packageName}`);
    }
    if (skill.name.includes("/") || skill.name.includes("\\") || skill.name === "." || skill.name === "..") {
      throw new Error(`Invalid skill name: ${skill.name}`);
    }
    if (declaredSkillIds.has(skill.name)) {
      throw new Error(`Duplicate skill ID in ${packageName}: ${skill.name}`);
    }
    declaredSkillIds.add(skill.name);
    assertValidSkillScope(skill.scope);
    if (existingSkillNames.has(skill.name) && !options.allowedSkillNameCollisions?.has(skill.name)) {
      throw new Error(`Skill name collision: ${skill.name}`);
    }

    const skillPath = resolve(bundleRoot, skill.path);
    if (!isWithinRoot(bundleRoot, skillPath)) {
      throw new Error(`Invalid skill path outside bundle root: ${skill.path}`);
    }
    if (!existsSync(skillPath)) {
      throw new Error(`Missing skill path: ${skill.path}`);
    }
    if (!existsSync(join(skillPath, "SKILL.md"))) {
      throw new Error(`Missing SKILL.md for skill ${skill.name}`);
    }
  }
}

async function resolveActiveVersion(currentPath: string): Promise<string> {
  const stats = await lstat(currentPath);
  if (stats.isSymbolicLink()) {
    throw new DrwnError(
      "INVENTORY_PACKAGE_POINTER_INVALID",
      `Unsupported symlink "current" pointer: ${currentPath}`,
    );
  }
  if (stats.isFile()) {
    const version = (await readFile(currentPath, "utf8")).trim();
    if (!isStrictSemver(version)) {
      throw new DrwnError("INVENTORY_PACKAGE_POINTER_INVALID", `Invalid "current" version at ${currentPath}`);
    }
    return version;
  }
  throw new DrwnError("INVENTORY_PACKAGE_POINTER_INVALID", `Unsupported "current" pointer: ${currentPath}`);
}

export async function listInstalledSkillBundles(agentsDir: string): Promise<InstalledSkillBundle[]> {
  const packagesRoot = activeSkillPackagesRoot(agentsDir);
  if (!existsSync(packagesRoot)) {
    return [];
  }

  const bundles: InstalledSkillBundle[] = [];

  async function walk(dirPath: string): Promise<void> {
    const currentPath = join(dirPath, "current");
    let currentExists = false;
    try {
      await lstat(currentPath);
      currentExists = true;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (currentExists) {
      const packageName = relative(packagesRoot, dirPath).replaceAll("\\", "/");
      try {
        const activeVersion = await resolveActiveVersion(currentPath);
        const versionRoot = join(dirPath, activeVersion);
        const versionStats = await lstat(versionRoot);
        if (!versionStats.isDirectory() || versionStats.isSymbolicLink()) {
          throw new Error(`active version is not a concrete directory: ${versionRoot}`);
        }
        const manifest = await loadBundleManifest(versionRoot);
        await validateBundleManifest(versionRoot, manifest, new Set(), packageName, activeVersion);
        bundles.push({
          packageName,
          activeVersion,
          packageRoot: dirPath,
          versionRoot,
          manifest,
        });
      } catch (error) {
        if (error instanceof DrwnError) throw error;
        throw new DrwnError("INVENTORY_PACKAGE_INVALID", `Invalid standalone skill package: ${packageName}`, undefined, error);
      }
      return;
    }

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(join(dirPath, entry.name));
      }
    }
  }

  await walk(packagesRoot);
  return bundles.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export async function getInstalledSkillBundle(agentsDir: string, packageName: string) {
  const packageRoot = activeSkillPackageRoot(agentsDir, packageName);
  const currentPath = activeSkillPackageCurrentLink(agentsDir, packageName);
  if (!existsSync(packageRoot) || !existsSync(currentPath)) {
    return null;
  }

  const activeVersion = await resolveActiveVersion(currentPath);
  const versionRoot = activeSkillPackageVersionRoot(agentsDir, packageName, activeVersion);
  const manifest = await loadBundleManifest(versionRoot);
  return {
    packageName,
    activeVersion,
    packageRoot,
    versionRoot,
    manifest,
  } satisfies InstalledSkillBundle;
}

export async function hashSkillPackageDirectory(root: string): Promise<`sha256-${string}`> {
  const hash = createHash("sha256");
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true }).then((entries) => entries.sort((a, b) => a.name.localeCompare(b.name)))) {
      const path = join(current, entry.name);
      const rel = relative(root, path).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new DrwnError("INVENTORY_PACKAGE_INVALID", `Skill package contains a symlink: ${rel}`);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${rel}\0`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) hash.update(await readFile(path));
      else throw new DrwnError("INVENTORY_PACKAGE_INVALID", `Skill package contains an unsupported entry: ${rel}`);
      hash.update("\0");
    }
  }
  await walk(root);
  return `sha256-${hash.digest("hex")}`;
}

type SkillPackageOperation = "install" | "update";

interface SkillBundleCommitOptions {
  agentsDir: string;
  bundleRoot: string;
  packageName: string;
  version: string;
  existingSkillNames: Set<string>;
  existingSkills?: ExistingSkillRecord[];
  beforeCommit?: (context: {
    manifest: BundleManifest;
    integrity: `sha256-${string}`;
    previous: InstalledSkillBundle | null;
    previousIntegrity: `sha256-${string}` | null;
  }) => void | Promise<void>;
  afterCommit?: (context: {
    installed: InstalledSkillBundle;
    integrity: `sha256-${string}`;
    previous: InstalledSkillBundle | null;
    previousIntegrity: `sha256-${string}` | null;
  }) => void | Promise<void>;
  checkpoint?: (checkpoint: SkillPackageCommitCheckpoint) => void | Promise<void>;
}

function allowedPackageCollisions(options: {
  packageName: string;
  manifest: BundleManifest;
  existingSkillNames: Set<string>;
  existingSkills?: ExistingSkillRecord[];
  operation: SkillPackageOperation;
}) {
  const allowed = new Set<string>();
  for (const skill of options.manifest.skills) {
    if (!options.existingSkillNames.has(skill.name)) {
      continue;
    }
    if (options.operation !== "update") {
      continue;
    }
    const existing = options.existingSkills?.find((record) => record.name === skill.name);
    if (!existing || existing.sourceType !== "npm" || existing.sourceId !== options.packageName) {
      throw new Error(
        `Skill name collision: ${skill.name}. Update can only retain skills installed from ${options.packageName}.`,
      );
    }
    allowed.add(skill.name);
  }
  return allowed;
}

async function commitSkillBundleRoot(options: SkillBundleCommitOptions, operation: SkillPackageOperation) {
  assertSafePackageNameForStorage(options.packageName);
  assertSafePackageVersion(options.version);
  const existingPackage = await getInstalledSkillBundle(options.agentsDir, options.packageName);
  if (operation === "install" && existingPackage) {
    throw new DrwnError("INVENTORY_ITEM_ALREADY_EXISTS", `Skill package is already installed: ${options.packageName}`);
  }
  if (operation === "update" && !existingPackage) {
    throw new DrwnError("INVENTORY_ITEM_NOT_FOUND", `Skill package is not installed: ${options.packageName}`);
  }
  const manifest = await loadBundleManifest(options.bundleRoot);
  const allowedSkillNameCollisions = allowedPackageCollisions({
    packageName: options.packageName,
    manifest,
    existingSkillNames: options.existingSkillNames,
    existingSkills: options.existingSkills,
    operation,
  });
  await validateBundleManifest(
    options.bundleRoot,
    manifest,
    options.existingSkillNames,
    options.packageName,
    options.version,
    { allowedSkillNameCollisions },
  );

  const stagedIntegrity = await hashSkillPackageDirectory(options.bundleRoot);
  await flushDirectoryTree(options.bundleRoot);
  return withInventoryLock(options.agentsDir, async () => {
    assertStoreWritable();
    const lockedManifest = await loadBundleManifest(options.bundleRoot);
    const liveBundles = await listInstalledSkillBundles(options.agentsDir);
    const liveSkills: ExistingSkillRecord[] = liveBundles.flatMap((bundle) =>
      bundle.manifest.skills.map((skill) => ({ name: skill.name, sourceType: "npm" as const, sourceId: bundle.packageName }))
    );
    const livePackage = liveBundles.find((bundle) => bundle.packageName === options.packageName);
    if (operation === "install" && livePackage) {
      throw new DrwnError("INVENTORY_ITEM_ALREADY_EXISTS", `Skill package is already installed: ${options.packageName}`);
    }
    if (operation === "update" && !livePackage) {
      throw new DrwnError("INVENTORY_ITEM_NOT_FOUND", `Skill package is not installed: ${options.packageName}`);
    }
    const lockedNames = new Set([...options.existingSkillNames, ...liveSkills.map((skill) => skill.name)]);
    const allowedLockedCollisions = allowedPackageCollisions({
      packageName: options.packageName,
      manifest: lockedManifest,
      existingSkillNames: lockedNames,
      existingSkills: [...(options.existingSkills ?? []), ...liveSkills],
      operation,
    });
    await validateBundleManifest(
      options.bundleRoot,
      lockedManifest,
      lockedNames,
      options.packageName,
      options.version,
      { allowedSkillNameCollisions: allowedLockedCollisions },
    );
    if (await hashSkillPackageDirectory(options.bundleRoot) !== stagedIntegrity) {
      throw new DrwnError("INVENTORY_STAGING_CHANGED", `Staged skill package changed before commit: ${options.packageName}`);
    }
    const previousIntegrity = livePackage ? await hashSkillPackageDirectory(livePackage.versionRoot) : null;
    await options.beforeCommit?.({
      manifest: lockedManifest,
      integrity: stagedIntegrity,
      previous: livePackage ?? null,
      previousIntegrity,
    });
    if (
      operation === "update" &&
      livePackage?.activeVersion === options.version &&
      previousIntegrity === stagedIntegrity
    ) {
      await options.afterCommit?.({
        installed: livePackage,
        integrity: stagedIntegrity,
        previous: livePackage,
        previousIntegrity,
      });
      return livePackage;
    }

    const packageRoot = activeSkillPackageRoot(options.agentsDir, options.packageName);
    const versionRoot = activeSkillPackageVersionRoot(options.agentsDir, options.packageName, options.version);
    const currentPath = activeSkillPackageCurrentLink(options.agentsDir, options.packageName);
    mkdirSync(dirname(packageRoot), { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    if (existsSync(versionRoot)) {
      const existingIntegrity = await hashSkillPackageDirectory(versionRoot);
      if (existingIntegrity !== stagedIntegrity) {
        throw new DrwnError(
          "INVENTORY_IMMUTABLE_VERSION_CONFLICT",
          `Skill package ${options.packageName}@${options.version} already exists with different immutable bytes`,
        );
      }
    } else {
      await options.checkpoint?.("before-version-rename");
      await rename(options.bundleRoot, versionRoot);
      await syncDirectory(dirname(versionRoot));
      await options.checkpoint?.("after-version-rename");
    }
    await options.checkpoint?.("before-pointer-write");
    await writeAtomically(currentPath, `${options.version}\n`);
    await options.checkpoint?.("after-pointer-write");

    const installed = {
      packageName: options.packageName,
      activeVersion: options.version,
      packageRoot,
      versionRoot,
      manifest: lockedManifest,
    } satisfies InstalledSkillBundle;
    await options.afterCommit?.({
      installed,
      integrity: stagedIntegrity,
      previous: livePackage ?? null,
      previousIntegrity,
    });
    return installed;
  });
}

export function installSkillBundleRoot(options: SkillBundleCommitOptions) {
  return commitSkillBundleRoot(options, "install");
}

export function updateSkillBundleRoot(options: SkillBundleCommitOptions) {
  return commitSkillBundleRoot(options, "update");
}

export async function uninstallSkillPackage(agentsDir: string, packageName: string) {
  assertSafePackageNameForStorage(packageName);
  return withInventoryLock(agentsDir, async () => {
    assertStoreWritable();
    const installed = await getInstalledSkillBundle(agentsDir, packageName);
    if (!installed) throw new DrwnError("INVENTORY_ITEM_NOT_FOUND", `Skill package is not installed: ${packageName}`);
    const removed = await tombstoneInventoryPath({ agentsDir, kind: "skill-package", sourcePath: installed.packageRoot });
    return {
      packageName,
      activeVersion: installed.activeVersion,
      exportedSkillIds: installed.manifest.skills.map((skill) => skill.name).sort(),
      ...removed,
    };
  });
}

interface SkillPackageSourceOptions {
  agentsDir: string;
  packageSpec: string;
  existingSkillNames: Set<string>;
  existingSkills?: ExistingSkillRecord[];
  beforeCommit?: SkillBundleCommitOptions["beforeCommit"];
  afterCommit?: SkillBundleCommitOptions["afterCommit"];
}

const NPM_PACK_TIMEOUT_MS = Number(process.env.DRWN_NPM_TIMEOUT_MS ?? 30_000);

async function commitSkillPackageSource(
  options: SkillPackageSourceOptions,
  operation: SkillPackageOperation,
  expectedPackageName?: string,
) {
  const packDir = await mkdtemp(join(tmpdir(), "agents-skill-pack-"));
  const extractDir = await mkdtemp(join(tmpdir(), "agents-skill-extract-"));

  try {
    const packProc = Bun.spawn(
      [npmCommand(), "pack", options.packageSpec, "--ignore-scripts", "--json", "--pack-destination", packDir],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: process.env },
    );
    // A hung registry fetch must fail the install, never block the CLI forever.
    const packTimer = setTimeout(() => {
      try {
        packProc.kill();
      } catch {
        // The process may have already exited.
      }
    }, NPM_PACK_TIMEOUT_MS);
    const packStdout = await new Response(packProc.stdout).text();
    const packStderr = await new Response(packProc.stderr).text();
    const packExit = await packProc.exited;
    clearTimeout(packTimer);
    if (packExit !== 0) {
      throw new Error(`${packStdout}${packStderr}`.trim() || `npm pack failed for ${options.packageSpec}`);
    }

    const packed = JSON.parse(packStdout) as Array<{ name: string; version: string; filename: string }>;
    const metadata = packed[0];
    if (!metadata) {
      throw new Error(`npm pack produced no metadata for ${options.packageSpec}`);
    }
    if (expectedPackageName && metadata.name !== expectedPackageName) {
      throw new DrwnError(
        "INVENTORY_PACKAGE_IDENTITY_MISMATCH",
        `Update source package is ${metadata.name}; expected ${expectedPackageName}`,
      );
    }

    const tarballPath = join(packDir, metadata.filename);
    try {
      await extractArchive(tarballPath, extractDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || `tar extraction failed for ${tarballPath}`);
    }

    const normalizedRoot = join(extractDir, "package");
    return await (operation === "install" ? installSkillBundleRoot : updateSkillBundleRoot)({
      agentsDir: options.agentsDir,
      bundleRoot: normalizedRoot,
      packageName: metadata.name,
      version: metadata.version,
      existingSkillNames: options.existingSkillNames,
      existingSkills: options.existingSkills,
      beforeCommit: options.beforeCommit,
      afterCommit: options.afterCommit,
    });
  } finally {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
}

export function installSkillPackage(options: SkillPackageSourceOptions) {
  return commitSkillPackageSource(options, "install");
}

export function updateSkillPackage(options: SkillPackageSourceOptions & { packageName: string }) {
  return commitSkillPackageSource(options, "update", options.packageName);
}

function isLocalLookingSpec(spec: string) {
  return (
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("~/") ||
    spec.endsWith(".md") ||
    spec.endsWith(".tgz") ||
    spec.endsWith(".tar.gz")
  );
}

export function classifySkillAddInput(spec: string): SkillAddInputKind {
  if (existsSync(spec)) {
    const stats = lstatSync(spec);
    if (stats.isFile() && basename(spec) === "SKILL.md") {
      return "loose-skill";
    }
    if (stats.isDirectory()) {
      if (existsSync(join(spec, "package.json")) && existsSync(join(spec, "bundle.json"))) {
        return "package-spec";
      }
      if (existsSync(join(spec, "SKILL.md"))) {
        return "loose-skill";
      }
    }
    return "package-spec";
  }

  if (isLocalLookingSpec(spec)) {
    throw new Error(`Skill source path does not exist: ${spec}`);
  }
  return "package-spec";
}

function resolveLooseSkillRoot(sourcePath: string) {
  const path = resolve(sourcePath);
  if (!existsSync(path)) {
    throw new Error(`Skill source path does not exist: ${path}`);
  }
  const stats = lstatSync(path);
  if (stats.isFile() && basename(path) === "SKILL.md") {
    return { root: dirname(path), skillMd: path, inputKind: "skill-file" as const };
  }
  if (stats.isDirectory() && existsSync(join(path, "SKILL.md"))) {
    return { root: path, skillMd: join(path, "SKILL.md"), inputKind: "skill-dir" as const };
  }
  throw new Error(`Skill source must be a SKILL.md file or a directory containing SKILL.md: ${path}`);
}

function parseScalar(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}\\s*:\\s*(.*)$`, "m"));
  if (!match) {
    return undefined;
  }
  const raw = match[1]?.trim() ?? "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseSkillFrontmatter(skillMdContent: string): { name?: string; description?: string; start?: number; end?: number } {
  const match = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }
  const frontmatter = match[1] ?? "";
  return {
    name: parseScalar(frontmatter, "name"),
    description: parseScalar(frontmatter, "description"),
    start: 0,
    end: match[0].length,
  };
}

function normalizeSkillMdName(content: string, skillName: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) {
    return {
      content: `---\nname: ${skillName}\n---\n\n${content}`,
      rewritten: true,
    };
  }

  const frontmatter = match[1] ?? "";
  const parsedName = parseScalar(frontmatter, "name");
  if (parsedName === skillName) {
    return { content, rewritten: false };
  }

  const lines = frontmatter.split(/\r?\n/);
  const nameIndex = lines.findIndex((line) => /^name\s*:/.test(line));
  if (nameIndex === -1) {
    lines.unshift(`name: ${skillName}`);
  } else {
    lines[nameIndex] = `name: ${skillName}`;
  }
  const suffix = match[2] ?? "\n";
  return {
    content: `---\n${lines.join("\n")}\n---${suffix}${content.slice(match[0].length)}`,
    rewritten: true,
  };
}

async function copyLooseSkillSnapshot(sourceRoot: string, destinationRoot: string): Promise<void> {
  const stats = await lstat(sourceRoot);
  if (stats.isSymbolicLink()) {
    throw new Error(`Loose skill source contains unsupported symlink: ${sourceRoot}`);
  }
  if (stats.isDirectory()) {
    await mkdir(destinationRoot, { recursive: true });
    for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
      await copyLooseSkillSnapshot(join(sourceRoot, entry.name), join(destinationRoot, entry.name));
    }
    return;
  }
  if (!stats.isFile()) {
    throw new Error(`Loose skill source contains unsupported filesystem entry: ${sourceRoot}`);
  }
  await mkdir(dirname(destinationRoot), { recursive: true });
  await writeFile(destinationRoot, await readFile(sourceRoot));
}

function defaultSyntheticPackageName(skillName: string) {
  return `@local/${skillName}`;
}

interface LooseSkillSourceOptions {
  agentsDir: string;
  sourcePath: string;
  existingSkillNames: Set<string>;
  existingSkills?: ExistingSkillRecord[];
  as?: string;
  scope?: BundleSkillEntry["scope"];
  packageName?: string;
  version?: string;
  beforeCommit?: SkillBundleCommitOptions["beforeCommit"];
  afterCommit?: SkillBundleCommitOptions["afterCommit"];
}

async function commitLooseSkillSource(options: LooseSkillSourceOptions, operation: SkillPackageOperation) {
  const loose = resolveLooseSkillRoot(options.sourcePath);
  const sourceContent = await readFile(loose.skillMd, "utf8");
  const parsed = parseSkillFrontmatter(sourceContent);
  const skillName = options.as ?? parsed.name;
  if (!skillName) {
    throw new Error(`SKILL.md frontmatter is missing name; pass --as <skillName> for ${loose.skillMd}`);
  }
  assertSafeSkillName(skillName);

  const scope = options.scope ?? "shared";
  assertValidSkillScope(scope);
  const version = options.version ?? "0.1.0";
  const packageName = options.packageName ?? defaultSyntheticPackageName(skillName);
  assertSafePackageNameForStorage(packageName);
  assertSafePackageVersion(version);

  const tempRoot = await mkdtemp(join(tmpdir(), "agents-loose-skill-"));
  const bundleRoot = join(tempRoot, "bundle");
  try {
    const skillRelativePath = join("skills", scope, skillName);
    const skillDestination = join(bundleRoot, skillRelativePath);
    await copyLooseSkillSnapshot(loose.root, skillDestination);
    const normalized = normalizeSkillMdName(await readFile(join(skillDestination, "SKILL.md"), "utf8"), skillName);
    if (normalized.rewritten) {
      await writeFile(join(skillDestination, "SKILL.md"), normalized.content);
    }

    await writeFile(
      join(bundleRoot, "package.json"),
      `${JSON.stringify(
        {
          name: packageName,
          version,
          private: true,
          description: `Local drwn synthetic bundle for ${skillName}.`,
          files: ["skills", "bundle.json", "README.md"],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(bundleRoot, "bundle.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          bundleName: packageName,
          displayName: skillName,
          description: parsed.description ?? "Imported from local SKILL.md",
          version,
          skills: [{ name: skillName, scope, path: skillRelativePath.replaceAll("\\", "/") }],
        } satisfies BundleManifest,
        null,
        2,
      )}\n`,
    );
    await writeFile(join(bundleRoot, "README.md"), `# ${skillName}\n\nManaged standalone skill package.\n`);

    const installed = await (operation === "install" ? installSkillBundleRoot : updateSkillBundleRoot)({
      agentsDir: options.agentsDir,
      bundleRoot,
      packageName,
      version,
      existingSkillNames: options.existingSkillNames,
      existingSkills: options.existingSkills,
      beforeCommit: options.beforeCommit,
      afterCommit: options.afterCommit,
    });
    return {
      ...installed,
      inputKind: "loose-skill" as const,
      skillName,
      sourcePath: resolve(options.sourcePath),
      frontmatterRewritten: normalized.rewritten,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function installLooseSkill(options: LooseSkillSourceOptions) {
  return commitLooseSkillSource(options, "install");
}

export function updateLooseSkill(options: LooseSkillSourceOptions) {
  return commitLooseSkillSource(options, "update");
}
