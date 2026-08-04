// ABOUTME: Verifies machine Worker instructions project only into supported user-home adapters.
// ABOUTME: Protects foreign bytes, managed-block ownership, drift, cleanup, and projection filters.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { EffectiveState } from "../cli/core/effective-state";
import {
  syncMachineInstructions,
} from "../cli/core/sync-project-instructions";
import type { InstructionComposition } from "../cli/core/sync-instructions";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function state(
  homeDir: string,
  overrides: Partial<EffectiveState["scopedOptions"]> = {},
): EffectiveState {
  return {
    scopeRoot: homeDir,
    normalized: { force: overrides.force ?? false },
    scopedOptions: {
      repoRoot: "/repo",
      agentsDir: join(homeDir, ".agents"),
      homeDir,
      dryRun: false,
      mcpOnly: false,
      skillsOnly: false,
      writeScope: "machine",
      ...overrides,
    },
    workerSelection: {
      installedRoots: [],
      activeWorker: "@me/operator",
      selectedRoot: {
        name: "@me/operator",
        requested: "@me/operator@1.0.0",
        kind: "blueprint",
        members: [],
      },
      installedCards: [],
      activeCards: [],
      selectionSource: "machine",
      localOverrides: {
        activeWorker: null,
        cardReplacements: [],
        localOnlyRoots: [],
        sourceOverrides: [],
      },
      localCardNames: new Set(),
    },
  } as unknown as EffectiveState;
}

function composition(text = "Follow the reviewed machine procedure.\n"): InstructionComposition {
  return {
    bytes: new TextEncoder().encode(text),
    contentDigest: `sha256-${"a".repeat(64)}`,
    excluded: [],
    included: [{
      card: "@me/operator",
      evidenceKind: "local_card_consent",
      evidenceId: "@me/operator",
    }],
  };
}

test("machine instructions preserve foreign bytes in Claude and Codex adapters but never write ~/AGENTS.md", async () => {
  const homeDir = await createTempRoot("machine-instructions-");
  tempRoots.push(homeDir);
  const claudePath = join(homeDir, ".claude", "CLAUDE.md");
  const codexPath = join(homeDir, ".codex", "AGENTS.md");
  await mkdir(join(homeDir, ".claude"), { recursive: true });
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await writeFile(claudePath, "# Personal Claude guidance\n");
  await writeFile(codexPath, "# Personal Codex guidance\n");

  const first = syncMachineInstructions({
    state: state(homeDir),
    previousManagedPaths: [],
    composition: composition(),
  });

  for (const [path, foreign] of [
    [claudePath, "# Personal Claude guidance"],
    [codexPath, "# Personal Codex guidance"],
  ] as const) {
    const text = await readFile(path, "utf8");
    expect(text).toContain("<!-- drwn:instructions:start -->");
    expect(text).toContain("Follow the reviewed machine procedure.");
    expect(text).toEndWith(`${foreign}\n`);
  }
  expect(existsSync(join(homeDir, "AGENTS.md"))).toBe(false);
  expect(first.managedPaths?.map((entry) => [entry.path, entry.target])).toEqual([
    [".claude/CLAUDE.md", "claude"],
    [".codex/AGENTS.md", "codex"],
  ]);

  const repeated = syncMachineInstructions({
    state: state(homeDir),
    previousManagedPaths: first.managedPaths ?? [],
    composition: composition(),
  });
  expect(repeated.changes).toEqual([]);
});

test("machine instruction drift fails closed, force heals only the owned block, and cleanup preserves foreign bytes", async () => {
  const homeDir = await createTempRoot("machine-instructions-");
  tempRoots.push(homeDir);
  const claudePath = join(homeDir, ".claude", "CLAUDE.md");
  await mkdir(join(homeDir, ".claude"), { recursive: true });
  await writeFile(claudePath, "# Personal guidance\n");
  const initialState = state(homeDir, { target: "claude" });
  const first = syncMachineInstructions({
    state: initialState,
    previousManagedPaths: [],
    composition: composition(),
  });
  const tampered = (await readFile(claudePath, "utf8")).replace("reviewed", "tampered");
  await writeFile(claudePath, tampered);

  expect(() => syncMachineInstructions({
    state: initialState,
    previousManagedPaths: first.managedPaths ?? [],
    composition: composition(),
  })).toThrow(/drift/i);
  expect(await readFile(claudePath, "utf8")).toBe(tampered);

  const forced = syncMachineInstructions({
    state: state(homeDir, { target: "claude", force: true }),
    previousManagedPaths: first.managedPaths ?? [],
    composition: composition(),
  });
  expect(forced.managedPaths).toHaveLength(1);
  expect(await readFile(claudePath, "utf8")).toContain("reviewed machine procedure");

  const empty: InstructionComposition = {
    bytes: null,
    contentDigest: null,
    excluded: [],
    included: [],
  };
  const cleaned = syncMachineInstructions({
    state: initialState,
    previousManagedPaths: forced.managedPaths ?? [],
    composition: empty,
  });
  expect(cleaned.managedPaths).toEqual([]);
  expect(await readFile(claudePath, "utf8")).toBe("# Personal guidance\n");
});

test("machine instruction adapters obey target and mode filters", async () => {
  for (const [overrides, expected] of [
    [{ target: "claude" as const }, [".claude/CLAUDE.md"]],
    [{ target: "codex" as const }, [".codex/AGENTS.md"]],
    [{ target: "cursor" as const }, []],
    [{ mcpOnly: true }, []],
    [{ skillsOnly: true }, []],
  ] as const) {
    const homeDir = await createTempRoot("machine-instructions-");
    tempRoots.push(homeDir);
    const result = syncMachineInstructions({
      state: state(homeDir, overrides),
      previousManagedPaths: [],
      composition: composition(),
    });
    expect(result.managedPaths?.map((entry) => entry.path)).toEqual([...expected]);
  }
});
