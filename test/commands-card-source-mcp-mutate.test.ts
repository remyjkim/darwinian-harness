// ABOUTME: Verifies semantic MCP server mutation through `drwn card source`.
// ABOUTME: Protects manifest/file mirroring, divergence diagnostics, and read-only guards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldSourceFixture() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = join(fixture.root, "catalog");
  expect((await runAgentsCli(["card", "new", "@me/example", "--into", join(catalog, "cards"), "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["config", "set", "catalogCheckouts", JSON.stringify([catalog])], envFor(fixture))).exitCode).toBe(0);
  return fixture;
}

function sourceDir(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return join(fixture.root, "catalog", "cards", "example");
}

async function readManifest(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return JSON.parse(await readFile(join(sourceDir(fixture), "card.json"), "utf8"));
}

async function readServerFile(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, id = "context7") {
  return JSON.parse(await readFile(join(sourceDir(fixture), "mcp-servers", `${id}.json`), "utf8"));
}

test("add-mcp --dry-run --json reports file and manifest updates without writing", async () => {
  const fixture = await scaffoldSourceFixture();
  const filePath = join(sourceDir(fixture), "mcp-servers", "context7.json");

  const result = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7", "--dry-run", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.changes.map((change: { action: string }) => change.action)).toEqual(["write-mcp-file", "update-manifest"]);
  expect(existsSync(filePath)).toBe(false);
  expect((await readManifest(fixture)).servers).toBeUndefined();
});

test("add-mcp writes reusable library definition to mcp-servers and card.json.servers", async () => {
  const fixture = await scaffoldSourceFixture();

  const result = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect((await readServerFile(fixture)).command).toBe("npx");
  expect((await readManifest(fixture)).servers.context7.command).toBe("npx");
});

test("add-mcp supports explicit --from files", async () => {
  const fixture = await scaffoldSourceFixture();
  const customPath = join(fixture.root, "custom-mcp.json");
  await writeFile(
    customPath,
    JSON.stringify({ description: "Custom", transport: "stdio", command: "custom-mcp", optional: false }, null, 2),
  );

  const result = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "custom", "--from", customPath], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect((await readServerFile(fixture, "custom")).command).toBe("custom-mcp");
  expect((await readManifest(fixture)).servers.custom.command).toBe("custom-mcp");
});

test("add-mcp --replace overwrites both manifest entry and source file", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture))).exitCode).toBe(0);
  const manifest = await readManifest(fixture);
  manifest.servers.context7.description = "edited manifest";
  await writeFile(join(sourceDir(fixture), "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(sourceDir(fixture), "mcp-servers", "context7.json"),
    JSON.stringify({ description: "edited file", transport: "stdio", command: "edited", optional: false }, null, 2),
  );

  const duplicate = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture));
  const replaced = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7", "--replace"], envFor(fixture));

  expect(duplicate.exitCode).not.toBe(0);
  expect(duplicate.stderr).toContain("--replace");
  expect(replaced.exitCode).toBe(0);
  expect((await readServerFile(fixture)).description).toBe("Docs");
  expect((await readManifest(fixture)).servers.context7.description).toBe("Docs");
});

test("remove-mcp removes both manifest entry and file", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture))).exitCode).toBe(0);
  const filePath = join(sourceDir(fixture), "mcp-servers", "context7.json");

  const result = await runAgentsCli(["card", "source", "remove-mcp", "@me/example", "context7"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(filePath)).toBe(false);
  expect((await readManifest(fixture)).servers.context7).toBeUndefined();
});

test("remove-mcp --keep-files removes only the manifest entry", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture))).exitCode).toBe(0);
  const filePath = join(sourceDir(fixture), "mcp-servers", "context7.json");

  const result = await runAgentsCli(["card", "source", "remove-mcp", "@me/example", "context7", "--keep-files"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(filePath)).toBe(true);
  expect((await readManifest(fixture)).servers.context7).toBeUndefined();
});

test("card source doctor reports divergence between mcp file and manifest server", async () => {
  const fixture = await scaffoldSourceFixture();
  expect((await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture))).exitCode).toBe(0);
  const file = await readServerFile(fixture);
  file.description = "different";
  await writeFile(join(sourceDir(fixture), "mcp-servers", "context7.json"), `${JSON.stringify(file, null, 2)}\n`);

  const result = await runAgentsCli(["card", "source", "doctor", "@me/example", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.ok).toBe(false);
  expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("mcp_manifest_divergence");
});

test("MCP mutations honor DRWN_STORE_READONLY while dry-run still reports plans", async () => {
  const fixture = await scaffoldSourceFixture();
  const readonlyEnv = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };

  const blockedAdd = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], readonlyEnv);
  const dryRunAdd = await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7", "--dry-run", "--json"], readonlyEnv);
  expect((await runAgentsCli(["card", "source", "add-mcp", "@me/example", "context7"], envFor(fixture))).exitCode).toBe(0);
  const blockedRemove = await runAgentsCli(["card", "source", "remove-mcp", "@me/example", "context7"], readonlyEnv);
  const dryRunRemove = await runAgentsCli(["card", "source", "remove-mcp", "@me/example", "context7", "--dry-run", "--json"], readonlyEnv);

  expect(blockedAdd.exitCode).not.toBe(0);
  expect(blockedAdd.stderr).toContain("read-only");
  expect(dryRunAdd.exitCode).toBe(0);
  expect(blockedRemove.exitCode).not.toBe(0);
  expect(blockedRemove.stderr).toContain("read-only");
  expect(dryRunRemove.exitCode).toBe(0);
});
