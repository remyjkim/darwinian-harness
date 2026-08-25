// ABOUTME: Renders assigned Worker additions as a nested Codex project layer in the same Git worktree.
// ABOUTME: Uses -C plus --add-dir instead of synthetic CODEX_HOME or content-bearing config argv.

import { cp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { DrwnError } from "../errors";
import { runGit } from "../git";
import { bundleHookComposer } from "../hook-generator/bundle-composer";
import { renderCodexHookConfig } from "../hook-generator/sync-hooks";
import { mergeCodexTomlText } from "../mcp";
import type { WorkerLaunchMaterializationInput } from "./plan";
import type { RenderedWorkerLaunchTarget } from "./materializer-types";
import { hashManagedDirectory } from "../write-record";

async function assertGitProject(projectRoot: string) {
  const result = await runGit(["rev-parse", "--show-toplevel"], { cwd: projectRoot, timeoutMs: 2_000 });
  if (result.exitCode !== 0) {
    throw new DrwnError(
      "LAUNCH_TARGET_PROJECT_UNSUPPORTED",
      "Codex Worker launch contexts require a project inside a Git worktree",
    );
  }
  const [canonicalProject, canonicalGitRoot] = await Promise.all([realpath(projectRoot), realpath(result.stdout.trim())]);
  const rel = relative(canonicalGitRoot, canonicalProject);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    throw new DrwnError("LAUNCH_TARGET_PROJECT_UNSUPPORTED", "Project root is outside the detected Git worktree");
  }
}

async function copyConcreteDirectory(source: string, destination: string, expectedHash: string) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, dereference: false, force: false });
  if (hashManagedDirectory(destination) !== expectedHash) {
    throw new DrwnError("LAUNCH_PROJECT_STATE_CHANGED", `Worker launch capability source changed while copying: ${source}`);
  }
}

export function codexWorkerLaunchDescriptor(
  projectRoot: string,
  artifactDir: string,
  materialization: WorkerLaunchMaterializationInput,
) {
  const hasCapabilities = materialization.skills.length > 0 || materialization.mcpServers.length > 0 ||
    materialization.hooks.length > 0 || Boolean(materialization.instructionBytes?.byteLength);
  return hasCapabilities
    ? { args: ["-C", join(artifactDir, "codex", "workspace"), "--add-dir", projectRoot], env: {} }
    : { args: [], env: {} };
}

export async function renderCodexWorkerLaunchContext(input: {
  projectRoot: string;
  stageDir: string;
  artifactDir: string;
  materialization: WorkerLaunchMaterializationInput;
}): Promise<RenderedWorkerLaunchTarget> {
  const hasCapabilities = input.materialization.skills.length > 0 || input.materialization.mcpServers.length > 0 ||
    input.materialization.hooks.length > 0 || Boolean(input.materialization.instructionBytes?.byteLength);
  if (!hasCapabilities) return { targetDir: null, launch: { args: [], env: {} } };
  await assertGitProject(input.projectRoot);

  const targetDir = join(input.stageDir, "codex");
  const workspace = join(targetDir, "workspace");
  const finalTargetDir = join(input.artifactDir, "codex");
  await mkdir(workspace, { recursive: true });
  const instructions = [
    "# Darwinian Worker launch context",
    "",
    `Treat ${JSON.stringify(input.projectRoot)} as the logical project root for all project reads, writes, commands, and Git operations.`,
    "Do not create project files in this generated launch workspace.",
    ...(input.materialization.instructionBytes?.byteLength
      ? ["", "## Assigned Worker instructions", "", new TextDecoder().decode(input.materialization.instructionBytes).trimEnd()]
      : []),
    "",
  ].join("\n");
  await writeFile(join(workspace, "AGENTS.md"), instructions);
  for (const skill of input.materialization.skills) {
    await copyConcreteDirectory(skill.sourcePath, join(workspace, ".agents", "skills", skill.id), skill.contentHash);
  }
  if (input.materialization.mcpServers.length > 0) {
    await mkdir(join(workspace, ".codex"), { recursive: true });
    await writeFile(
      join(workspace, ".codex", "config.toml"),
      mergeCodexTomlText("", Object.fromEntries(input.materialization.mcpServers.map((entry) => [entry.id, entry.server]))),
    );
  }
  if (input.materialization.hooks.length > 0) {
    const frozenSources = join(input.stageDir, ".hook-sources");
    const frozenByRoot = new Map<string, string>();
    try {
      for (const [index, hook] of input.materialization.hooks.entries()) {
        if (frozenByRoot.has(hook.sourceRoot)) continue;
        const frozenRoot = join(frozenSources, String(index));
        await copyConcreteDirectory(hook.sourceRoot, frozenRoot, hook.sourceTreeHash);
        frozenByRoot.set(hook.sourceRoot, frozenRoot);
      }
      await bundleHookComposer({
        runtime: "codex",
        outputDir: targetDir,
        policies: input.materialization.hooks.map((entry) => ({
          ...entry.policy,
          policyTsPath: join(frozenByRoot.get(entry.sourceRoot)!, entry.policyRelativePath),
        })),
      });
    } finally {
      await rm(frozenSources, { recursive: true, force: true });
    }
    await mkdir(join(workspace, ".codex"), { recursive: true });
    await writeFile(
      join(workspace, ".codex", "hooks.json"),
      `${JSON.stringify(renderCodexHookConfig(join(finalTargetDir, "composer.mjs")), null, 2)}\n`,
    );
  }
  return {
    targetDir,
    launch: codexWorkerLaunchDescriptor(input.projectRoot, input.artifactDir, input.materialization),
  };
}
