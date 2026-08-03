// ABOUTME: Verifies syncCardSource roundtrip against a real upstream bare repository.
// ABOUTME: Covers check-only stale detection and apply copy from upstream subpaths.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncCardSource } from "../cli/core/card-source-sync";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function createUpstreamBareWithSkill(root: string) {
  const upstreamSource = join(root, "upstream-source");
  const barePath = join(root, "upstream.git");
  await mkdir(join(upstreamSource, "skills", "alpha"), { recursive: true });
  await writeFile(join(upstreamSource, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: upstream\n---\n");
  const { spawnSync } = await import("node:child_process");
  spawnSync("git", ["init", "--bare", barePath], { stdio: "ignore" });
  const tempIndex = join(root, "upstream-index");
  const env = {
    ...process.env,
    GIT_INDEX_FILE: tempIndex,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  spawnSync("git", ["--git-dir", barePath, "--work-tree", upstreamSource, "add", "-A"], { env, stdio: "ignore" });
  const tree = spawnSync("git", ["--git-dir", barePath, "write-tree"], { env, encoding: "utf8" });
  const commit = spawnSync(
    "git",
    ["--git-dir", barePath, "commit-tree", tree.stdout.trim(), "-m", "upstream"],
    { env, encoding: "utf8" },
  );
  spawnSync("git", ["--git-dir", barePath, "update-ref", "refs/heads/main", commit.stdout.trim()], { env, stdio: "ignore" });
  return { barePath, upstreamSource };
}

test("syncCardSource check then apply roundtrips upstream skill content", async () => {
  const root = await createTempRoot("source-sync-roundtrip-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const { barePath } = await createUpstreamBareWithSkill(root);
  const sourceDir = join(root, "card-sources", "sync");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(
    join(sourceDir, "card.json"),
    `${JSON.stringify(
      {
        name: "@me/sync",
        version: "1.0.0",
        skills: {
          include: ["alpha"],
          upstream: { alpha: `git+${barePath}#skills/alpha` },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: stale local\n---\n");

  const check = await syncCardSource(agentsDir, sourceDir, { check: true });
  expect(check.stale).toContain("alpha");
  expect(check.synced).toEqual([]);

  const apply = await syncCardSource(agentsDir, sourceDir, { check: false });
  expect(apply.synced).toContain("alpha");
  expect(await readFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "utf8")).toContain("upstream");
  await rm(join(sourceDir, ".upstream-sync.json"), { force: true });
});
