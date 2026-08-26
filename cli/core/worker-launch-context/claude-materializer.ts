// ABOUTME: Renders assigned Worker additions as a concrete Claude directory plugin and prompt file.
// ABOUTME: Emits only file-referencing argv and never writes shared Claude or user-home state.

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DrwnError } from "../errors";
import { bundleHookComposer } from "../hook-generator/bundle-composer";
import { renderClaudeHookConfig } from "../hook-generator/sync-hooks";
import { renderJsonMcpConfig } from "../mcp";
import type { WorkerLaunchMaterializationInput } from "./plan";
import type { RenderedWorkerLaunchTarget } from "./materializer-types";
import { hashManagedDirectory } from "../write-record";

async function copyConcreteDirectory(source: string, destination: string, expectedHash: string) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, dereference: false, force: false });
  if (hashManagedDirectory(destination) !== expectedHash) {
    throw new DrwnError("LAUNCH_PROJECT_STATE_CHANGED", `Worker launch capability source changed while copying: ${source}`);
  }
}

export function claudeWorkerLaunchDescriptor(
  artifactDir: string,
  materialization: WorkerLaunchMaterializationInput,
) {
  const hasPlugin = materialization.skills.length > 0 || materialization.mcpServers.length > 0 || materialization.hooks.length > 0;
  const hasInstructions = Boolean(materialization.instructionBytes?.byteLength);
  const finalTargetDir = join(artifactDir, "claude");
  const args: string[] = [];
  if (hasPlugin) args.push("--plugin-dir", finalTargetDir);
  if (hasInstructions) args.push("--append-system-prompt-file", join(finalTargetDir, "instructions.md"));
  return { args, env: {} };
}

export async function renderClaudeWorkerLaunchContext(input: {
  stageDir: string;
  artifactDir: string;
  assignedClosureDigest: string;
  materialization: WorkerLaunchMaterializationInput;
}): Promise<RenderedWorkerLaunchTarget> {
  const hasPlugin = input.materialization.skills.length > 0 ||
    input.materialization.mcpServers.length > 0 || input.materialization.hooks.length > 0;
  const hasInstructions = Boolean(input.materialization.instructionBytes?.byteLength);
  if (!hasPlugin && !hasInstructions) return { targetDir: null, launch: { args: [], env: {} } };

  const targetDir = join(input.stageDir, "claude");
  const finalTargetDir = join(input.artifactDir, "claude");
  await mkdir(targetDir, { recursive: true });
  if (hasPlugin) {
    const namespace = input.assignedClosureDigest.replace(/^sha256-/, "").slice(0, 16);
    const manifestPath = join(targetDir, ".claude-plugin", "plugin.json");
    await mkdir(join(targetDir, ".claude-plugin"), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({
      name: `drwn-worker-${namespace}`,
      version: "1.0.0",
      description: "Darwinian Worker per-agent launch context",
      author: { name: "Curation Labs" },
    }, null, 2)}\n`);
    for (const skill of input.materialization.skills) {
      await copyConcreteDirectory(skill.sourcePath, join(targetDir, "skills", skill.id), skill.contentHash);
    }
    if (input.materialization.mcpServers.length > 0) {
      await writeFile(
        join(targetDir, ".mcp.json"),
        renderJsonMcpConfig(Object.fromEntries(input.materialization.mcpServers.map((entry) => [entry.id, entry.server]))),
      );
    }
    if (input.materialization.hooks.length > 0) {
      const hooksDir = join(targetDir, "hooks");
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
          runtime: "claude-code",
          outputDir: hooksDir,
          policies: input.materialization.hooks.map((entry) => ({
            ...entry.policy,
            policyTsPath: join(frozenByRoot.get(entry.sourceRoot)!, entry.policyRelativePath),
          })),
        });
      } finally {
        await rm(frozenSources, { recursive: true, force: true });
      }
      const finalComposer = join(finalTargetDir, "hooks", "composer.mjs");
      await writeFile(join(hooksDir, "hooks.json"), `${JSON.stringify({ hooks: renderClaudeHookConfig(finalComposer) }, null, 2)}\n`);
    }
  }
  if (hasInstructions) {
    await writeFile(join(targetDir, "instructions.md"), input.materialization.instructionBytes!);
  }
  return { targetDir, launch: claudeWorkerLaunchDescriptor(input.artifactDir, input.materialization) };
}
