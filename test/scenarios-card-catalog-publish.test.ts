// ABOUTME: Exercises the producer-to-consumer catalog publication workflow.
// ABOUTME: Proves a teammate can discover and clone a card after direct catalog publishing.

import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../cli/core/git";
import { cleanupTempRoots, createCatalogCardSource, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("a published card becomes discoverable and cloneable from a shared catalog", async () => {
  const producer = await scaffoldCliFixture();
  const consumer = await scaffoldCliFixture();
  tempRoots.push(producer.root, consumer.root);
  const cardRemote = await createEmptyBareRemote("card-remote-");
  const catalog = await createCatalogRemote({ scope: "@team" });

  await createCatalogCardSource(producer, "@team/backend");
  expect((await runAgentsCli(["card", "source", "add-skill", "@team/backend", "alpha"], envFor(producer))).exitCode).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "source", "set", "@team/backend", "--version", "1.2.3", "--description", "Team backend baseline"],
        envFor(producer),
      )
    ).exitCode,
  ).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@team/backend"], envFor(producer))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(producer))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "push", "@team/backend"], envFor(producer))).exitCode).toBe(0);
  expect((await runAgentsCli(["catalog", "add", catalog.url], envFor(producer))).exitCode).toBe(0);

  const published = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      "@team/backend@1.2.3",
      "--catalog",
      "@team",
      "--mode",
      "direct",
      "--tag",
      "baseline",
      "--tag",
      "backend",
      "--json",
    ],
    envFor(producer),
  );
  expect(published.exitCode).toBe(0);
  expect(JSON.parse(published.stdout).entry.url).toBe(`git+${cardRemote.url}#v1.2.3`);

  expect((await runAgentsCli(["catalog", "add", catalog.url], envFor(consumer))).exitCode).toBe(0);
  const discovered = await runAgentsCli(["search", "card", "backend", "--scope", "@team", "--json"], envFor(consumer));
  expect(discovered.exitCode).toBe(0);
  const results = JSON.parse(discovered.stdout).results;
  expect(results).toEqual([
    expect.objectContaining({
      name: "backend",
      scope: "@team",
      url: `git+${cardRemote.url}#v1.2.3`,
      tags: ["backend", "baseline"],
    }),
  ]);

  const cloned = await runAgentsCli(["card", "clone", results[0].url, "--json"], envFor(consumer));
  expect(cloned.exitCode).toBe(0);
  const shown = await runAgentsCli(["card", "show", "@team/backend@1.2.3", "--json"], envFor(consumer));
  expect(shown.exitCode).toBe(0);
  expect(JSON.parse(shown.stdout)).toMatchObject({
    name: "@team/backend",
    version: "1.2.3",
  });
});

async function createEmptyBareRemote(prefix: string) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(tempDir);
  const path = join(tempDir, "remote.git");
  await git.initBare(path);
  return { tempDir, path, url: `file://${path}` };
}

async function createCatalogRemote(options: { scope: string }) {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-catalog-remote-"));
  tempRoots.push(tempDir);
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "catalog.git");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "catalog.json"),
    JSON.stringify(
      {
        catalogVersion: 1,
        scope: options.scope,
        description: `Test ${options.scope} catalog`,
        cards: [],
      },
      null,
      2,
    ) + "\n",
  );
  await git.initBare(bareRepoPath);
  const tree = await git.writeTreeFromDir(bareRepoPath, sourceDir);
  const commit = await git.commitTree(bareRepoPath, tree, null, "Initial catalog");
  await git.updateRef(bareRepoPath, "refs/heads/main", commit);
  await git.runGit(["--git-dir", bareRepoPath, "symbolic-ref", "HEAD", "refs/heads/main"]);
  return { tempDir, sourceDir, bareRepoPath, url: `file://${bareRepoPath}` };
}
