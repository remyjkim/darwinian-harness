// ABOUTME: Syncs bundled card skills from upstream git provenance refs.
// ABOUTME: Supports check-only mode and tracks upstream commit movement separately from local drift.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { computeContentManifest } from "./content-manifest";
import { DrwnError } from "./errors";
import { formatUpstreamRef, parseUpstreamRef } from "./git-ref";
import * as git from "./git";
import { readCardSourceManifest } from "./card-store";
import { resolveCardSourceDir } from "./store-paths";

export interface SyncCardSourceResult {
  synced: string[];
  stale: string[];
  moved: string[];
}

export interface SkillSyncInput {
  skillName: string;
  localSkillDir: string;
  upstreamSkillDir: string;
  upstreamRef: string;
  commit: string;
  prior?: { commit: string; upstreamRef: string };
  check: boolean;
}

export interface SkillSyncOutcome {
  synced: boolean;
  stale: boolean;
  moved: boolean;
  nextState?: { commit: string; upstreamRef: string };
}

type UpstreamSyncState = Record<string, { commit: string; upstreamRef: string }>;

function slugifyGitUrl(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function resolveUpstreamCachePath(agentsDir: string, gitUrl: string) {
  return join(agentsDir, "drwn", "upstream-cache", `${slugifyGitUrl(gitUrl)}.git`);
}

function upstreamSyncStatePath(sourceDir: string) {
  return join(sourceDir, ".upstream-sync.json");
}

async function readUpstreamSyncState(sourceDir: string): Promise<UpstreamSyncState> {
  const path = upstreamSyncStatePath(sourceDir);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(await readFile(path, "utf8")) as UpstreamSyncState;
}

async function writeUpstreamSyncState(sourceDir: string, state: UpstreamSyncState) {
  await writeFile(upstreamSyncStatePath(sourceDir), `${JSON.stringify(state, null, 2)}\n`);
}

async function manifestsEqual(aDir: string, bDir: string) {
  const [a, b] = await Promise.all([computeContentManifest(aDir), computeContentManifest(bDir)]);
  return JSON.stringify(a) === JSON.stringify(b);
}

async function copyDirContents(srcDir: string, dstDir: string) {
  await rm(dstDir, { recursive: true, force: true });
  await mkdir(dstDir, { recursive: true });
  await cp(srcDir, dstDir, { recursive: true, force: true });
}

async function ensureUpstreamBareRepo(agentsDir: string, gitUrl: string) {
  const barePath = resolveUpstreamCachePath(agentsDir, gitUrl);
  if (!existsSync(barePath)) {
    await git.cloneBare(gitUrl, barePath);
    await git.configSet(barePath, "drwn.originUrl", gitUrl);
  } else {
    await git.fetchWithLockRetry(barePath, "origin", ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"]);
  }
  return barePath;
}

async function resolveUpstreamCommit(barePath: string, rev: string | null) {
  if (rev) {
    return git.revParse(barePath, rev);
  }
  try {
    return await git.revParse(barePath, "refs/heads/main");
  } catch {
    return await git.revParse(barePath, "HEAD");
  }
}

export async function classifyAndApplySkillSync(input: SkillSyncInput): Promise<SkillSyncOutcome> {
  const moved =
    Boolean(input.prior) &&
    input.prior!.upstreamRef === input.upstreamRef &&
    input.prior!.commit !== input.commit;
  const inSync = existsSync(input.localSkillDir) && (await manifestsEqual(input.upstreamSkillDir, input.localSkillDir));

  if (inSync) {
    return {
      synced: true,
      stale: false,
      moved,
      nextState: input.check ? undefined : { commit: input.commit, upstreamRef: input.upstreamRef },
    };
  }

  if (!input.check) {
    await copyDirContents(input.upstreamSkillDir, input.localSkillDir);
    return {
      synced: true,
      stale: false,
      moved,
      nextState: { commit: input.commit, upstreamRef: input.upstreamRef },
    };
  }

  return { synced: false, stale: true, moved };
}

export async function syncCardSource(
  agentsDir: string,
  sourceInput: string,
  options: { check?: boolean } = {},
): Promise<SyncCardSourceResult> {
  const sourceDir = existsSync(join(sourceInput, "card.json")) ? resolve(sourceInput) : resolveCardSourceDir(agentsDir, sourceInput);
  const manifest = await readCardSourceManifest(sourceDir);
  const upstream = manifest.skills?.upstream ?? {};
  const syncState = await readUpstreamSyncState(sourceDir);
  const synced: string[] = [];
  const stale: string[] = [];
  const moved: string[] = [];

  for (const [skillName, upstreamRef] of Object.entries(upstream)) {
    if (!(manifest.skills?.include ?? []).includes(skillName)) {
      throw new DrwnError("UPSTREAM_KEY_INVALID", `upstream key ${skillName} is not listed in skills.include`);
    }
    const parsed = parseUpstreamRef(upstreamRef);
    const formattedRef = formatUpstreamRef(parsed);
    const barePath = await ensureUpstreamBareRepo(agentsDir, parsed.gitUrl);
    const commit = await resolveUpstreamCommit(barePath, parsed.rev);

    const tempExtract = join(sourceDir, `.upstream-tmp-${skillName}-${process.pid}`);
    await git.extractSubpathToDir(barePath, commit, parsed.subpath, tempExtract);
    const outcome = await classifyAndApplySkillSync({
      skillName,
      localSkillDir: join(sourceDir, "skills", skillName),
      upstreamSkillDir: tempExtract,
      upstreamRef: formattedRef,
      commit,
      prior: syncState[skillName],
      check: options.check ?? false,
    });
    await rm(tempExtract, { recursive: true, force: true });

    if (outcome.moved) {
      moved.push(skillName);
    }
    if (outcome.synced) {
      synced.push(skillName);
    } else if (outcome.stale) {
      stale.push(skillName);
    }
    if (outcome.nextState) {
      syncState[skillName] = outcome.nextState;
    }
  }

  if (!options.check) {
    await writeUpstreamSyncState(sourceDir, syncState);
  }

  return { synced, stale, moved };
}

export async function checkCardSourceUpstream(agentsDir: string, sourceDir: string) {
  return syncCardSource(agentsDir, sourceDir, { check: true });
}
