// ABOUTME: Runs the release-readiness quality gate for the drwn CLI and darwinian package.
// ABOUTME: Combines automated checks and explicit warnings into a single non-mutating verification entrypoint.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMachineWorkerRegistry } from "../cli/core/machine-worker-contract";
import { gte } from "../cli/core/semver-utils";
import { verifyOperatorContract } from "./verify-operator-contract";

export type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

type GateReport = {
  ok: boolean;
  checks: CheckResult[];
  warnings: string[];
};

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const testMode = process.env.QUALITY_GATE_TEST_MODE === "1";

async function runCommand(name: string, cmd: string[]) {
  const proc = Bun.spawn(cmd, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    name,
    ok: exitCode === 0,
    details: exitCode === 0 ? undefined : `${stdout}${stderr}`.trim(),
  } satisfies CheckResult;
}

async function verifyPackageContents() {
  const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return {
      name: "package contents",
      ok: false,
      details: `${stdout}${stderr}`.trim(),
    } satisfies CheckResult;
  }

  const parsed = JSON.parse(stdout) as Array<{ files?: Array<{ path: string }> }>;
  const files = parsed[0]?.files?.map((file) => file.path) ?? [];
  const forbidden = files.filter(
    (file) =>
      file === ".env" ||
      file.startsWith(".ai/") ||
      file.startsWith("test/") ||
      file.startsWith("scripts/"),
  );
  const required = [
    "cli/index.ts",
    "cli/commands/write.ts",
    "cli/commands/mcp/write.ts",
    "cli/commands/acp/serve.ts",
    "cli/commands/worker/materialize.ts",
    "cli/commands/worker/buzz-tools.ts",
    "cli/commands/worker/secret-set.ts",
    "registry/config.json",
    "registry/mcp-servers.json",
    "skills/shared/frontend-design/SKILL.md",
  ];
  const removedCommandFiles = [
    "cli/commands/apply.ts",
    "cli/commands/mcp/apply.ts",
    "cli/commands/sync.ts",
    "cli/commands/mcp/sync.ts",
    "cli/commands/skills/sync.ts",
    "sync-mcp.ts",
  ];
  const forbiddenCommands = removedCommandFiles.filter((file) => files.includes(file));
  const missingRequired = required.filter((file) => !files.includes(file));
  const details = [
    ...(forbidden.length > 0 ? [`Forbidden: ${forbidden.join(", ")}`] : []),
    ...(forbiddenCommands.length > 0 ? [`Removed commands: ${forbiddenCommands.join(", ")}`] : []),
    ...(missingRequired.length > 0 ? [`Missing: ${missingRequired.join(", ")}`] : []),
  ];

  return {
    name: "package contents",
    ok: details.length === 0,
    details: details.join("; ") || undefined,
  } satisfies CheckResult;
}

function findHardcodedUserPaths() {
  const targets = [
    "cli",
    "sync-mcp.ts",
    "README.md",
    "registry/mcp-servers.json",
    "registry/config.json",
    "package.json",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/05_npm-publishing-analysis-and-manual.md",
  ];
  const matches: string[] = [];

  for (const target of targets) {
    const pathValue = join(repoRoot, target);
    if (!existsSync(pathValue)) {
      continue;
    }
    const stat = Bun.file(pathValue);
    if (target === "cli") {
      for (const file of new Bun.Glob("**/*").scanSync({ cwd: pathValue, absolute: true })) {
        if (!file.endsWith(".ts")) {
          continue;
        }
        const content = readFileSync(file, "utf8");
        if (content.includes("/Users/")) {
          matches.push(file.replace(`${repoRoot}/`, ""));
        }
      }
      continue;
    }

    const content = readFileSync(pathValue, "utf8");
    if (content.includes("/Users/")) {
      matches.push(target);
    }
  }

  return matches;
}

function verifyPackageMetadata() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const requiredKeys = ["name", "version", "description", "license", "author", "keywords", "bin"] as const;
  const missing = requiredKeys.filter((key) => pkg[key] === undefined);
  const metadataIssues: string[] = [];
  const warnings: string[] = [];

  if (pkg.name !== "darwinian") {
    metadataIssues.push("name must be darwinian");
  }

  if (typeof pkg.bin !== "object" || pkg.bin === null || (pkg.bin as Record<string, string>).drwn !== "cli/index.ts") {
    metadataIssues.push("bin.drwn must point to cli/index.ts");
  }

  if (typeof pkg.scripts !== "object" || pkg.scripts === null || (pkg.scripts as Record<string, string>).drwn !== "bun run cli/index.ts") {
    metadataIssues.push("scripts.drwn must be 'bun run cli/index.ts'");
  }

  if (pkg.repository === undefined) {
    warnings.push("repository metadata unresolved");
  }

  return {
    check: {
      name: "package metadata",
      ok: missing.length === 0 && metadataIssues.length === 0,
      details: [...(missing.length > 0 ? [`Missing: ${missing.join(", ")}`] : []), ...metadataIssues].join("; ") || undefined,
    } satisfies CheckResult,
    warnings,
  };
}

function verifyDocsPresence() {
  const requiredFiles = [
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/05_npm-publishing-analysis-and-manual.md",
    "docs/release-process.md",
    "docs/maintainers/publishing.md",
    "docs-docusaurus/docs/reference/cli/acp.md",
    "docs-docusaurus/docs/reference/cli/worker.md",
    "docs-docusaurus/docs/reference/cli/refresh.md",
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(repoRoot, file)));
  const requiredTokens: Array<[string, string[]]> = [
    ["README.md", ["drwn acp serve <slug>", "drwn refresh --json", "Foundry/Analyzer-linked"]],
    ["docs/cli-quickref.md", ["payload v3", "envelope v2", "CAPABILITY_NOT_REPORTED", "HTTP 202"]],
    ["docs-docusaurus/docs/reference/cli/acp.md", ["terminal cancellation", "I236/I238"]],
    ["docs-docusaurus/docs/reference/cli/worker.md", ["LOCAL_CARD_REF_MISMATCH", "NO_ACTIVE_DEPLOYMENT"]],
    ["docs-docusaurus/docs/reference/cli/refresh.md", ["CREDENTIAL_SCHEMA_UNSUPPORTED", "never persisted"]],
    ["docs/release-process.md", ["dry-run run ID and attempt", "artifact ID and digest", "release-recovery.yml"]],
    ["docs/maintainers/publishing.md", ["No local token fallback", "darwinian-npm-publish"]],
    ["CHANGELOG.md", ["## [1.2.0] - 2026-08-07", "## [1.1.0] - 2026-08-05", "## [1.0.0] - 2026-08-03"]],
  ];
  const drift: string[] = [];
  for (const [file, tokens] of requiredTokens) {
    if (!existsSync(join(repoRoot, file))) continue;
    const content = readFileSync(join(repoRoot, file), "utf8");
    for (const token of tokens) {
      if (!content.includes(token)) drift.push(`${file} is missing ${token}`);
    }
  }
  const publishingPath = join(repoRoot, "docs/maintainers/publishing.md");
  if (existsSync(publishingPath)) {
    const cliSection = readFileSync(publishingPath, "utf8").split("## Publishing `drwn-command-bridge`")[0] ?? "";
    for (const retired of ["NPM_ORG_TOKEN", "TMP_NPMRC", "--userconfig"]) {
      if (cliSection.includes(retired)) drift.push(`darwinian CLI docs retain ${retired} token fallback`);
    }
  }

  return {
    name: "documentation presence",
    ok: missing.length === 0 && drift.length === 0,
    details: [
      ...(missing.length > 0 ? [`Missing: ${missing.join(", ")}`] : []),
      ...drift,
    ].join("; ") || undefined,
  } satisfies CheckResult;
}

type SourceOverrides = Record<string, string>;

const TARGET_RELEASE_VERSION = "1.2.0";
const FIRST_SUPPORTED_WORKER_VERSION = "1.1.0";

function runtimeVersionFromSource(
  runtimeSource: string,
  packageVersion: string | undefined,
  issues: string[],
): string | undefined {
  const derivesFromAdjacentPackage =
    runtimeSource.includes("readRuntimeVersion") &&
    runtimeSource.includes('new URL("../../package.json", import.meta.url)');
  if (derivesFromAdjacentPackage) return packageVersion;
  issues.push("runtime version must derive from adjacent package metadata");
  return runtimeSource.match(/DRWN_VERSION = "([^"]+)"/)?.[1];
}

function isAtLeast(version: string | undefined, floor: string): boolean {
  if (!version) return false;
  try {
    return gte(version, floor);
  } catch {
    return false;
  }
}

export function verifyRecommendedMachineWorkerContract(
  root = repoRoot,
  overrides: SourceOverrides = {},
): CheckResult {
  const pathValue = "registry/machine-workers.json";
  const content = Object.hasOwn(overrides, pathValue)
    ? overrides[pathValue]!
    : existsSync(join(root, pathValue))
      ? readFileSync(join(root, pathValue), "utf8")
      : "";
  try {
    if (!content) throw new Error(`${pathValue} is missing`);
    parseMachineWorkerRegistry(JSON.parse(content));
    return { name: "recommended machine Worker contract", ok: true };
  } catch (error) {
    return {
      name: "recommended machine Worker contract",
      ok: false,
      details: `${pathValue}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function verifyStoreExportSecurity(root = repoRoot, overrides: SourceOverrides = {}) {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
  };
  const publicExportPath = "cli/commands/store/export.ts";
  const publicExportExists = Object.hasOwn(overrides, publicExportPath)
    ? overrides[publicExportPath]!.length > 0
    : existsSync(join(root, publicExportPath));
  const index = source("cli/index.ts");
  const deploy = source("cli/core/worker-deploy.ts");
  const deployTests = source("test/core-worker-deploy.test.ts");

  if (publicExportExists || /StoreExportCommand/.test(index) || /commands\/store\/export/.test(index)) {
    issues.push("public whole-Store export must remain unavailable");
  }
  if (!deploy.includes("function storeExportEntries") || !deploy.includes('new Set<string>(["drwn/store.json"])')) {
    issues.push("remote deploy must retain its scoped Store export allowlist");
  }
  if (/entries\s*:\s*\[\s*["']drwn["']\s*\]/.test(deploy)) {
    issues.push("remote deploy must not archive the whole drwn Store root");
  }
  if (!deployTests.includes("storeExport decodes and seeds a store") || !deployTests.includes("without leaking local schemas")) {
    issues.push("scoped remote deploy export coverage is missing");
  }

  return {
    name: "store export security",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  } satisfies CheckResult;
}

function sourceSlice(content: string, startToken: string, endToken?: string) {
  const start = content.indexOf(startToken);
  if (start === -1) return "";
  const end = endToken ? content.indexOf(endToken, start + startToken.length) : -1;
  return content.slice(start, end === -1 ? undefined : end);
}

export function verifyMachineInventoryContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const exists = (pathValue: string) => Object.hasOwn(overrides, pathValue)
    ? overrides[pathValue]!.length > 0
    : existsSync(join(root, pathValue));
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing machine inventory source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: Array<[string, string]>) => {
    const content = source(pathValue);
    for (const [token, label] of tokens) {
      if (!content.includes(token)) issues.push(label);
    }
  };

  const index = source("cli/index.ts");
  for (const namespace of ["library", "store", "skills"] as const) {
    const pattern = new RegExp(`(?:commands/${namespace}|${namespace[0]!.toUpperCase()}${namespace.slice(1)}[A-Za-z]*Command|\\[\\[\\\"${namespace}\\\")`);
    if (pattern.test(index)) issues.push(`obsolete ${namespace} command namespace remains registered`);
  }
  const obsoleteCommandFiles = [
    "cli/commands/library/index.ts",
    "cli/commands/library/list.ts",
    "cli/commands/store/export.ts",
    "cli/commands/store/status.ts",
    "cli/commands/skills/list.ts",
    "cli/commands/skills/packages.ts",
  ];
  for (const pathValue of obsoleteCommandFiles) {
    if (exists(pathValue)) {
      issues.push(pathValue.includes("/skills/")
        ? `obsolete top-level skills command file remains: ${pathValue}`
        : `obsolete ${pathValue.includes("/store/") ? "store" : "library"} command file remains: ${pathValue}`);
    }
  }
  for (const pathValue of ["cli/core/migration.ts", "cli/core/store-gc.ts", "cli/core/store-migrate.ts"]) {
    if (exists(pathValue)) issues.push(`prototype inventory adapter remains: ${pathValue}`);
  }

  const inventoryOutputSources = [
    "cli/commands/scan.ts",
    "cli/commands/add/skill.ts",
    "cli/commands/add/mcp.ts",
    "cli/commands/search/skill.ts",
    "cli/commands/search/mcp.ts",
    "cli/commands/write.ts",
    "cli/commands/mcp/list.ts",
    "cli/commands/card/source/add-skill.ts",
    "cli/commands/card/source/add-mcp.ts",
    "cli/core/defaults.ts",
    "cli/core/diagnostics.ts",
  ].map(source).join("\n");
  if (!source("cli/commands/scan.ts").includes("machine inventory, explicit machine selection, and project config") ||
      /library, defaults|library\/default\/project|Local library|local (?:skill|MCP)? ?library|user MCP library|installed skill library|machine library|machine-wide defaults|machine defaults/i.test(inventoryOutputSources)) {
    issues.push("scan command or operator output retains retired Library terminology");
  }

  const mcpLibrary = source("cli/core/mcp-library.ts");
  if (/\b(?:write|save|replace)McpLibrary\b/.test(mcpLibrary)) {
    issues.push("whole-MCP inventory rewrite API remains");
  }
  if (/withOwnerLock|recordMutationLock|mcpRecordLock/.test(mcpLibrary)) {
    issues.push("per-record mutation lock remains in MCP inventory");
  }
  requireTokens("cli/core/mcp-library.ts", [
    ["writeMcpRecordUnlocked", "MCP inventory is missing atomic record-level persistence"],
    ["withInventoryLock", "MCP inventory mutations do not use the global inventory lock"],
    ["tombstoneInventoryPath", "MCP removal is missing tombstone recovery"],
  ]);

  const skillPackages = source("cli/core/skill-packages.ts");
  if (!skillPackages.includes("if (existingIntegrity !== stagedIntegrity)") ||
      !skillPackages.includes("INVENTORY_IMMUTABLE_VERSION_CONFLICT")) {
    issues.push("immutable version digest comparison is incomplete");
  }
  if (!skillPackages.includes("await writeAtomically(currentPath") || /\bsymlink(?:Sync)?\s*\([^)]*currentPath/.test(skillPackages)) {
    issues.push("skill packages do not use a regular atomic current pointer");
  }
  if (/withOwnerLock|packageMutationLock|skillRecordLock/.test(skillPackages)) {
    issues.push("per-record mutation lock remains in skill inventory");
  }

  const inventorySources = [
    source("cli/commands/machine/skill.ts"),
    source("cli/commands/machine/mcp.ts"),
    source("cli/core/inventory-references.ts"),
  ].join("\n");
  if (/force-unresolved|forceUnresolved/.test(inventorySources)) {
    issues.push("force-unresolved inventory removal remains available");
  }
  for (const [pathValue, tokens] of [
    ["cli/commands/machine/skill.ts", [
      '["machine", "skill", "list"]',
      '["machine", "skill", "show"]',
      '["machine", "skill", "references"]',
      '["machine", "skill", "install"]',
      '["machine", "skill", "update"]',
      '["machine", "skill", "uninstall"]',
      '["machine", "skill", "enable"]',
      '["machine", "skill", "disable"]',
    ]],
    ["cli/commands/machine/mcp.ts", [
      '["machine", "mcp", "list"]',
      '["machine", "mcp", "show"]',
      '["machine", "mcp", "references"]',
      '["machine", "mcp", "add"]',
      '["machine", "mcp", "update"]',
      '["machine", "mcp", "remove"]',
      '["machine", "mcp", "enable"]',
      '["machine", "mcp", "disable"]',
    ]],
  ] as const) {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) {
        const label = token.includes('"references"')
          ? `${token.includes('"skill"') ? "machine skill" : "machine MCP"} references command is missing`
          : `machine inventory lifecycle command is missing: ${token}`;
        issues.push(label);
      }
    }
  }

  const registry = source("cli/core/project-registry.ts");
  if (!registry.includes("withInventoryLock(") || !registry.includes("withProjectStateLock(")) {
    issues.push("project registry writers do not retain inventory lock ordering");
  }
  const projectWrites = source("cli/core/project-writes.ts");
  if (!projectWrites.includes("withInventoryLock(") || !projectWrites.includes("withProjectStateLock(")) {
    issues.push("project reference writers do not retain inventory lock ordering");
  }
  if (!source("cli/commands/add/skill.ts").includes("afterCommit:")) {
    issues.push("automatic skill install does not retain the inventory lock through project intent commit");
  }

  requireTokens("cli/core/inventory-tombstones.ts", [
    ["recoverInventoryTombstones", "inventory tombstone recovery is missing"],
    ["inspectInventoryTombstones", "inventory tombstone validation is missing"],
  ]);
  const gc = source("cli/core/inventory-gc.ts");
  if ((gc.match(/current-package-version/g)?.length ?? 0) < 2 ||
      (gc.match(/current-mcp-record/g)?.length ?? 0) < 2) {
    issues.push("current inventory is not explicitly protected from GC");
  }
  requireTokens("cli/commands/machine/inventory.ts", [
    ['["machine", "inventory", "gc"]', "machine inventory GC command is missing"],
    ["Option.Boolean(\"--prune\"", "machine inventory GC is not dry-run by default with explicit prune"],
  ]);
  requireTokens("cli/commands/status.ts", [
    ["Option.Boolean(\"--machine\"", "machine-scoped status command is missing"],
  ]);

  const shapeTests = source("test/commands-machine-inventory-shape.test.ts");
  if (!["drwn library ", "drwn store ", "drwn skills "].every((token) => shapeTests.includes(token))) {
    issues.push("old-path negative tests are incomplete");
  }

  const deploy = source("cli/core/worker-deploy.ts");
  if (!deploy.includes('new Set<string>(["drwn/store.json"])') || /new Set<string>\(\["drwn"\]\)/.test(deploy)) {
    issues.push("Store root archive creation is not prohibited");
  }

  const contractDocPaths = [
    "README.md",
    "docs/cli-quickref.md",
    "docs/contracts/project-worker-v1.md",
    ".ai/analyses/116_drwn-cli-card-worker-target-architecture.md",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/09_cards-manual-test-guide.md",
    ".ai/knowledges/10_drwn-cli-architecture.md",
    ...Array.from(new Bun.Glob("**/*.{md,mdx}").scanSync({ cwd: join(root, "docs-docusaurus", "docs") }))
      .map((pathValue) => `docs-docusaurus/docs/${pathValue}`),
  ];
  const contractDocs = contractDocPaths.map(source).join("\n");
  for (const [token, label] of [
    ["drwn-managed standalone", "inventory ownership"],
    ["inactive until", "inactive inventory"],
    ["package-scoped", "package-scoped skill lifecycle"],
    ["drwn machine skill references", "skill reference inspection"],
    ["drwn machine mcp references", "MCP reference inspection"],
    ["inventory -> machine -> project", "global lock order"],
    ["drwn projects unregister", "stale project registration repair"],
    ["immutable package versions", "immutable package versions"],
    ["secret references", "MCP secret-reference policy"],
    ["record-level", "record-level MCP persistence"],
    ["tombstone recovery", "tombstone recovery"],
    ["dry-run by default", "dry-run inventory GC"],
    ["Task 82", "portable transfer boundary"],
  ] as const) {
    if (!contractDocs.includes(token)) issues.push(`machine inventory docs are missing ${label}`);
  }
  const staleInventoryCommand = /drwn (?:library|store)(?:\s|`)|drwn skills (?:list|packages)/;
  for (const pathValue of contractDocPaths) {
    if (staleInventoryCommand.test(source(pathValue))) {
      issues.push(`obsolete inventory command documentation remains in ${pathValue}`);
    }
  }

  return {
    name: "machine inventory contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifyPortableInventoryTransferContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const exists = (pathValue: string) => Object.hasOwn(overrides, pathValue)
    ? overrides[pathValue]!.length > 0
    : existsSync(join(root, pathValue));
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing portable inventory source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: Array<[string, string]>) => {
    const content = source(pathValue);
    for (const [token, label] of tokens) {
      if (!content.includes(token)) issues.push(label);
    }
  };

  const index = source("cli/index.ts");
  for (const command of ["Export", "Bundle", "Verify", "Sync"] as const) {
    if (!index.includes(`cli.register(MachineInventory${command}Command);`)) {
      issues.push(`portable inventory ${command.toLowerCase()} command is not registered`);
    }
  }
  if (/commands\/(?:store|library)|cli\.register\((?:Store|Library)[A-Za-z]*Command\)/.test(index)) {
    issues.push("store or library public command namespace was reintroduced");
  }

  const commands = source("cli/commands/machine/inventory.ts");
  for (const pathToken of [
    '["machine", "inventory", "export"]',
    '["machine", "inventory", "bundle"]',
    '["machine", "inventory", "verify"]',
    '["machine", "inventory", "sync"]',
  ]) {
    if (!commands.includes(pathToken)) issues.push(`portable inventory command path is missing: ${pathToken}`);
  }
  const transferCommands = sourceSlice(
    commands,
    "export class MachineInventoryExportCommand",
    "export class MachineInventoryGcCommand",
  );
  if (/Option\.(?:Boolean|String)\(["']--(?:force|replace|delete|activate|enable|project|include|exclude|unsafe|stdin|stdout|url)/.test(commands)
    || /Option\.(?:Boolean|String)\(["']--prune/.test(transferCommands)) {
    issues.push("forbidden transfer option is exposed");
  }

  const shapeTests = source("test/commands-machine-inventory-shape.test.ts");
  const negativeOptions = [
    "--force", "--replace", "--delete", "--activate", "--enable", "--prune", "--project",
    "--include", "--exclude", "--unsafe", "--stdin", "--stdout", "--url",
  ];
  if (!negativeOptions.every((token) => shapeTests.includes(token))) {
    issues.push("negative transfer option coverage is incomplete");
  }

  requireTokens("cli/core/inventory-portable.ts", [
    ['"drwn.portable-inventory"', "portable manifest schema identity is missing"],
    ["PORTABLE_INVENTORY_SCHEMA_VERSION = 1", "portable manifest schema V1 is missing"],
    [".strict()", "portable manifest objects are not strict"],
    ["canonicalValue", "recursive canonical JSON serialization is missing"],
    ["comparePortableStrings", "locale-independent portable ordering is missing"],
    ["maxCompressedBundleBytes: 512 * 1024 * 1024", "compressed bundle limit is not pinned"],
    ["maxPayloadBytes: 2 * 1024 * 1024 * 1024", "total payload limit is not pinned"],
    ["maxRegularFileBytes: 256 * 1024 * 1024", "regular file limit is not pinned"],
    ["maxManifestBytes: 4 * 1024 * 1024", "manifest limit is not pinned"],
    ["maxArchiveMembers: 100_000", "archive member limit is not pinned"],
    ["maxPathDepth: 64", "archive path-depth limit is not pinned"],
    ["maxDecompressionRatio: 200", "archive decompression-ratio limit is not pinned"],
  ]);

  const bundle = source("cli/core/inventory-bundle.ts");
  const stageSnapshot = sourceSlice(bundle, "async function stageSnapshot", "async function lexicalArchiveEntries");
  if (/resolveStoreRoot|readdir\([^)]*storeRoot|entries\s*:\s*\[\s*["']drwn["']\s*\]/.test(stageSnapshot + bundle)) {
    const allowedPresenceCheck = /const storeRoot = resolveStoreRoot\(options\.agentsDir\);[\s\S]*existsSync\(storeRoot\)/.test(bundle);
    const broadSource = /readdir\([^)]*storeRoot|entries\s*:\s*\[\s*["']drwn["']\s*\]/.test(bundle)
      || /resolveStoreRoot/.test(stageSnapshot);
    if (broadSource || !allowedPresenceCheck) issues.push("portable bundle uses the whole Store source");
  }
  requireTokens("cli/core/inventory-bundle.ts", [
    ["snapshot.payloads", "portable bundle is not built from the typed inventory allowlist"],
    ["if (!regular && !directory)", "concrete archive member enforcement is missing"],
    ['raw.includes("\\\\")', "archive backslash/traversal rejection is missing"],
    ['part === ".."', "archive parent traversal rejection is missing"],
    ["entry.isSymbolicLink()", "archive symbolic-link rejection is missing"],
    ["preservePaths: false", "strict contained extraction is missing"],
    ["assertCanonicalGzipHeader", "canonical gzip header validation is missing"],
    ["validatePhysicalTarStructure", "physical tar metadata validation is missing"],
    ["hashSkillPackageDirectory", "skill tree integrity validation is missing"],
    ["canonicalMcpDefinitionBytes", "canonical MCP integrity validation is missing"],
    ["PRIVATE_KEY_MARKERS", "private-key secret detection is missing"],
    ["knownSensitiveValues", "sensitive environment-value detection is missing"],
    ["highRiskBasename", "high-risk credential filename detection is missing"],
    ["validateExtractedClosure", "manifest/payload closure validation is missing"],
    ["maxDecompressionRatio", "archive decompression limit enforcement is missing"],
  ]);

  const transfer = source("cli/core/inventory-transfer.ts");
  const portableSources = [source("cli/core/inventory-portable.ts"), bundle, transfer].join("\n");
  if (/from\s+["']\.\/(?:store-seed|machine-config|user-config|project-writes|worker-project|sync|worker-deploy|card-store|defaults)["']/.test(portableSources)) {
    issues.push("portable transfer imports a forbidden managed-state dependency");
  }
  for (const forbidden of ["--force", "--replace", "--activate", "--enable", "--project"]) {
    if (transfer.includes(forbidden)) issues.push(`portable sync core contains forbidden operation ${forbidden}`);
  }
  for (const [token, label] of [
    ["return await withInventoryLock(options.agentsDir", "portable sync does not use the global inventory lock"],
    ["lockedTarget", "portable sync does not reconstruct target state under the lock"],
    ["lockedReport", "portable sync does not revalidate conflicts under the lock"],
    ["acceptedFingerprint", "portable sync does not compare the accepted and locked plans"],
    ["acceptedSourceIntegrity", "portable sync does not revalidate source integrity"],
    ["installSkillBundleRoot", "portable sync bypasses the Task 81 skill package helper"],
    ["createMcpLibraryRecord", "portable sync bypasses the Task 81 MCP record helper"],
  ] as const) {
    if (!transfer.includes(token)) issues.push(label);
  }

  const initializer = sourceSlice(
    source("cli/core/inventory.ts"),
    "export async function initializeInventoryStorage",
  );
  for (const token of ["resolveStoreMetadataPath", "resolveStoreSkillPackagesRoot", "resolveStoreMcpServersDir"]) {
    if (!initializer.includes(token)) issues.push(`inventory-only initialization is missing ${token}`);
  }
  if (/ensureStoreInitialized|seedStore|isStoreMissingOrEmpty|machine\.json/.test(initializer)) {
    issues.push("inventory-only initialization can create or seed broader machine state");
  }

  for (const pathValue of [
    "test/core-inventory-portable.test.ts",
    "test/core-inventory-transfer.test.ts",
    "test/core-inventory-bundle.test.ts",
    "test/core-inventory-transfer-recovery.test.ts",
    "test/commands-machine-inventory-transfer.test.ts",
    "test/e2e-machine-inventory-transfer.test.ts",
  ]) {
    if (!exists(pathValue)) issues.push(`portable inventory coverage is missing: ${pathValue}`);
  }

  const docs = [
    "README.md",
    "docs/cli-quickref.md",
    "docs-docusaurus/docs/reference/cli/machine.md",
    "docs-docusaurus/docs/concepts/local-store.md",
    ".ai/analyses/116_drwn-cli-card-worker-target-architecture.md",
    ".ai/knowledges/10_drwn-cli-architecture.md",
  ].map(source).join("\n");
  for (const [token, label] of [
    ["drwn machine inventory export", "export command documentation"],
    ["drwn machine inventory bundle", "bundle command documentation"],
    ["drwn machine inventory verify", "verify command documentation"],
    ["drwn machine inventory sync", "sync command documentation"],
    ["not a backup or restore", "backup/restore boundary"],
    ["checksum is not authenticity", "checksum and authenticity boundary"],
    ["source-content safeguard", "secret detector limitation"],
    ["extras are preserved", "additive extras behavior"],
    ["no `machine.json`", "fresh-home intent isolation"],
    ["whole-Store", "whole-Store prohibition"],
  ] as const) {
    if (!docs.includes(token)) issues.push(`portable inventory docs are missing ${label}`);
  }
  if (!source("docs-docusaurus/docs/reference/cli/machine.md").includes("checksum is not authenticity")) {
    issues.push("portable inventory docs are missing checksum and authenticity boundary");
  }
  if (/portable inventory(?: transfer| artifacts?)?(?: is| provides| serves as) (?!not )(?:a )?(?:full )?(?:backup|restore)|carrying credentials/i.test(docs)) {
    issues.push("portable docs contain a backup or credential-carrying transfer claim");
  }

  const storeExportSecurity = verifyStoreExportSecurity(root, overrides);
  if (!storeExportSecurity.ok) issues.push(storeExportSecurity.details ?? "whole-Store export security is not enforced");

  return {
    name: "portable machine inventory transfer",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifyMachineContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing machine contract source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: string[]) => {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) issues.push(`${pathValue} is missing ${token}`);
    }
  };

  requireTokens("cli/core/machine-config.ts", [
    'schema: z.literal("drwn.machine")',
    "schemaVersion: z.literal(2)",
    "capabilities: z.object",
    "activeWorker: canonicalCardName.nullable()",
    "workerLock: z.unknown().nullable()",
    "validateCardLockfile",
    "machine Worker root",
    "MACHINE_CONFIG_INVALID",
    ".strict()",
  ]);
  requireTokens("cli/core/user-config.ts", [
    "resolveMachineConfigPath",
    "readMachineConfigFile",
    "mergeMachinePolicy(repoConfig, machineConfig)",
  ]);
  requireTokens("cli/core/user-preferences.ts", [
    'schema: z.literal("drwn.user-preferences")',
    "schemaVersion: z.literal(1)",
    "catalogCheckouts: z.array(checkoutPath)",
    "defaultAuthorScope: z.string().min(1).optional()",
    "USER_PREFERENCES_INVALID",
    "resolveUserConfigPath",
    ".strict()",
  ]);
  requireTokens("cli/core/defaults.ts", [
    "resolveMachineCapabilities",
    "machine.capabilities.workerLock",
    "machine.capabilities.activeWorker",
    "verifyMachineCardContent",
    "MACHINE_WORKER_INTEGRITY_MISMATCH",
  ]);
  requireTokens("cli/core/worker-machine.ts", [
    "applyMachineWorkerRoots",
    "useMachineWorker",
    "assertBlueprintRoots",
    "preserveConsent",
  ]);
  requireTokens("cli/core/diagnostics.ts", [
    "buildMachineStatusV2",
    "activeClosure",
    'provenance: "worker"',
    "resolveMachineCapabilities",
  ]);
  requireTokens("cli/core/card-from-defaults.ts", [
    "resolveMachineCapabilities",
    "capabilities.skills",
    "capabilities.mcpServers",
  ]);
  requireTokens("cli/commands/machine/skill.ts", [
    "Direct machine skill activation was removed",
    "drwn apply --root",
    "drwn use --root",
  ]);
  requireTokens("cli/commands/machine/mcp.ts", [
    "Direct machine MCP activation was removed",
    "drwn apply --root",
    "drwn use --root",
  ]);

  const machineReaders = [
    "cli/core/machine-config.ts",
    "cli/core/defaults.ts",
    "cli/core/effective-state.ts",
    "cli/core/diagnostics.ts",
    "cli/core/card-from-defaults.ts",
    "cli/core/inventory-references.ts",
    "cli/commands/machine/skill.ts",
    "cli/commands/machine/mcp.ts",
  ];
  for (const pathValue of machineReaders) {
    const content = source(pathValue);
    for (const pattern of [
      /(?:machine|config)\.capabilities\.profile\b/,
      /(?:machine|config)\.capabilities\.skills\b/,
      /(?:machine|config)\.capabilities\.mcpServers\b/,
      /policy\.authoring\b/,
    ]) {
      if (pattern.test(content)) issues.push(`${pathValue} reads a retired V1 machine field`);
    }
  }
  if (/schemaVersion:\s*z\.literal\(1\)/.test(source("cli/core/machine-config.ts"))) {
    issues.push("machine config still accepts schemaVersion 1");
  }
  for (const retiredPath of [
    "cli/core/machine-profiles.ts",
    "cli/core/operator-profile-contract.ts",
    "registry/machine-profiles.json",
  ]) {
    if (Object.hasOwn(overrides, retiredPath) || existsSync(join(root, retiredPath))) {
      issues.push(`retired machine profile artifact remains: ${retiredPath}`);
    }
  }

  const activation = sourceSlice(source("cli/core/defaults.ts"), "export async function resolveMachineCapabilities", "export async function validateDefaultReferences");
  for (const forbidden of [
    "listCuratedSkills",
    "resolveDefaultSkillNames",
    "resolveDefaultMcpNames",
    "config.optional",
    "config.parallel",
    "listLibrarySkills",
    "loadMcpLibrary",
    "resolveCard(",
  ]) {
    if (activation.includes(forbidden)) issues.push(`machine activation reads ${forbidden}`);
  }

  const index = source("cli/index.ts");
  for (const command of ["SkillsCurateCommand", "SkillsUncurateCommand"]) {
    if (index.includes(command)) issues.push(`cli/index.ts registers retired curation command ${command}`);
  }
  for (const pathValue of ["cli/commands/skills/curate.ts", "cli/commands/skills/uncurate.ts"]) {
    if (existsSync(join(root, pathValue))) issues.push(`retired curation command file remains: ${pathValue}`);
  }

  const ownershipTests = source("test/scenarios-root-scope.test.ts");
  for (const [token, label] of [
    ['const foreignMcpTargets = ["claude", "codex", "cursor"] as const', "foreign ownership coverage is missing"],
    ["including dry-run and force", "dry-run/force ownership coverage is missing"],
    ["detects drift only for drwn-owned MCP server entries", "owned MCP drift coverage is missing"],
    ["rejects drifted prior-owned MCP entries until force removes them", "drifted MCP removal coverage is missing"],
  ] as const) {
    if (!ownershipTests.includes(token)) issues.push(label);
  }
  const machineBlueprintTests = source("test/e2e-machine-blueprint.test.ts");
  if (!machineBlueprintTests.includes("rejects stale drift across generated, skill, hook, and instruction surfaces")) {
    issues.push("cross-surface machine removal drift coverage is missing");
  }
  const skillOwnershipTests = source("test/commands-write-drift.test.ts");
  if (!skillOwnershipTests.includes('for (const variant of ["different", "identical"] as const)')) {
    issues.push("foreign skill ownership coverage is missing");
  }

  const forwardDocPaths = [...new Set([
    "README.md",
    "INSTALL.md",
    ...[...new Bun.Glob("**/*.md").scanSync({ cwd: join(root, "docs") })]
      .filter((pathValue) => !pathValue.startsWith("plans/"))
      .map((pathValue) => `docs/${pathValue}`),
    ...[...new Bun.Glob("**/*.md").scanSync({ cwd: join(root, "docs-astro/src/content/docs") })]
      .map((pathValue) => `docs-astro/src/content/docs/${pathValue}`),
    ...[...new Bun.Glob("**/*.md").scanSync({ cwd: join(root, "docs-docusaurus/docs") })]
      .map((pathValue) => `docs-docusaurus/docs/${pathValue}`),
    ...[...new Bun.Glob("**/*.{md,html}").scanSync({ cwd: join(root, ".ai/knowledges") })]
      .map((pathValue) => `.ai/knowledges/${pathValue}`),
  ])];
  const forwardDocs = forwardDocPaths.map(source).join("\n");
  for (const token of [
    '"schema": "drwn.machine"',
    '"schemaVersion": 2',
    "activeWorker",
    "workerLock",
    "drwn apply --root",
    "drwn use --root",
    "drwn write --root",
    "MACHINE_PROJECTION_CONFLICT",
  ]) {
    if (!forwardDocs.includes(token)) issues.push(`machine contract docs are missing ${token}`);
  }
  const staleMachineDocPatterns = [
    /drwn skills (?:curate|uncurate)/,
    /drwn (?:library|store)(?:\s|`)/,
    /future Task 80/i,
    /"defaults"\s*:/,
    /defaults\.(?:skills|mcpServers)/,
    /curated publication layer/i,
    /machine-wide active MCP defaults live/i,
    /^\s*drwn machine (?:skill|mcp) (?:enable|disable)\b/m,
    /Recommended Darwinian Operator profile/i,
  ];
  for (const pathValue of forwardDocPaths) {
    const content = source(pathValue);
    if (staleMachineDocPatterns.some((pattern) => pattern.test(content))) {
      issues.push(`prototype machine documentation remains in ${pathValue}`);
    }
  }

  const storeExportSecurity = verifyStoreExportSecurity(root, overrides);
  if (!storeExportSecurity.ok) issues.push(storeExportSecurity.details ?? "whole-Store export security is not enforced");

  let packageVersion: string | undefined;
  try {
    packageVersion = (JSON.parse(source("package.json")) as { version?: string }).version;
  } catch {
    issues.push("package.json must be valid JSON");
  }
  const runtimeVersion = runtimeVersionFromSource(source("cli/core/version.ts"), packageVersion, issues);
  if (packageVersion !== TARGET_RELEASE_VERSION) issues.push(`package version must be ${TARGET_RELEASE_VERSION}`);
  if (!isAtLeast(packageVersion, FIRST_SUPPORTED_WORKER_VERSION)) {
    issues.push(`package version must be at least the ${FIRST_SUPPORTED_WORKER_VERSION} Worker hard-cut floor`);
  }
  if (runtimeVersion !== packageVersion) issues.push("runtime version must match package version");

  return {
    name: "machine capability contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifyWorkerContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing contract source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: string[]) => {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) issues.push(`${pathValue} is missing ${token}`);
    }
  };

  requireTokens("cli/core/project.ts", [
    'schema: "drwn.project-config"',
    "schemaVersion: 1",
    'input.schema !== "drwn.project-config"',
    "input.schemaVersion !== 1",
  ]);
  requireTokens("cli/core/card-lock.ts", [
    'schema: "drwn.project-lock"',
    "schemaVersion: 1",
    'input.schema !== "drwn.project-lock"',
    "input.schemaVersion !== 1",
    "minimumDrwnVersionForManifests",
  ]);
  requireTokens("cli/core/mind-capability.ts", [
    'PROJECT_WORKER_MIN_DRWN_VERSION = "0.8.0"',
  ]);
  requireTokens("cli/core/config-local.ts", ["PROJECT_WORKER_MIN_DRWN_VERSION"]);

  const projectReaders = [
    "cli/core/project.ts",
    "cli/core/card-lock.ts",
    "cli/core/worker-project.ts",
    "cli/core/effective-state.ts",
    "cli/core/project-writes.ts",
    "cli/core/config-local.ts",
    "cli/commands/install.ts",
  ];
  for (const pathValue of projectReaders) {
    const content = source(pathValue);
    for (const field of ["activeWorkers", "defaultActiveWorkers", "selectActiveCards", "lockfileVersion"]) {
      if (new RegExp(`\\b${field}\\b`).test(content)) {
        issues.push(`${pathValue} reads prototype project field ${field}`);
      }
    }
  }

  const index = source("cli/index.ts");
  for (const command of [
    "CardApplyCommand",
    "CardAddCommand",
    "CardPinCommand",
    "CardRemoveCommand",
    "CardDetachCommand",
    "CardUpdateCommand",
    "WorkerStackListCommand",
    "WorkerStackUseCommand",
    "WorkerStackClearCommand",
  ]) {
    if (index.includes(command)) issues.push(`cli/index.ts registers retired project command ${command}`);
  }
  for (const pathValue of [
    "cli/commands/card/add.ts",
    "cli/commands/card/apply.ts",
    "cli/commands/card/detach.ts",
    "cli/commands/card/pin.ts",
    "cli/commands/card/remove.ts",
    "cli/commands/card/update.ts",
    "cli/commands/worker/stack/list.ts",
    "cli/commands/worker/stack/use.ts",
    "cli/commands/worker/stack/clear.ts",
  ]) {
    if (existsSync(join(root, pathValue))) issues.push(`retired command file remains: ${pathValue}`);
  }
  for (const pathValue of ["cli/core/migrate-vendor.ts"]) {
    const exists = Object.hasOwn(overrides, pathValue) || existsSync(join(root, pathValue));
    if (exists) issues.push(`prototype migration adapter remains: ${pathValue}`);
  }
  if (/--no-apply|\bnoApply\b/.test(source("cli/commands/install.ts"))) {
    issues.push("install still accepts retired --no-apply");
  }

  const generator = source("cli/core/worker-generator/sync-worker.ts");
  for (const token of [
    "selectedRootsForProjection",
    "return selection.installedRoots",
    "return selection.selectedRoot ? [selection.selectedRoot] : []",
    "for (const root of roots)",
  ]) {
    if (!generator.includes(token)) issues.push(`generated Worker sync is missing ${token}`);
  }
  if (/for\s*\(const card of state\.lockedCards\)/.test(generator)) {
    issues.push("generated Worker sync treats locked member Cards as roots");
  }

  const syncSource = source("cli/core/sync.ts");
  const machineProjection = sourceSlice(
    syncSource,
    "export function planMachineManagedPaths",
    "export interface MachineProjectionConflict",
  );
  const projectEvaluation = source("cli/core/effective-state.ts") + syncSource.replace(machineProjection, "");
  for (const machinePath of ["listCuratedSkills", "resolveCuratedSkillsDir", "claude-only", "codex-only"]) {
    if (projectEvaluation.includes(machinePath)) {
      issues.push(`project evaluation scans machine compatibility source ${machinePath}`);
    }
  }
  requireTokens("cli/core/effective-state.ts", [
    "projectBaseConfig(repoConfig)",
    "projectBaseRegistry(builtInRegistry, projectConfig)",
  ]);

  for (const pathValue of [
    "cli/commands/status.ts",
    "cli/commands/mcp/list.ts",
    "cli/commands/add/mcp.ts",
    "cli/commands/write.ts",
  ]) {
    if (!source(pathValue).includes("buildEffectiveState")) {
      issues.push(`${pathValue} does not consume buildEffectiveState`);
    }
  }
  if (!source("cli/core/diagnostics.ts").includes("buildEffectiveState")) {
    issues.push("doctor/status diagnostics do not consume buildEffectiveState");
  }
  const commandConsumers = [
    "cli/commands/status.ts",
    "cli/commands/doctor.ts",
    "cli/commands/mcp/list.ts",
    "cli/commands/add/mcp.ts",
    "cli/commands/add/skill.ts",
  ].map(source).join("\n");
  for (const alternate of ["loadEffectiveConfig", "mergeProjectConfig", "buildActiveServers"]) {
    if (commandConsumers.includes(alternate)) issues.push(`command consumer rebuilds state with ${alternate}`);
  }
  requireTokens("cli/commands/add/mcp.ts", [
    "inactiveCardServerDefinitions",
    "MCP_DEFINITION_NOT_EFFECTIVE",
  ]);

  const forwardDocPaths = [
    "README.md",
    "INSTALL.md",
    "docs/cli-quickref.md",
    "docs/contracts/project-worker-v1.md",
    "docs/prelaunch-project-reset.md",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/09_cards-manual-test-guide.md",
    ".ai/knowledges/10_drwn-cli-architecture.md",
    ".ai/knowledges/11_card-usage-guide.html",
    ...Array.from(new Bun.Glob("**/*.{md,mdx,html}").scanSync({ cwd: join(root, "docs-docusaurus", "docs") }))
      .map((pathValue) => `docs-docusaurus/docs/${pathValue}`),
  ];
  const staleDocPatterns = [
    /activeWorkers/,
    /drwn worker stack/,
    /active worker stack/i,
    /all installed workers are active/i,
    /drwn card (?:add|apply|remove|pin|update|detach)/,
    /--no-apply/,
    /COMMAND_MOVED/,
    /config\.json\.cards/,
    /"lockfileVersion"/,
    /activeMinds/,
    /active mind stack/i,
    /drwn mind (?:list|use|clear)/,
  ];
  for (const pathValue of forwardDocPaths) {
    const content = source(pathValue);
    if (staleDocPatterns.some((pattern) => pattern.test(content))) {
      issues.push(`prototype documentation remains in ${pathValue}`);
    }
  }

  const pkg = JSON.parse(source("package.json")) as { version?: string };
  const runtimeVersion = runtimeVersionFromSource(source("cli/core/version.ts"), pkg.version, issues);
  if (pkg.version !== TARGET_RELEASE_VERSION) issues.push(`package version must be ${TARGET_RELEASE_VERSION}`);
  if (!isAtLeast(pkg.version, FIRST_SUPPORTED_WORKER_VERSION)) {
    issues.push(`package version must be at least the ${FIRST_SUPPORTED_WORKER_VERSION} Worker hard-cut floor`);
  }
  if (runtimeVersion !== pkg.version) issues.push("runtime version must match package version");

  return {
    name: "project Worker contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifySemanticMindContract(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing semantic Mind source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: Array<[string, string]>) => {
    const content = source(pathValue);
    for (const [token, issue] of tokens) {
      if (!content.includes(token)) issues.push(issue);
    }
  };

  let packageVersion: string | undefined;
  try {
    packageVersion = (JSON.parse(source("package.json")) as { version?: string }).version;
  } catch {
    issues.push("package.json must be valid JSON");
  }
  const runtimeVersion = runtimeVersionFromSource(source("cli/core/version.ts"), packageVersion, issues);
  if (!packageVersion || !gte(packageVersion, "0.9.0")) {
    issues.push("package version must be at least 0.9.0");
  }
  if (runtimeVersion !== packageVersion) issues.push("runtime version must match package version");

  requireTokens("cli/core/mind-capability.ts", [
    ['PROJECT_WORKER_MIN_DRWN_VERSION = "0.8.0"', "base project Worker floor must remain 0.8.0"],
    ['WORKER_MIND_MIN_DRWN_VERSION = "0.9.0"', "semantic Worker Mind floor must be 0.9.0"],
    ["minimumDrwnVersionForManifests", "lock-wide semantic Mind floor selection is missing"],
  ]);
  requireTokens("cli/core/card-manifest.ts", [
    ['MemoryKind = "observations" | "insights"', "semantic memory kind union is missing"],
    ['["observations", "insights"]', "closed semantic memory kind inventory is missing"],
    ['observations?: { format: "jsonl" }', "observations JSONL manifest contract is missing"],
    ['insights?: { format: "md" }', "insights Markdown manifest contract is missing"],
    ['memory kind raw_data is reserved but unsupported', "raw_data reservation is missing"],
  ]);
  requireTokens("cli/core/mind-store/mind-index.ts", [
    ['z.literal("drwn.mind-index")', "strict mind index schema is missing"],
    ["schemaVersion: z.literal(1)", "strict mind index version is missing"],
    ["MIND_INDEX_INVALID", "invalid mind index diagnostic is missing"],
    ["MIND_INDEX_UNSUPPORTED", "unsupported mind index diagnostic is missing"],
  ]);
  requireTokens("cli/core/mind-store/paths.ts", [
    ["/pool/observations", "canonical observations pool path is missing"],
    ["/pool/insights", "canonical insights pool path is missing"],
    ["parseCanonicalPoolPath", "strict canonical pool parser is missing"],
  ]);
  requireTokens("test/worker-mind-semantic-residue.test.ts", [
    ["numbered contract residue", "numbered-memory residue gate is missing"],
  ]);
  requireTokens("test/e2e-mind-journey.test.ts", [
    ["semantic observations and insights preserve inode identity", "real semantic placement E2E coverage is missing"],
  ]);
  requireTokens("CHANGELOG.md", [
    ["## [0.9.0]", "0.9.0 changelog entry is missing"],
    ["no migration", "0.9.0 changelog must state the no migration policy"],
  ]);

  const hardCutSources = [
    "cli/core/card-manifest.ts",
    "cli/core/mind-capability.ts",
    "cli/core/mind-store/mind-index.ts",
    "cli/core/mind-store/paths.ts",
  ].map(source).join("\n");
  if (/MemoryLayerName|MEMORY_LAYER_NAMES|memoryLayerRoot|\b[lL][456]\b/.test(hardCutSources)) {
    issues.push("numbered-memory reader or symbol remains in the supported runtime");
  }

  return {
    name: "semantic Worker Mind contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

export function verifyAmbientMcpPolicy(root = repoRoot, overrides: SourceOverrides = {}): CheckResult {
  const issues: string[] = [];
  const source = (pathValue: string) => {
    if (Object.hasOwn(overrides, pathValue)) return overrides[pathValue]!;
    const absolutePath = join(root, pathValue);
    if (!existsSync(absolutePath)) {
      issues.push(`missing ambient policy source ${pathValue}`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };
  const requireTokens = (pathValue: string, tokens: string[]) => {
    const content = source(pathValue);
    for (const token of tokens) {
      if (!content.includes(token)) issues.push(`${pathValue} is missing ${token}`);
    }
  };

  requireTokens("cli/core/ambient-policy.ts", [
    "AMBIENT_IDENTICAL",
    "CLAUDE_SCOPE_SHADOW",
    "CODEX_PROJECT_AUGMENTS_USER",
    "CODEX_INCOMPATIBLE_TRANSPORTS",
    "CURSOR_PROJECT_MERGES_USER",
    "CURSOR_PROJECT_TRANSPORT_OVERRIDE",
    "OPENCODE_PROJECT_OVERRIDES_USER",
    "classifyAmbientMcpCollisions",
  ]);
  requireTokens("cli/core/effective-state.ts", [
    "inspectAmbientMcpDefinitions",
    "classifyAmbientMcpCollisions",
    "renderMcpServerForTarget",
    "selectedAmbientCollisions",
  ]);
  requireTokens("cli/core/sync.ts", ["assertAmbientMcpPreflight", "ambientCollisions"]);
  requireTokens("cli/commands/write.ts", ["assertAmbientMcpPreflight"]);
  requireTokens("cli/core/diagnostics.ts", [
    'enforcement: "target-native"',
    "state.ambientCollisions",
    "selectedAmbientCollisions(state)",
  ]);
  requireTokens("cli/commands/mcp/list.ts", ["state.ambientCollisions"]);

  const classifierTests = source("test/core-ambient-policy.test.ts");
  if (!classifierTests.includes("user-secret-sentinel") || !classifierTests.includes("project-secret-sentinel")) {
    issues.push("ambient classifier secret redaction coverage is missing");
  }
  const writeTests = source("test/commands-write.test.ts");
  if (!writeTests.includes("fatal selected-target MCP preflight aborts every projection mutation")) {
    issues.push("ambient policy full-command atomicity coverage is missing");
  }
  requireTokens("test/commands-write-codex-conflict.test.ts", [
    "a fatal Codex collision does not block a Claude-only write",
    "Codex fatal transport collisions cannot be bypassed with force",
    "user HTTP plus project stdio",
    "user stdio plus project HTTP",
  ]);
  requireTokens("test/commands-use-worker.test.ts", [
    "fatal ambient collision preserves selected Worker intent without projection mutation",
  ]);
  requireTokens("test/commands-doctor.test.ts", [
    "does not enforce a fatal-shaped collision on a disabled target",
  ]);

  const sync = source("cli/core/sync.ts");
  if (
    sync.includes("detectCodexLayerConflicts") ||
    sync.includes("codexConflicts") ||
    sync.includes("skipped the project-scope entry") ||
    sync.includes("rerun with --force")
  ) {
    issues.push("retired Codex collision path or force bypass remains in cli/core/sync.ts");
  }

  requireTokens("docs/cli-quickref.md", [
    "Target-native ambient MCP collisions",
    "CODEX_INCOMPATIBLE_TRANSPORTS",
  ]);
  requireTokens(".ai/knowledges/02_per-project-config-guide.md", [
    "target-native",
    "CODEX_INCOMPATIBLE_TRANSPORTS",
  ]);

  return {
    name: "ambient MCP policy",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}

async function verifySchemaPackageReachable() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const dep = pkg.dependencies?.["drwn-catalog-schema"];

  if (!dep) {
    return {
      name: "schema package coupling",
      ok: false,
      details: "Missing dependency: drwn-catalog-schema",
    } satisfies CheckResult;
  }

  if (dep.startsWith("file:") || dep.startsWith("link:") || dep.startsWith("workspace:")) {
    return {
      name: "schema package coupling",
      ok: true,
      details: `drwn-catalog-schema resolves locally (${dep}); skipping registry check`,
    } satisfies CheckResult;
  }

  const proc = Bun.spawn(["npm", "view", `drwn-catalog-schema@${dep}`, "version"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    name: "schema package coupling",
    ok: exitCode === 0,
    details:
      exitCode === 0
        ? `drwn-catalog-schema@${dep} resolves to ${stdout.trim()}`
        : `drwn-catalog-schema@${dep} not resolvable on npm: ${stderr.trim()}`,
  } satisfies CheckResult;
}

async function main() {
  const checks: CheckResult[] = [];
  const warnings: string[] = [];

  if (testMode) {
    checks.push({ name: "quality gate test mode", ok: true });
  } else {
    checks.push(await runCommand("bun test", ["bun", "run", "test"]));
    checks.push(await runCommand("typecheck", ["bun", "run", "typecheck"]));
  }

  const hardcodedPaths = findHardcodedUserPaths();
  checks.push({
    name: "hardcoded path scan",
    ok: hardcodedPaths.length === 0,
    details: hardcodedPaths.length > 0 ? hardcodedPaths.join(", ") : undefined,
  });

  const packageResult = verifyPackageMetadata();
  checks.push(packageResult.check);
  warnings.push(...packageResult.warnings);

  checks.push(verifyDocsPresence());
  checks.push(verifyWorkerContract());
  checks.push(verifySemanticMindContract());
  checks.push(verifyRecommendedMachineWorkerContract());
  checks.push(verifyMachineContract());
  checks.push(await verifyOperatorContract());
  checks.push(verifyMachineInventoryContract());
  checks.push(verifyPortableInventoryTransferContract());
  checks.push(verifyAmbientMcpPolicy());
  checks.push(verifyStoreExportSecurity());
  checks.push(await verifySchemaPackageReachable());
  checks.push(await verifyPackageContents());

  const report: GateReport = {
    ok: checks.every((check) => check.ok),
    checks,
    warnings,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of checks) {
      console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${check.details ? ` - ${check.details}` : ""}`);
    }
    for (const warning of warnings) {
      console.log(`WARN ${warning}`);
    }
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (import.meta.main) await main();
