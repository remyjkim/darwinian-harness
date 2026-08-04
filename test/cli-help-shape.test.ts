// ABOUTME: Asserts registered drwn commands render rich per-command help.
// ABOUTME: Protects against threadbare help and stale command-description regressions.

import { describe, expect, test } from "bun:test";

async function helpFor(args: string[], helpFlag = "--help") {
  const proc = Bun.spawn(["bun", "run", "cli/index.ts", ...args, helpFlag], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

async function detailedHelpFor(args: string[]) {
  const result = await helpFor(args);
  if (!result.stdout.startsWith("Multiple commands match your selection:")) {
    return result;
  }
  const commandPrefix = `drwn ${args.join(" ")}`;
  const match = result.stdout
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\.\s+(drwn .+)$/))
    .find((lineMatch) => {
      const candidate = lineMatch?.[2];
      return candidate === commandPrefix ||
        candidate?.startsWith(`${commandPrefix} [`) ||
        candidate?.startsWith(`${commandPrefix} <`);
    });
  if (!match?.[1]) {
    return result;
  }
  return await helpFor(args, `-h=${match[1]}`);
}

function extractCommandPaths(topLevelHelp: string) {
  return topLevelHelp
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("drwn "))
    .filter((line) => !line.startsWith("drwn -"))
    .map((line) =>
      line
        .replace(/^drwn\s+/, "")
        .replace(/\[[^\]]+\]/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\.\.\./g, "")
        .split(/\s+/)
        .filter(Boolean),
    )
    .filter((path) => path.length > 0);
}

const REQUIRED_SNIPPETS: Record<string, string[]> = {
  init: ["TTY", ".gitignore", "drwn init --non-interactive"],
  "add mcp": ["Prompts in a TTY", "Project intent is always explicit"],
  "add skill": ["Prompts in a TTY", "--all", "bundle"],
  "extensions setup": ["Beads only", "MarkItDown only", "--no-install"],
  "extensions doctor": ["all extensions"],
  "mcp list": ["Project-aware"],
  "apply": ["unless --write is supplied", "drwn apply --root"],
  "use": ["machine Blueprint without projection", "drwn use --root"],
  "card trust": ["embedded Worker lock", "--scope machine"],
  "machine skill enable": ["Always exits nonzero", "active Worker Blueprint", "drwn apply --root"],
  "machine mcp enable": ["Always exits nonzero", "Blueprint closure", "drwn apply --root"],
  "machine inventory export": ["canonical", "metadata", "inactive"],
  "machine inventory verify": ["exact", "read-only", "manifest or bundle"],
  "machine inventory bundle": ["deterministic", "offline", "inactive"],
  "machine inventory sync": ["additive", "conflict", "never activates"],
  "machine inventory gc": ["dry-run", "current inventory"],
  worker: ["one selected project Worker", "drwn use", "Cards compose"],
};

describe("drwn command help", () => {
  test("does not register prototype curation commands", async () => {
    const topLevel = await helpFor([]);
    expect(topLevel.stdout).not.toContain("drwn skills curate");
    expect(topLevel.stdout).not.toContain("drwn skills uncurate");
  });

  test("every registered command renders Details and Examples sections", async () => {
    const topLevel = await helpFor([]);
    expect(topLevel.exitCode).toBe(0);

    const commands = extractCommandPaths(topLevel.stdout);
    expect(commands.length).toBeGreaterThan(0);

    for (const cmd of commands) {
      const result = await detailedHelpFor(cmd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^Details$/m);
      expect(result.stdout).toMatch(/^Examples$/m);
    }
  }, 180000);

  test("high-leverage commands explain behavior hidden by terse descriptions", async () => {
    for (const [command, snippets] of Object.entries(REQUIRED_SNIPPETS)) {
      const result = await detailedHelpFor(command.split(" "));
      expect(result.exitCode).toBe(0);
      for (const snippet of snippets) {
        expect(result.stdout).toContain(snippet);
      }
    }
  }, 120000);
});
