// ABOUTME: Verifies Codex nested launch-workspace rendering inside the real Git worktree.
// ABOUTME: Protects root-to-CWD layering, minimal argv, and contained concrete capability files.

import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { runGit } from "../cli/core/git";
import { hashManagedDirectory } from "../cli/core/write-record";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

test("Codex renderer creates a nested project layer and minimal contained launch args", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-codex-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  expect((await runGit(["init", "-q"], { cwd: projectRoot })).exitCode).toBe(0);
  const sourceSkill = join(root, "source-skill");
  await mkdir(sourceSkill, { recursive: true });
  await writeFile(join(sourceSkill, "SKILL.md"), "---\nname: review\ndescription: review\n---\n");
  const stageDir = join(projectRoot, ".agents", "drwn", "generated", ".stage-test");
  const finalDir = join(projectRoot, ".agents", "drwn", "generated", "launch-contexts", "v1", "codex", `sha256-${"a".repeat(64)}`);
  const renderer = await import("../cli/core/worker-launch-context/codex-materializer").catch(() => ({} as any));
  expect(typeof renderer.renderCodexWorkerLaunchContext).toBe("function");

  const rendered = await renderer.renderCodexWorkerLaunchContext({
    projectRoot,
    stageDir,
    artifactDir: finalDir,
    materialization: {
      skills: [{ id: "review", sourcePath: sourceSkill, contentHash: hashManagedDirectory(sourceSkill), targets: ["codex"], layerLabel: "card", identityHash: hashManagedDirectory(sourceSkill) }],
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

  const workspace = join(stageDir, "codex", "workspace");
  expect(await readFile(join(workspace, ".agents", "skills", "review", "SKILL.md"), "utf8")).toContain("name: review");
  expect(await readFile(join(workspace, "AGENTS.md"), "utf8")).toContain(projectRoot);
  expect(await readFile(join(workspace, "AGENTS.md"), "utf8")).toContain("REVIEW_INSTRUCTION");
  expect(parseToml(await readFile(join(workspace, ".codex", "config.toml"), "utf8"))).toMatchObject({
    mcp_servers: { context7: { command: "context7" } },
  });
  expect(rendered.launch.args).toEqual([
    "-C", join(finalDir, "codex", "workspace"),
    "--add-dir", projectRoot,
  ]);
});

test("Codex renderer rejects a project outside a Git worktree before writing the target layer", async () => {
  const root = await mkdtemp(join(tmpdir(), "drwn-launch-codex-nongit-"));
  roots.push(root);
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  const renderer = await import("../cli/core/worker-launch-context/codex-materializer") as any;
  await expect(renderer.renderCodexWorkerLaunchContext({
    projectRoot,
    stageDir: join(projectRoot, ".stage"),
    artifactDir: join(projectRoot, "final"),
    materialization: { skills: [], mcpServers: [], hooks: [], instructionBytes: new TextEncoder().encode("delta") },
  })).rejects.toMatchObject({ code: "LAUNCH_TARGET_PROJECT_UNSUPPORTED" });
});
