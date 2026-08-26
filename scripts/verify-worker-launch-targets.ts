#!/usr/bin/env bun
// ABOUTME: Characterizes the credential-free target surfaces required by Worker launch contexts.
// ABOUTME: Validates Claude directory plugins and Codex nested project layers without model calls.

import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { coerce, gte } from "semver";
import { runProcess, type RunProcessResult } from "../cli/core/process";

const MAX_OUTPUT_BYTES = 65_536;
const TARGET_TIMEOUT_MS = 2_000;
const CLAUDE_MIN_VERSION = "2.1.212";
const CODEX_MIN_VERSION = "0.149.0";

interface TargetReport {
  version: string | null;
  supported: boolean;
  issues: string[];
}

interface CompatibilityReport {
  schema: "drwn.worker-launch-target-compatibility";
  schemaVersion: 1;
  ok: boolean;
  targets: {
    claude: TargetReport & { pluginValidated: boolean };
    codex: TargetReport & {
      rootInstructions: boolean;
      deltaInstructions: boolean;
      rootSkills: boolean;
      deltaSkills: boolean;
      rootMcp: boolean;
      deltaMcp: boolean;
    };
  };
}

function bounded(result: RunProcessResult, label: string): RunProcessResult {
  const bytes = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
  if (bytes > MAX_OUTPUT_BYTES) {
    return { exitCode: 1, stdout: "", stderr: `${label} output exceeded ${MAX_OUTPUT_BYTES} bytes` };
  }
  return result;
}

async function run(args: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  return bounded(await runProcess(args, { ...options, timeoutMs: TARGET_TIMEOUT_MS }), args[0] ?? "target");
}

function parseVersion(output: string): string | null {
  const parsed = coerce(output, { loose: false });
  return parsed?.version ?? null;
}

async function write(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function scaffold(root: string) {
  const projectRoot = join(root, "project");
  const codexHome = join(root, "codex-home");
  const pluginRoot = join(root, "claude-plugin");
  const workspace = join(projectRoot, ".agents", "drwn", "generated", "launch-context-probe", "workspace");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  const git = await run(["git", "init", "-q"], { cwd: projectRoot });
  if (git.exitCode !== 0) throw new Error("Unable to initialize the isolated compatibility project");
  const canonicalProjectRoot = await realpath(projectRoot);

  await write(join(projectRoot, "AGENTS.md"), "ROOT_INSTRUCTION_MARKER\n");
  await write(join(projectRoot, ".agents", "skills", "base-probe-skill", "SKILL.md"), [
    "---",
    "name: base-probe-skill",
    "description: Root compatibility marker.",
    "---",
    "",
    "BASE_SKILL_MARKER",
    "",
  ].join("\n"));
  await write(join(projectRoot, ".codex", "config.toml"), [
    "[mcp_servers.base_probe]",
    'command = "/usr/bin/true"',
    "",
  ].join("\n"));
  await write(join(codexHome, "config.toml"), [
    `[projects.${JSON.stringify(canonicalProjectRoot)}]`,
    'trust_level = "trusted"',
    "",
  ].join("\n"));

  await write(join(workspace, "AGENTS.md"), "NESTED_DELTA_INSTRUCTION_MARKER\n");
  await write(join(workspace, ".agents", "skills", "nested-delta-probe", "SKILL.md"), [
    "---",
    "name: nested-delta-probe",
    "description: Nested compatibility marker.",
    "---",
    "",
    "NESTED_DELTA_SKILL_MARKER",
    "",
  ].join("\n"));
  await write(join(workspace, ".codex", "config.toml"), [
    "[mcp_servers.nested_probe]",
    'command = "/usr/bin/true"',
    "",
  ].join("\n"));

  await write(join(pluginRoot, ".claude-plugin", "plugin.json"), `${JSON.stringify({
    name: "drwn-launch-probe",
    version: "1.0.0",
    description: "Darwinian Worker launch-context compatibility probe",
    author: { name: "Curation Labs" },
  }, null, 2)}\n`);
  await write(join(pluginRoot, "skills", "probe-skill", "SKILL.md"), [
    "---",
    "name: probe-skill",
    "description: Claude directory plugin compatibility marker.",
    "---",
    "",
    "CLAUDE_PLUGIN_SKILL_MARKER",
    "",
  ].join("\n"));

  return { projectRoot: canonicalProjectRoot, codexHome, pluginRoot, workspace };
}

async function verify(): Promise<CompatibilityReport> {
  const root = await mkdtemp(join(tmpdir(), "drwn-worker-launch-targets-"));
  const claudeBin = process.env.DRWN_CLAUDE_BIN || "claude";
  const codexBin = process.env.DRWN_CODEX_BIN || "codex";
  const claude: CompatibilityReport["targets"]["claude"] = {
    version: null,
    supported: false,
    pluginValidated: false,
    issues: [],
  };
  const codex: CompatibilityReport["targets"]["codex"] = {
    version: null,
    supported: false,
    rootInstructions: false,
    deltaInstructions: false,
    rootSkills: false,
    deltaSkills: false,
    rootMcp: false,
    deltaMcp: false,
    issues: [],
  };
  try {
    const fixture = await scaffold(root);

    const claudeVersion = await run([claudeBin, "--version"]);
    claude.version = parseVersion(`${claudeVersion.stdout}\n${claudeVersion.stderr}`);
    claude.supported = claudeVersion.exitCode === 0 && Boolean(claude.version && gte(claude.version, CLAUDE_MIN_VERSION));
    if (!claude.supported) claude.issues.push("CLAUDE_VERSION_UNSUPPORTED");
    if (claude.supported) {
      const validation = await run([claudeBin, "plugin", "validate", "--strict", fixture.pluginRoot]);
      claude.pluginValidated = validation.exitCode === 0;
      if (!claude.pluginValidated) claude.issues.push("CLAUDE_PLUGIN_VALIDATION_FAILED");
    }

    const codexVersion = await run([codexBin, "--version"]);
    codex.version = parseVersion(`${codexVersion.stdout}\n${codexVersion.stderr}`);
    codex.supported = codexVersion.exitCode === 0 && Boolean(codex.version && gte(codex.version, CODEX_MIN_VERSION));
    if (!codex.supported) codex.issues.push("CODEX_VERSION_UNSUPPORTED");
    if (codex.supported) {
      const env = { CODEX_HOME: fixture.codexHome };
      const prompt = await run([
        codexBin,
        "-C",
        fixture.workspace,
        "--add-dir",
        fixture.projectRoot,
        "debug",
        "prompt-input",
      ], { env });
      if (prompt.exitCode !== 0) {
        codex.issues.push("CODEX_PROMPT_INPUT_FAILED");
      } else {
        let promptText = "";
        try {
          promptText = JSON.stringify(JSON.parse(prompt.stdout));
        } catch {
          codex.issues.push("CODEX_PROMPT_INPUT_INVALID");
        }
        codex.rootInstructions = promptText.includes("ROOT_INSTRUCTION_MARKER");
        codex.deltaInstructions = promptText.includes("NESTED_DELTA_INSTRUCTION_MARKER");
        codex.rootSkills = promptText.includes("base-probe-skill");
        codex.deltaSkills = promptText.includes("nested-delta-probe");
      }
      const mcp = await run([
        codexBin,
        "-C",
        fixture.workspace,
        "--add-dir",
        fixture.projectRoot,
        "mcp",
        "list",
        "--json",
      ], { cwd: fixture.workspace, env });
      if (mcp.exitCode !== 0) {
        codex.issues.push("CODEX_MCP_LIST_FAILED");
      } else {
        try {
          const names = new Set((JSON.parse(mcp.stdout) as Array<{ name?: unknown }>).map((entry) => entry.name));
          codex.rootMcp = names.has("base_probe");
          codex.deltaMcp = names.has("nested_probe");
        } catch {
          codex.issues.push("CODEX_MCP_LIST_INVALID");
        }
      }
      if (!codex.rootInstructions) codex.issues.push("CODEX_ROOT_INSTRUCTIONS_MISSING");
      if (!codex.deltaInstructions) codex.issues.push("CODEX_DELTA_INSTRUCTIONS_MISSING");
      if (!codex.rootSkills) codex.issues.push("CODEX_ROOT_SKILLS_MISSING");
      if (!codex.deltaSkills) codex.issues.push("CODEX_DELTA_SKILLS_MISSING");
      if (!codex.rootMcp) codex.issues.push("CODEX_ROOT_MCP_MISSING");
      if (!codex.deltaMcp) codex.issues.push("CODEX_DELTA_MCP_MISSING");
    }
  } catch {
    claude.issues.push("TARGET_CHARACTERIZATION_FAILED");
    codex.issues.push("TARGET_CHARACTERIZATION_FAILED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const ok = claude.supported && claude.pluginValidated && codex.supported && codex.issues.length === 0;
  return { schema: "drwn.worker-launch-target-compatibility", schemaVersion: 1, ok, targets: { claude, codex } };
}

const report = await verify();
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`Claude ${report.targets.claude.version ?? "unavailable"}: ${report.targets.claude.pluginValidated ? "compatible" : "not compatible"}\n`);
  process.stdout.write(`Codex ${report.targets.codex.version ?? "unavailable"}: ${report.targets.codex.issues.length === 0 ? "compatible" : "not compatible"}\n`);
}
process.exitCode = report.ok ? 0 : 1;
