// ABOUTME: Verifies concrete Claude directory-plugin launch-context rendering.
// ABOUTME: Protects assigned-only skills, MCP, hooks, append instructions, and no-op argv.

import { afterEach, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashManagedDirectory } from "../cli/core/write-record";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("Claude renderer creates a strict plugin snapshot and file-referencing launch args", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-claude-"));
  roots.push(root);
  const sourceSkill = join(root, "source-skill");
  await mkdir(sourceSkill, { recursive: true });
  await writeFile(join(sourceSkill, "SKILL.md"), "---\nname: review\ndescription: review\n---\n");
  const stageDir = join(root, "stage");
  const finalDir = join(root, "final");
  const renderer = await import("../cli/core/worker-launch-context/claude-materializer").catch(() => ({} as any));
  expect(typeof renderer.renderClaudeWorkerLaunchContext).toBe("function");

  const rendered = await renderer.renderClaudeWorkerLaunchContext({
    stageDir,
    artifactDir: finalDir,
    assignedClosureDigest: `sha256-${"a".repeat(64)}`,
    materialization: {
      skills: [{ id: "review", sourcePath: sourceSkill, contentHash: hashManagedDirectory(sourceSkill), targets: ["claude"], layerLabel: "card", identityHash: hashManagedDirectory(sourceSkill) }],
      mcpServers: [{
        id: "context7",
        identityHash: `sha256-${"c".repeat(64)}`,
        definitionHash: `sha256-${"c".repeat(64)}`,
        optional: false,
        server: { description: "Context", transport: "stdio", command: "context7", optional: false },
        rendered: { command: "context7" },
      }],
      hooks: [],
      instructionBytes: new TextEncoder().encode("REVIEW_INSTRUCTION\n"),
    },
  });

  const pluginRoot = join(stageDir, "claude");
  expect(JSON.parse(await readFile(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"))).toMatchObject({
    name: expect.stringMatching(/^drwn-worker-[a-f0-9]{16}$/),
    version: "1.0.0",
    author: { name: "Curation Labs" },
  });
  expect(await readFile(join(pluginRoot, "skills", "review", "SKILL.md"), "utf8")).toContain("name: review");
  expect(JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"))).toMatchObject({ mcpServers: { context7: { command: "context7" } } });
  expect((await lstat(join(pluginRoot, "skills", "review"))).isDirectory()).toBe(true);
  expect(rendered.launch.args).toEqual([
    "--plugin-dir", join(finalDir, "claude"),
    "--append-system-prompt-file", join(finalDir, "claude", "instructions.md"),
  ]);
});

test("Claude renderer emits no target tree or argv for a true no-op", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-claude-noop-"));
  roots.push(root);
  const renderer = await import("../cli/core/worker-launch-context/claude-materializer") as any;
  const result = await renderer.renderClaudeWorkerLaunchContext({
    stageDir: join(root, "stage"),
    artifactDir: join(root, "final"),
    assignedClosureDigest: `sha256-${"a".repeat(64)}`,
    materialization: { skills: [], mcpServers: [], hooks: [], instructionBytes: null },
  });
  expect(result.launch).toEqual({ args: [], env: {} });
  expect(result.targetDir).toBeNull();
});
