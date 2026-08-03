// ABOUTME: Verifies `drwn card push` enforces mind-content visibility gates.
// ABOUTME: Protects tools-only card push compatibility and explicit unsafe override behavior.

import { afterEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../cli/core/git";
import { cleanupTempRoots, createCatalogCardSource, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createEmptyBareRemote(prefix: string) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(tempDir);
  const path = join(tempDir, "remote.git");
  await git.initBare(path);
  return { tempDir, path, url: `file://${path}` };
}

async function publishMindCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await createCatalogCardSource(fixture, "@team/mind");
  expect((await runAgentsCli(["card", "source", "add-persona", "@team/mind", "voice", "--visibility", "private"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@team/mind"], envFor(fixture))).exitCode).toBe(0);
}

test("card push blocks private mind content when remote visibility is public", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishMindCard(fixture);
  const remote = await createEmptyBareRemote("mind-remote-");
  expect((await runAgentsCli(["card", "remote", "add", "@team/mind", remote.url], envFor(fixture))).exitCode).toBe(0);

  const blocked = await runAgentsCli(["card", "push", "@team/mind", "--remote-visibility", "public"], envFor(fixture));

  expect(blocked.exitCode).not.toBe(0);
  expect(blocked.stderr).toContain("less restrictive");
});

test("card push allows explicit unsafe public override with an audit warning", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishMindCard(fixture);
  const remote = await createEmptyBareRemote("mind-remote-");
  expect((await runAgentsCli(["card", "remote", "add", "@team/mind", remote.url], envFor(fixture))).exitCode).toBe(0);

  const pushed = await runAgentsCli(["card", "push", "@team/mind", "--remote-visibility", "public", "--unsafe-push-public"], envFor(fixture));

  expect(pushed.exitCode).toBe(0);
  expect(pushed.stderr).toContain("unsafe");
});

test("card push blocks a network remote for private mind content before contacting it", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishMindCard(fixture);
  // A network remote classifies as unknown; the gate must refuse before any push is attempted.
  expect((await runAgentsCli(["card", "remote", "add", "@team/mind", "https://github.com/example/mind.git"], envFor(fixture))).exitCode).toBe(0);

  const blocked = await runAgentsCli(["card", "push", "@team/mind"], envFor(fixture));

  expect(blocked.exitCode).not.toBe(0);
  expect(blocked.stderr).toContain("unknown");
});
