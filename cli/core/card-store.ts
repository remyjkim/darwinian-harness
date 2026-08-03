// ABOUTME: Manages local Card sources, immutable published versions, and resolution.
// ABOUTME: Centralizes card store layout so authoring and project commands share behavior.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertValidCardManifest, isCardScopeName, isCardUnscopedName, type CardManifest } from "./card-manifest";
import { bumpOverrideConfigKey, assertSemverBumpMatchesClassification } from "./card-publish-guardrail";
import { diffCards } from "./card-diff";
import { computeIntegrityFromDir } from "./content-manifest";
import { computeHookPolicyDigest } from "./hook-consent-ack";
import { resolveManifestInstructionContribution } from "./instruction-contribution";
import type { CardLockEntry, CardOrigin, GitLockInfo } from "./card-lock";
import { compareVersions, gt, isStrictSemver, maxSatisfying, validRange } from "./semver-utils";
import { writeAtomically } from "./fs";
import { createEmptyMachineConfig, initializeMachineConfig, readMachineConfigFile, writeMachineConfigFile } from "./machine-config";
import * as git from "./git";
import { readCardMeta, readDeprecationMapFromMeta, writeCardMeta } from "./card-meta";
import { DrwnError } from "./errors";
import { parseUpstreamRef } from "./git-ref";
import { readUrlCardName, writeUrlCardName } from "./url-card-map";
import { assertSourceTrusted, loadEffectiveTrustedSourcesPolicy } from "./trusted-sources";
import {
  assertStoreWritable,
  resolveCardBareRepoPath,
  resolveCardsRoot,
  resolveCatalogsDir,
  resolveExtractedPath,
  resolveExtractedRoot,
  resolveMachineConfigPath,
  resolveStoreGeneratedDir,
  resolveStoreMcpServersDir,
  resolveStoreMetadataPath,
  resolveStoreRoot,
  resolveStoreSkillsRoot,
  splitCardName,
} from "./store-paths";
import type { MachineConfig, StoreMetadata } from "./types";

export interface ParsedCardRef {
  origin: CardOrigin;
  name: string;
  range: string;
  filePath?: string;
  gitUrl?: string;
  gitRef?: string;
  gitRange?: string;
  gitSubpath?: string;
  original: string;
}

export interface ResolvedCard {
  name: string;
  requested: string;
  version: string;
  dir: string;
  integrity: string;
  manifest: CardManifest;
  origin: CardOrigin;
  treeSha?: string;
  git?: GitLockInfo;
}

export interface ResolveCardOptions {
  allowUntrustedSource?: boolean;
  acceptSuccessor?: boolean;
  repoRoot?: string;
  cwd?: string;
}

export interface CardPackageIndexVersion {
  version: string;
  publishedAt: string;
  integrity: string;
  deprecated?: string;
}

export interface CardPackageIndex {
  name: string;
  versions: CardPackageIndexVersion[];
}

export interface PublishCardOptions {
  forceBumpMismatch?: boolean;
}

export interface ConsentImpact {
  hooks: { changed: boolean; from?: string; to?: string };
  instructions: { changed: boolean; from?: string; to?: string };
  skills: { changed: boolean; fromCount: number; toCount: number };
  servers: { changed: boolean };
}

async function computeConsentImpact(
  previousManifest: CardManifest,
  previousDir: string,
  newManifest: CardManifest,
  newDir: string,
  diff: { changes: { kind: string; path: string }[] },
): Promise<ConsentImpact> {
  // Hook policy content digest
  const prevHookPolicies = previousManifest.hooks?.include ?? [];
  const newHookPolicies = newManifest.hooks?.include ?? [];
  let hooksChanged = false;
  let hookFrom: string | undefined;
  let hookTo: string | undefined;
  if (prevHookPolicies.length > 0 || newHookPolicies.length > 0) {
    const prevPseudo: CardLockEntry = {
      name: previousManifest.name,
      version: previousManifest.version,
      requested: `${previousManifest.name}@${previousManifest.version}`,
      path: previousDir,
      integrity: "",
      manifest: previousManifest,
      skills: [],
      hooks: prevHookPolicies,
    } as unknown as CardLockEntry;
    const newPseudo: CardLockEntry = {
      name: newManifest.name,
      version: newManifest.version,
      requested: `${newManifest.name}@${newManifest.version}`,
      path: newDir,
      integrity: "",
      manifest: newManifest,
      skills: [],
      hooks: newHookPolicies,
    } as unknown as CardLockEntry;
    hookFrom = prevHookPolicies.length > 0 ? await computeHookPolicyDigest(prevPseudo, previousDir) : undefined;
    hookTo = newHookPolicies.length > 0 ? await computeHookPolicyDigest(newPseudo, newDir) : undefined;
    hooksChanged = hookFrom !== hookTo;
  }

  // Instruction content digest
  const prevInstr = resolveManifestInstructionContribution(previousManifest, previousDir);
  const newInstr = resolveManifestInstructionContribution(newManifest, newDir);
  const instructionsChanged =
    (!!prevInstr || !!newInstr) && (prevInstr?.contentDigest ?? "") !== (newInstr?.contentDigest ?? "");

  // Skill set change (from diffCards — name-set only)
  const skillsChanged = diff.changes.some((c) => c.path.startsWith("skills.include."));

  // Server set change (from diffCards — key-set only)
  const serversChanged = diff.changes.some((c) => c.path.startsWith("servers."));

  return {
    hooks: { changed: hooksChanged, from: hookFrom, to: hookTo },
    instructions: {
      changed: instructionsChanged,
      from: prevInstr?.contentDigest,
      to: newInstr?.contentDigest,
    },
    skills: {
      changed: skillsChanged,
      fromCount: previousManifest.skills?.include?.length ?? 0,
      toCount: newManifest.skills?.include?.length ?? 0,
    },
    servers: { changed: serversChanged },
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function writeJson(pathValue: string, value: unknown) {
  await writeAtomically(pathValue, `${JSON.stringify(value, null, 2)}\n`);
}

export async function ensureStoreInitialized(agentsDir: string) {
  const storeRoot = resolveStoreRoot(agentsDir);
  const seedPath = process.env.DRWN_STORE_SEED_PATH;
  if (seedPath && existsSync(seedPath)) {
    const { isStoreMissingOrEmpty, seedStore } = await import("./store-seed");
    if (await isStoreMissingOrEmpty(storeRoot)) {
      const kind = statSync(seedPath).isDirectory() ? "dir" : "tar";
      await seedStore({
        agentsDir,
        source: { kind, path: seedPath },
        allowReadonlySeed: true,
      });
      return;
    }
  }
  mkdirSync(storeRoot, { recursive: true });
  for (const pathValue of [
    resolveCardsRoot(agentsDir),
    resolveStoreSkillsRoot(agentsDir),
    resolveStoreMcpServersDir(agentsDir),
    resolveStoreGeneratedDir(agentsDir),
    resolveExtractedRoot(agentsDir),
    resolveCatalogsDir(agentsDir),
  ]) {
    mkdirSync(pathValue, { recursive: true });
  }

  const metadataPath = resolveStoreMetadataPath(agentsDir);
  if (!existsSync(metadataPath)) {
    await writeJson(metadataPath, { schemaVersion: 1, initAt: nowIso() } satisfies StoreMetadata);
  }
  const machinePath = resolveMachineConfigPath(agentsDir);
  await initializeMachineConfig(machinePath);
}

export async function readMachineConfig(agentsDir: string): Promise<MachineConfig> {
  return (await readMachineConfigFile(resolveMachineConfigPath(agentsDir))) ?? createEmptyMachineConfig();
}

export async function writeMachineConfig(agentsDir: string, config: MachineConfig) {
  assertStoreWritable();
  await ensureStoreInitialized(agentsDir);
  await writeMachineConfigFile(resolveMachineConfigPath(agentsDir), config);
}

export function normalizeCardName(name: string, scope?: string) {
  if (isCardScopeName(name)) {
    return name;
  }
  if (!isCardUnscopedName(name)) {
    throw new Error(`Invalid card name: ${name}`);
  }
  if (!scope) {
    return name;
  }
  if (!/^@[a-z0-9-]+$/.test(scope)) {
    throw new Error(`Invalid card scope: ${scope}`);
  }
  return `${scope}/${name}`;
}

export function parseCardRef(ref: string): ParsedCardRef {
  if (ref.startsWith("file:")) {
    return { origin: "file", name: ref, range: "*", filePath: ref.slice("file:".length), original: ref };
  }
  if (ref.startsWith("git+")) {
    return parseGitCardRef(ref, ref.slice("git+".length));
  }
  if (ref.startsWith("github:")) {
    return parseGitHostShorthand(ref, "github:", "https://github.com");
  }
  if (ref.startsWith("gitlab:")) {
    return parseGitHostShorthand(ref, "gitlab:", "https://gitlab.com");
  }
  const slashIndex = ref.indexOf("/");
  const rangeMarker = ref.lastIndexOf("@");
  if (ref.startsWith("@") && slashIndex !== -1 && rangeMarker > slashIndex) {
    return { origin: "store", name: ref.slice(0, rangeMarker), range: ref.slice(rangeMarker + 1), original: ref };
  }
  if (!ref.startsWith("@") && rangeMarker > 0) {
    return { origin: "store", name: ref.slice(0, rangeMarker), range: ref.slice(rangeMarker + 1), original: ref };
  }
  return { origin: "store", name: ref, range: "*", original: ref };
}

function parseGitCardRef(original: string, body: string): ParsedCardRef {
  if (!body) {
    throw new Error("git ref requires git URL");
  }
  const hashIndex = body.indexOf("#");
  if (hashIndex !== -1) {
    const gitUrl = body.slice(0, hashIndex);
    const gitRef = body.slice(hashIndex + 1);
    if (!gitUrl) throw new Error("git ref requires git URL");
    if (!gitRef) throw new Error("git ref requires #ref");
    return { origin: "git", name: "", range: "*", gitUrl, gitRef, original };
  }

  const rangeMarker = lastGitRangeMarker(body);
  if (rangeMarker !== -1) {
    const gitUrl = body.slice(0, rangeMarker);
    const gitRange = body.slice(rangeMarker + 1);
    if (!gitUrl) throw new Error("git ref requires git URL");
    if (!gitRange) throw new Error("git ref requires @range");
    return { origin: "git", name: "", range: gitRange, gitUrl, gitRange, original };
  }

  throw new Error("git ref requires #ref or @range");
}

function parseGitHostShorthand(original: string, prefix: "github:" | "gitlab:", baseUrl: string): ParsedCardRef {
  const body = original.slice(prefix.length);
  const marker = body.includes("#") ? body.indexOf("#") : body.lastIndexOf("@");
  if (marker === -1) {
    throw new Error(`${prefix} refs requires #ref or @range`);
  }
  const repo = body.slice(0, marker);
  const selector = body.slice(marker + 1);
  if (!/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error(`${prefix} refs require owner/repo`);
  }
  if (!selector) {
    throw new Error(`${prefix} refs requires #ref or @range`);
  }
  const gitUrl = `${baseUrl}/${repo}.git`;
  if (body[marker] === "#") {
    return { origin: "git", name: "", range: "*", gitUrl, gitRef: selector, original };
  }
  return { origin: "git", name: "", range: selector, gitUrl, gitRange: selector, original };
}

function lastGitRangeMarker(value: string) {
  const rangeMarker = value.lastIndexOf("@");
  if (rangeMarker === -1) {
    return -1;
  }
  const lastSlash = Math.max(value.lastIndexOf("/"), value.lastIndexOf(":"));
  return rangeMarker > lastSlash ? rangeMarker : -1;
}

export function formatCardSpec(name: string, range: string) {
  return range === "*" ? name : `${name}@${range}`;
}

export function cardNamesEqual(refOrName: string, name: string) {
  return parseCardRef(refOrName).name === name;
}

export async function createCardSource(options: {
  sourceDir: string;
  name: string;
  scope?: string;
  noGit?: boolean;
  kind?: "card" | "blueprint";
}) {
  assertStoreWritable();
  if (isCardUnscopedName(options.name) && !options.scope) {
    throw new Error("Unscoped card names require --scope or machine authoring.scope");
  }
  const fullName = normalizeCardName(options.name, options.scope);
  const sourceDir = resolve(options.sourceDir);
  if (existsSync(join(sourceDir, "card.json"))) {
    throw new Error(`Card source already exists: ${fullName}`);
  }
  mkdirSync(sourceDir, { recursive: true });
  const manifest: CardManifest =
    options.kind === "blueprint"
      ? { name: fullName, version: "1.0.0", kind: "blueprint", composedFrom: [], description: "" }
      : { name: fullName, version: "1.0.0", description: "" };
  if (options.kind !== "blueprint") {
    mkdirSync(join(sourceDir, "skills"), { recursive: true });
    mkdirSync(join(sourceDir, "mcp-servers"), { recursive: true });
  }
  await writeJson(join(sourceDir, "card.json"), manifest);
  if (!options.noGit) {
    try {
      await git.runGit(["init"], { cwd: sourceDir });
    } catch {
      // Git initialization is best-effort; card files are still usable without it.
    }
  }
  return { name: fullName, sourceDir, manifestPath: join(sourceDir, "card.json") };
}

export async function readCardSourceManifest(sourceInput: string): Promise<CardManifest> {
  const sourceDir = resolve(sourceInput);
  const manifestPath = join(sourceDir, "card.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Card source not found: ${sourceDir}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
  assertValidCardManifest(manifest);
  return manifest;
}

export async function readPublishedCardManifest(agentsDir: string, name: string, version: string): Promise<CardManifest> {
  return (await resolveFromStore(agentsDir, {
    origin: "store",
    name,
    range: version,
    original: formatCardSpec(name, version),
  })).manifest;
}

export async function computeCardIntegrity(versionDir: string) {
  return computeIntegrityFromDir(versionDir);
}

function validatePublishedSkillDirs(versionDir: string, manifest: CardManifest) {
  for (const skillName of manifest.skills?.include ?? []) {
    const skillDir = join(versionDir, "skills", skillName);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillDir)) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing required skill directory '${skillName}'. The card must be republished from a complete source.`,
      );
    }
    if (!existsSync(skillMd)) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing SKILL.md for required skill '${skillName}'. The card must be republished from a complete source.`,
      );
    }
  }
}

function validatePublishedHookDirs(versionDir: string, manifest: CardManifest) {
  for (const policyName of manifest.hooks?.include ?? []) {
    const hookDir = join(versionDir, "hooks", policyName);
    const policyTs = join(hookDir, "policy.ts");
    if (!existsSync(hookDir)) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing hook directory '${policyName}'. Expected: ${hookDir}`,
      );
    }
    if (!existsSync(policyTs)) {
      throw new Error(
        `Card ${manifest.name}@${manifest.version} is missing policy.ts for hook '${policyName}'. Expected: ${policyTs}`,
      );
    }
  }
}

// Memory layers carry no published entries; memory content is DB-native and never validated here.
function validatePublishedMindContentDirs(versionDir: string, manifest: CardManifest) {
  for (const entry of manifest.persona?.include ?? []) {
    const dir = join(versionDir, "persona", entry);
    const file = join(dir, "PERSONA.md");
    if (!existsSync(dir)) {
      throw new Error(`Card ${manifest.name}@${manifest.version} is missing persona directory '${entry}'. Expected: ${dir}`);
    }
    if (!existsSync(file)) {
      throw new Error(`Card ${manifest.name}@${manifest.version} is missing PERSONA.md for persona '${entry}'. Expected: ${file}`);
    }
  }

  for (const entry of manifest.beliefs?.include ?? []) {
    const dir = join(versionDir, "beliefs", entry);
    const file = join(dir, "BELIEF.md");
    if (!existsSync(dir)) {
      throw new Error(`Card ${manifest.name}@${manifest.version} is missing belief directory '${entry}'. Expected: ${dir}`);
    }
    if (!existsSync(file)) {
      throw new Error(`Card ${manifest.name}@${manifest.version} is missing BELIEF.md for belief '${entry}'. Expected: ${file}`);
    }
  }
}

export async function ensureExtracted(agentsDir: string, barePath: string, treeSha: string): Promise<string> {
  const extractedDir = resolveExtractedPath(agentsDir, treeSha);
  if (existsSync(extractedDir)) {
    return extractedDir;
  }
  assertStoreWritable();
  const tempDir = `${extractedDir}.tmp.${randomBytes(8).toString("hex")}`;
  await rm(tempDir, { recursive: true, force: true });
  await git.extractTreeToDir(barePath, treeSha, tempDir);
  await mkdir(dirname(extractedDir), { recursive: true });
  try {
    await rename(tempDir, extractedDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (existsSync(extractedDir) && (code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM")) {
      await rm(tempDir, { recursive: true, force: true });
      return extractedDir;
    }
    throw error;
  }
  await chmodExtractedFilesReadOnly(extractedDir);
  return extractedDir;
}

async function chmodExtractedFilesReadOnly(rootDir: string) {
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (entry.isFile()) {
        await chmod(abs, 0o444);
      }
    }
  }
  await walk(rootDir);
}

async function readManifestFromDir(dir: string): Promise<CardManifest> {
  const manifestPath = join(dir, "card.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Card is missing card.json: ${dir}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
  assertValidCardManifest(manifest);
  return manifest;
}

async function readHistoricalManifestForDiff(
  agentsDir: string,
  name: string,
  version: string,
): Promise<{ manifest: CardManifest; dir: string }> {
  const barePath = resolveCardBareRepoPath(agentsDir, name);
  const commit = await git.revParse(barePath, `refs/tags/v${version}^{commit}`);
  const treeSha = await git.getCommitTree(barePath, commit);
  const dir = await ensureExtracted(agentsDir, barePath, treeSha);
  const manifestPath = join(dir, "card.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Card is missing card.json: ${dir}`);
  }
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Historical Card manifest is not an object: ${name}@${version}`);
  }
  const manifest = parsed as CardManifest;
  if (manifest.name !== name) {
    throw new DrwnError("CARD_NAME_MISMATCH", `expected ${name}, got ${String(manifest.name)}`);
  }
  if (manifest.version !== version) {
    throw new Error(`Historical Card version mismatch: expected ${version}, got ${String(manifest.version)}`);
  }
  return { manifest, dir };
}

async function revParseOptional(repoPath: string, ref: string): Promise<string | null> {
  try {
    return await git.revParse(repoPath, ref);
  } catch (error) {
    if (error instanceof git.GitRefNotFoundError) {
      return null;
    }
    throw error;
  }
}

function versionsFromTags(tags: string[]) {
  return tags
    .filter((tag) => /^v\d/.test(tag))
    .map((tag) => tag.slice(1))
    .filter(isStrictSemver)
    .sort(compareVersions);
}

function selectVersion(versions: string[], range: string, label: string) {
  if (!validRange(range) && !isStrictSemver(range)) {
    throw new Error(`Invalid card version range: ${label}`);
  }
  return maxSatisfying(versions, range) ?? (versions.includes(range) ? range : null);
}

async function resolveFromStore(agentsDir: string, parsed: ParsedCardRef): Promise<ResolvedCard> {
  const barePath = resolveCardBareRepoPath(agentsDir, parsed.name);
  if (!existsSync(barePath)) {
    throw new DrwnError("CARD_NOT_FOUND", `card not in local store: ${parsed.name}`);
  }
  const versions = await listPublishedVersions(agentsDir, parsed.name);
  const range = parsed.range || "*";
  const version = selectVersion(versions, range, parsed.original);
  if (!version) {
    throw new DrwnError(
      "CARD_NO_MATCHING_VERSION",
      `no version of ${parsed.name} matches ${range}; available: ${versions.join(", ")}`,
    );
  }
  return await resolveRepoVersion({
    agentsDir,
    barePath,
    name: parsed.name,
    requested: parsed.original,
    version,
    origin: "store",
    git: { commit: await git.revParse(barePath, `refs/tags/v${version}^{commit}`) },
  });
}

async function resolveFromGit(agentsDir: string, parsed: ParsedCardRef): Promise<ResolvedCard> {
  if (!parsed.gitUrl) {
    throw new Error("git ref requires git URL");
  }
  const existing = await findBareRepoByOriginUrl(agentsDir, parsed.gitUrl);
  if (existing) {
    await git.fetch(existing.path, "origin", [
      "refs/heads/*:refs/heads/*",
      "refs/tags/*:refs/tags/*",
      "+refs/meta/*:refs/meta/*",
    ]);
    const resolved = await resolveGitRepoAtParsedRef(agentsDir, existing.path, parsed, existing.name);
    await writeUrlCardName(agentsDir, parsed.gitUrl, resolved.name);
    return resolved;
  }

  const cached = await readUrlCardName(agentsDir, parsed.gitUrl);
  if (cached) {
    const resolved = await tryResolveFromCachedGitName(agentsDir, parsed, cached.name);
    if (resolved) {
      return resolved;
    }
  }

  const tempRepo = join(resolveCardsRoot(agentsDir), `.tmp-${randomBytes(8).toString("hex")}.git`);
  await rm(tempRepo, { recursive: true, force: true });
  await git.cloneBare(parsed.gitUrl, tempRepo);
  try {
    const discovered = await resolveGitRepoAtParsedRef(agentsDir, tempRepo, parsed, null);
    const targetPath = resolveCardBareRepoPath(agentsDir, discovered.name);
    if (existsSync(targetPath)) {
      const existingOrigin = await git.configGet(targetPath, "drwn.originUrl");
      if (existingOrigin !== parsed.gitUrl) {
        throw new DrwnError(
          "CARD_NAME_COLLISION",
          `${discovered.name} is already bound to ${existingOrigin ?? "a local store repo"}; cannot bind ${parsed.gitUrl}`,
        );
      }
      await rm(tempRepo, { recursive: true, force: true });
    } else {
      await mkdir(dirname(targetPath), { recursive: true });
      await rename(tempRepo, targetPath);
    }
    await git.configSet(targetPath, "drwn.cardName", discovered.name);
    await git.configSet(targetPath, "drwn.originUrl", parsed.gitUrl);
    await writeUrlCardName(agentsDir, parsed.gitUrl, discovered.name);
    return { ...discovered, git: { ...discovered.git!, url: parsed.gitUrl } };
  } catch (error) {
    await rm(tempRepo, { recursive: true, force: true });
    throw error;
  }
}

async function tryResolveFromCachedGitName(
  agentsDir: string,
  parsed: ParsedCardRef,
  cachedName: string,
): Promise<ResolvedCard | null> {
  if (!parsed.gitUrl) {
    throw new Error("git ref requires git URL");
  }
  const targetPath = resolveCardBareRepoPath(agentsDir, cachedName);
  if (existsSync(targetPath)) {
    const existingOrigin = await git.configGet(targetPath, "drwn.originUrl");
    if (existingOrigin !== parsed.gitUrl) {
      throw new DrwnError(
        "CARD_NAME_COLLISION",
        `${cachedName} is already bound to ${existingOrigin ?? "a local store repo"}; cannot bind ${parsed.gitUrl}`,
      );
    }
    await git.fetch(targetPath, "origin", [
      "refs/heads/*:refs/heads/*",
      "refs/tags/*:refs/tags/*",
      "+refs/meta/*:refs/meta/*",
    ]);
    const resolved = await resolveGitRepoAtParsedRef(agentsDir, targetPath, parsed, cachedName);
    await writeUrlCardName(agentsDir, parsed.gitUrl, resolved.name);
    return { ...resolved, git: { ...resolved.git!, url: parsed.gitUrl } };
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await git.cloneBare(parsed.gitUrl, targetPath);
  try {
    const resolved = await resolveGitRepoAtParsedRef(agentsDir, targetPath, parsed, cachedName);
    await git.configSet(targetPath, "drwn.cardName", resolved.name);
    await git.configSet(targetPath, "drwn.originUrl", parsed.gitUrl);
    await writeUrlCardName(agentsDir, parsed.gitUrl, resolved.name);
    return { ...resolved, git: { ...resolved.git!, url: parsed.gitUrl } };
  } catch (error) {
    await rm(targetPath, { recursive: true, force: true });
    if (error instanceof DrwnError && error.code === "CARD_NAME_MISMATCH") {
      return null;
    }
    throw error;
  }
}

async function resolveGitRepoAtParsedRef(
  agentsDir: string,
  barePath: string,
  parsed: ParsedCardRef,
  expectedName: string | null,
): Promise<ResolvedCard> {
  const versions = versionsFromTags(await git.listTags(barePath));
  const version = parsed.gitRange
    ? selectVersion(versions, parsed.gitRange, parsed.original)
    : null;
  const ref = parsed.gitRef ?? (version ? `v${version}` : null);
  if (!ref) {
    throw new DrwnError("CARD_NO_MATCHING_VERSION", `no version matches ${parsed.gitRange ?? parsed.original}`);
  }
  const commit = await git.revParse(barePath, `${ref}^{commit}`);
  const resolved = await resolveRepoVersion({
    agentsDir,
    barePath,
    name: expectedName ?? "",
    requested: parsed.original,
    version,
    origin: "git",
    git: { url: parsed.gitUrl, ref: parsed.gitRef ?? parsed.gitRange, commit },
  });
  if (expectedName && resolved.name !== expectedName) {
    throw new DrwnError("CARD_NAME_MISMATCH", `expected ${expectedName}, got ${resolved.name}`);
  }
  return resolved;
}

async function resolveRepoVersion(options: {
  agentsDir: string;
  barePath: string;
  name: string;
  requested: string;
  version: string | null;
  origin: "store" | "git";
  git: GitLockInfo;
}): Promise<ResolvedCard> {
  const treeSha = await git.getCommitTree(options.barePath, options.git.commit);
  const dir = await ensureExtracted(options.agentsDir, options.barePath, treeSha);
  const manifest = await readManifestFromDir(dir);
  if (options.name && manifest.name !== options.name) {
    throw new DrwnError("CARD_NAME_MISMATCH", `expected ${options.name}, got ${manifest.name}`);
  }
  validatePublishedSkillDirs(dir, manifest);
  validatePublishedHookDirs(dir, manifest);
  return {
    name: manifest.name,
    requested: options.requested,
    version: options.version ?? manifest.version,
    dir,
    integrity: await computeCardIntegrity(dir),
    manifest,
    origin: options.origin,
    treeSha,
    git: options.git,
  };
}

async function findBareRepoByOriginUrl(agentsDir: string, url: string) {
  for (const repo of await listBareRepos(agentsDir)) {
    try {
      if ((await git.configGet(repo.path, "drwn.originUrl")) === url) {
        return repo;
      }
    } catch {
      // Ignore malformed repos while scanning; direct resolution will surface errors.
    }
  }
  return null;
}

async function listBareRepos(agentsDir: string): Promise<Array<{ name: string; path: string }>> {
  const root = resolveCardsRoot(agentsDir);
  if (!existsSync(root)) {
    return [];
  }
  const repos: Array<{ name: string; path: string }> = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopeDir = join(root, entry.name);
      for (const cardEntry of await readdir(scopeDir, { withFileTypes: true })) {
        if (cardEntry.name.endsWith(".git") && cardEntry.isDirectory()) {
          repos.push({
            name: `${entry.name}/${cardEntry.name.slice(0, -".git".length)}`,
            path: join(scopeDir, cardEntry.name),
          });
        }
      }
      continue;
    }
    if (entry.name.endsWith(".git") && entry.isDirectory()) {
      repos.push({ name: entry.name.slice(0, -".git".length), path: join(root, entry.name) });
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export async function publishCard(agentsDir: string, sourceInput: string, options: PublishCardOptions = {}) {
  assertStoreWritable();
  await ensureStoreInitialized(agentsDir);
  const sourceDir = resolve(sourceInput);
  const manifest = await readCardSourceManifest(sourceDir);
  for (const [skillName, upstreamRef] of Object.entries(manifest.skills?.upstream ?? {})) {
    try {
      parseUpstreamRef(upstreamRef);
    } catch (error) {
      if (error instanceof DrwnError && error.code === "UPSTREAM_LOCAL_PATH_REJECTED") {
        throw new DrwnError(
          "UPSTREAM_LOCAL_PATH_REJECTED",
          `cannot publish ${manifest.name}: skills.upstream.${skillName} uses a local path`,
        );
      }
      throw error;
    }
  }
  for (const skillName of manifest.skills?.include ?? []) {
    const skillDir = join(sourceDir, "skills", skillName);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillDir)) {
      throw new Error(
        `Card source is missing skill directory '${skillName}' declared in skills.include. Expected: ${skillDir}`,
      );
    }
    if (!existsSync(skillMd)) {
      throw new Error(`Card source skill '${skillName}' is missing SKILL.md. Expected: ${skillMd}`);
    }
  }
  validatePublishedHookDirs(sourceDir, manifest);
  validatePublishedMindContentDirs(sourceDir, manifest);
  const packagePath = join(sourceDir, "package.json");
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string; version?: string };
    if (packageJson.name !== manifest.name) {
      throw new Error(`package.json.name must equal card.json name: ${manifest.name}`);
    }
    if (packageJson.version !== manifest.version) {
      throw new Error(`package.json.version must equal card.json version: ${manifest.version}`);
    }
  }
  const barePath = resolveCardBareRepoPath(agentsDir, manifest.name);
  const tag = `v${manifest.version}`;
  if (!existsSync(barePath)) {
    await git.initBare(barePath);
    await git.configSet(barePath, "drwn.cardName", manifest.name);
  }
  const tags = await git.listTags(barePath);
  if (tags.includes(tag)) {
    throw new Error(`Card version already exists: ${manifest.name}@${manifest.version}`);
  }
  const existingVersions = versionsFromTags(tags);
  const previousVersion = existingVersions.at(-1);
  let consentImpact: ConsentImpact | undefined;
  if (previousVersion) {
    // Historical tags are immutable diff inputs and may predate the current schema.
    // The new source above remains fully validated before this compatibility read.
    const { manifest: previousManifest, dir: previousDir } = await readHistoricalManifestForDiff(
      agentsDir,
      manifest.name,
      previousVersion,
    );
    const diff = diffCards(previousManifest, manifest);
    const classification = diff.classification;
    if (!options.forceBumpMismatch) {
      assertSemverBumpMatchesClassification({
        previousVersion,
        nextVersion: manifest.version,
        classification,
      });
    } else {
      await git.configSet(barePath, bumpOverrideConfigKey(manifest.version), classification);
    }
    consentImpact = await computeConsentImpact(previousManifest, previousDir, manifest, sourceDir, diff);
  }

  const treeSha = await git.writeTreeFromDir(barePath, sourceDir);
  const versionDir = await ensureExtracted(agentsDir, barePath, treeSha);
  validatePublishedSkillDirs(versionDir, manifest);
  validatePublishedHookDirs(versionDir, manifest);
  validatePublishedMindContentDirs(versionDir, manifest);
  const integrity = await computeCardIntegrity(versionDir);
  const parent = await revParseOptional(barePath, "refs/heads/main");
  const commit = await git.commitTree(
    barePath,
    treeSha,
    parent,
    `Publish ${manifest.name}@${manifest.version}\n\nIntegrity: ${integrity}`,
  );
  await git.updateRef(barePath, "refs/heads/main", commit);
  await git.createAnnotatedTag(barePath, tag, commit, `Publish ${manifest.name}@${manifest.version}`);
  return { name: manifest.name, version: manifest.version, versionDir, integrity, manifest, git: { commit }, consentImpact };
}

async function listPublishedVersions(agentsDir: string, name: string) {
  const barePath = resolveCardBareRepoPath(agentsDir, name);
  if (!existsSync(barePath)) {
    return [];
  }
  return versionsFromTags(await git.listTags(barePath));
}

export async function resolveCard(agentsDir: string, ref: string, options: ResolveCardOptions = {}): Promise<ResolvedCard> {
  await ensureStoreInitialized(agentsDir);
  const parsed = parseCardRef(ref);
  if (!options.allowUntrustedSource) {
    const policy = await loadEffectiveTrustedSourcesPolicy({
      agentsDir,
      repoRoot: options.repoRoot,
      cwd: options.cwd,
    });
    assertSourceTrusted(parsed, policy);
  }
  if (parsed.origin === "file" && parsed.filePath) {
    const dir = resolve(parsed.filePath);
    const manifestPath = join(dir, "card.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`File card is missing card.json: ${parsed.filePath}`);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CardManifest;
    assertValidCardManifest(manifest);
    validatePublishedSkillDirs(dir, manifest);
    validatePublishedHookDirs(dir, manifest);
    return {
      name: manifest.name,
      requested: ref,
      version: manifest.version,
      dir,
      integrity: await computeCardIntegrity(dir),
      manifest,
      origin: "file",
    };
  }
  if (parsed.origin === "git") {
    return await resolveFromGit(agentsDir, parsed);
  }
  return await resolveFromStore(agentsDir, parsed);
}

export async function listCards(agentsDir: string) {
  const root = resolveCardsRoot(agentsDir);
  if (!existsSync(root)) {
    return [];
  }
  const cards: Array<{ name: string; versions: string[]; deprecated: Record<string, string> }> = [];
  for (const repo of await listBareRepos(agentsDir)) {
    const versions = await listPublishedVersions(agentsDir, repo.name);
    const barePath = resolveCardBareRepoPath(agentsDir, repo.name);
    const deprecated = existsSync(barePath) ? await readDeprecationMap(barePath) : {};
    cards.push({ name: repo.name, versions, deprecated });
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

export function deprecationConfigKey(version: string) {
  return `drwn.deprecated.v${version.replace(/\./g, "-")}`;
}

export function versionFromDeprecationConfigKey(key: string): string | null {
  const prefix = "drwn.deprecated.v";
  if (!key.startsWith(prefix)) {
    return null;
  }
  const encoded = key.slice(prefix.length);
  if (!encoded) {
    return null;
  }
  return encoded.replace(/-/g, ".");
}

export async function readDeprecationMap(barePath: string): Promise<Record<string, string>> {
  const fromConfig = await readDeprecationMapFromConfig(barePath);
  const fromMeta = await readDeprecationMapFromMeta(barePath);
  return { ...fromConfig, ...fromMeta };
}

async function readDeprecationMapFromConfig(barePath: string): Promise<Record<string, string>> {
  const entries = await git.configGetRegexp(barePath, "^drwn\\.deprecated\\.");
  const deprecated: Record<string, string> = {};
  for (const entry of entries) {
    const version = versionFromDeprecationConfigKey(entry.key);
    if (version) {
      deprecated[version] = entry.value;
    }
  }
  return deprecated;
}

async function migrateLegacyDeprecationConfig(barePath: string) {
  const fromConfig = await readDeprecationMapFromConfig(barePath);
  if (Object.keys(fromConfig).length === 0) {
    return;
  }
  const fromMeta = await readDeprecationMapFromMeta(barePath);
  const missing = Object.fromEntries(
    Object.entries(fromConfig).filter(([version]) => !fromMeta[version]),
  );
  if (Object.keys(missing).length === 0) {
    return;
  }
  await writeCardMeta(barePath, { deprecations: missing });
}

export async function getCardDeprecation(agentsDir: string, name: string, version: string): Promise<string | null> {
  const barePath = resolveCardBareRepoPath(agentsDir, name);
  if (!existsSync(barePath)) {
    return null;
  }
  const fromMeta = await readDeprecationMapFromMeta(barePath);
  if (fromMeta[version]) {
    return fromMeta[version] ?? null;
  }
  const fromConfig = await readDeprecationMapFromConfig(barePath);
  return fromConfig[version] ?? null;
}

export async function deprecateCardVersion(agentsDir: string, ref: string, message: string) {
  assertStoreWritable();
  const resolved = await resolveCard(agentsDir, ref);
  const barePath = resolveCardBareRepoPath(agentsDir, resolved.name);
  await migrateLegacyDeprecationConfig(barePath);
  const deprecationMessage = message || "deprecated";
  await writeCardMeta(barePath, { deprecations: { [resolved.version]: deprecationMessage } });
  await git.configSet(barePath, deprecationConfigKey(resolved.version), deprecationMessage);
  return resolved;
}

export async function removeCardSourceForTests(sourceInput: string) {
  rmSync(resolve(sourceInput), { recursive: true, force: true });
}

export function cardPathParts(name: string) {
  return splitCardName(name);
}

export function isNewerVersion(a: string, b: string) {
  return gt(a, b);
}
