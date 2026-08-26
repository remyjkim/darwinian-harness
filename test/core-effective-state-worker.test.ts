// ABOUTME: Verifies one installed Worker root selects exactly one Card closure.
// ABOUTME: Protects local-only selection and replacement identity boundaries.

import { expect, test } from "bun:test";
import type { CardLockEntry, ProjectLockV1, WorkerRootLockEntry } from "../cli/core/card-lock";
import type { ConfigLocal } from "../cli/core/config-local";
import { selectProjectWorker } from "../cli/core/effective-state";
import type { CanonicalConfig, CanonicalRegistry, ProjectConfig } from "../cli/core/types";

function card(name: string, skills: string[] = [], kind: "card" | "blueprint" = "card"): CardLockEntry {
  return {
    name,
    requested: `${name}@1.0.0`,
    version: "1.0.0",
    path: `/cards/${name}`,
    integrity: `sha256-${name}`,
    manifest: {
      name,
      version: "1.0.0",
      ...(kind === "blueprint" ? { kind, composedFrom: [] } : {}),
      ...(skills.length > 0 ? { skills: { include: skills } } : {}),
    },
    skills,
    hooks: [],
    registry: null,
    origin: "file",
  };
}

function root(entry: CardLockEntry, members: string[] = []): WorkerRootLockEntry {
  return {
    name: entry.name,
    requested: entry.requested,
    kind: entry.manifest.kind === "blueprint" ? "blueprint" : "card",
    members,
  };
}

function lock(workerRoots: WorkerRootLockEntry[], cards: CardLockEntry[]): ProjectLockV1 {
  return {
    schema: "drwn.project-lock",
    schemaVersion: 1,
    store: { minDrwnVersion: "0.7.0" },
    workerRoots,
    cards,
  };
}

function project(workers: string[], activeWorker: string | null): ProjectConfig {
  return { schema: "drwn.project-config", schemaVersion: 1, workers, activeWorker };
}

function local(overrides: Partial<ConfigLocal>): ConfigLocal {
  return { schema: "drwn.project-local", schemaVersion: 1, ...overrides };
}

function repoConfig(): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: "~/.claude.json", format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: "~/.codex/config.toml", format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: false, configPath: "~/.cursor/mcp.json", format: "json-standalone", mcpKey: "mcpServers" },
      opencode: { enabled: false, configPath: "~/.config/opencode/opencode.json", format: "json-merge", mcpKey: "mcp" },
    },
    catalogs: { npmSkills: { enabled: false, searchLimit: 20 }, mcp: { enabled: false, sources: [] } },
    optional: {},
    parallel: { cli: { enabled: false }, mcp: { enabled: false } },
  };
}

function repoRegistry(): CanonicalRegistry {
  return { version: 1, servers: {} };
}

test("one selected plain root activates only that Card", () => {
  const one = card("@me/one", ["alpha"]);
  const two = card("@me/two", ["beta"]);

  const selection = selectProjectWorker({
    projectConfig: project([one.requested, two.requested], one.name),
    committedLock: lock([root(one), root(two)], [one, two]),
    configLocal: null,
    localLock: null,
  });

  expect(selection.installedRoots.map((entry) => entry.name)).toEqual([one.name, two.name]);
  expect(selection.selectedRoot?.name).toBe(one.name);
  expect(selection.activeCards.map((entry) => entry.name)).toEqual([one.name]);
  expect(selection.selectionSource).toBe("project");
});

test("one selected Blueprint activates its root plus ordered member closure", () => {
  const blueprint = card("@me/worker", [], "blueprint");
  const alpha = card("@me/alpha", ["alpha"]);
  const beta = card("@me/beta", ["beta"]);
  blueprint.manifest.composedFrom = [alpha.requested, beta.requested];

  const selection = selectProjectWorker({
    projectConfig: project([blueprint.requested], blueprint.name),
    committedLock: lock([root(blueprint, [alpha.name, beta.name])], [blueprint, alpha, beta]),
    configLocal: null,
    localLock: null,
  });

  expect(selection.activeCards.map((entry) => entry.name)).toEqual([blueprint.name, alpha.name, beta.name]);
});

test("activeWorker null activates no capabilities and alternatives remain inactive", () => {
  const one = card("@me/one", ["alpha"]);
  const two = card("@me/two", ["beta"]);
  const selection = selectProjectWorker({
    projectConfig: project([one.requested, two.requested], null),
    committedLock: lock([root(one), root(two)], [one, two]),
    configLocal: null,
    localLock: null,
  });

  expect(selection.activeWorker).toBeNull();
  expect(selection.selectedRoot).toBeNull();
  expect(selection.activeCards).toEqual([]);
});

test("selecting a member or absent name fails ACTIVE_WORKER_NOT_INSTALLED", () => {
  const blueprint = card("@me/worker", [], "blueprint");
  const member = card("@me/member", ["alpha"]);
  blueprint.manifest.composedFrom = [member.requested];
  const committedLock = lock([root(blueprint, [member.name])], [blueprint, member]);

  for (const selected of [member.name, "@me/missing"]) {
    expect(() => selectProjectWorker({
      projectConfig: project([blueprint.requested], selected),
      committedLock,
      configLocal: null,
      localLock: null,
    })).toThrow(expect.objectContaining({ code: "ACTIVE_WORKER_NOT_INSTALLED" }));
  }
});

test("a local-only root can be selected only by valid local config", () => {
  const localRoot = card("@me/local", ["local"]);
  const localLock = lock([root(localRoot)], [localRoot]);

  expect(() => selectProjectWorker({
    projectConfig: project([], localRoot.name),
    committedLock: null,
    configLocal: local({ localOnlyRoots: [localRoot.name] }),
    localLock,
  })).toThrow(expect.objectContaining({ code: "ACTIVE_WORKER_NOT_INSTALLED" }));

  const selection = selectProjectWorker({
    projectConfig: project([], null),
    committedLock: null,
    configLocal: local({ activeWorker: localRoot.name, localOnlyRoots: [localRoot.name] }),
    localLock,
  });
  expect(selection.activeCards.map((entry) => entry.name)).toEqual([localRoot.name]);
  expect(selection.selectionSource).toBe("local");
  expect(selection.localOverrides.localOnlyRoots).toEqual([localRoot.name]);
});

test("a local replacement changes bytes and provenance without changing root identity", () => {
  const committed = card("@me/one", ["alpha"]);
  const replacement = {
    ...card("@me/one", ["alpha-local"]),
    path: "/local/one",
    integrity: "sha256-local",
  };

  const selection = selectProjectWorker({
    projectConfig: project([committed.requested], committed.name),
    committedLock: lock([root(committed)], [committed]),
    configLocal: local({ cardReplacements: { [committed.name]: "file:/local/one" } }),
    localLock: lock([root(replacement)], [replacement]),
  });

  expect(selection.selectedRoot?.name).toBe(committed.name);
  expect(selection.activeCards[0]?.path).toBe("/local/one");
  expect(selection.activeCards[0]?.origin).toBe("file");
  expect(selection.localOverrides.cardReplacements).toEqual([committed.name]);
});

test("a local replacement cannot change the committed root topology", () => {
  const committed = card("@me/one", ["alpha"]);
  const other = card("@me/other", ["other"]);

  expect(() => selectProjectWorker({
    projectConfig: project([committed.requested], committed.name),
    committedLock: lock([root(committed)], [committed]),
    configLocal: local({ cardReplacements: { [committed.name]: "file:/local/other" } }),
    localLock: lock([root(other)], [other]),
  })).toThrow(expect.objectContaining({ code: "PROJECT_LOCK_INVALID" }));
});

test("project requirements and the committed lock root registry must agree", () => {
  const one = card("@me/one");
  expect(() => selectProjectWorker({
    projectConfig: project(["@me/one@2.0.0"], one.name),
    committedLock: lock([root(one)], [one]),
    configLocal: null,
    localLock: null,
  })).toThrow(expect.objectContaining({ code: "PROJECT_LOCK_INVALID" }));
});

test("one pure capability-state helper derives active or alternative installed closures with the same project overlays", async () => {
  const effectiveState = await import("../cli/core/effective-state") as typeof import("../cli/core/effective-state") & {
    buildProjectClosureCapabilityState?: (input: {
      repoConfig: CanonicalConfig;
      repoRegistry: CanonicalRegistry;
      projectConfig: ProjectConfig;
      cards: CardLockEntry[];
    }) => {
      skillSelection: { include?: string[]; exclude?: string[] };
      activeServers: Record<string, unknown>;
    };
  };
  expect(typeof effectiveState.buildProjectClosureCapabilityState).toBe("function");
  const buildProjectClosureCapabilityState = effectiveState.buildProjectClosureCapabilityState!;
  const alpha = card("@me/alpha", ["alpha-skill"]);
  alpha.manifest.servers = {
    alpha_mcp: { description: "Alpha", transport: "stdio", command: "alpha", optional: false },
  };
  const beta = card("@me/beta", ["beta-skill"]);
  beta.manifest.servers = {
    beta_mcp: { description: "Beta", transport: "stdio", command: "beta", optional: false },
  };
  const projectConfig = project([alpha.requested, beta.requested], alpha.name);
  projectConfig.skills = { include: ["project-skill"], exclude: ["blocked-skill"] };

  const active = buildProjectClosureCapabilityState({
    repoConfig: repoConfig(),
    repoRegistry: repoRegistry(),
    projectConfig,
    cards: [alpha],
  });
  const alternative = buildProjectClosureCapabilityState({
    repoConfig: repoConfig(),
    repoRegistry: repoRegistry(),
    projectConfig,
    cards: [beta],
  });

  expect(active.skillSelection).toEqual({ include: ["alpha-skill", "project-skill"], exclude: ["blocked-skill"] });
  expect(Object.keys(active.activeServers)).toEqual(["alpha_mcp"]);
  expect(alternative.skillSelection).toEqual({ include: ["beta-skill", "project-skill"], exclude: ["blocked-skill"] });
  expect(Object.keys(alternative.activeServers)).toEqual(["beta_mcp"]);
  expect(projectConfig.activeWorker).toBe(alpha.name);
});
