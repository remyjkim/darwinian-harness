// ABOUTME: Verifies the offline Worker v2 derivation adapter against the accepted I268 process contract.
// ABOUTME: Pins operand confinement, descriptor-bound no-replace publication, and every persistence outcome code.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  FINCH_NESTED_INERT_RULE_SHA256,
  MAX_DIAGNOSTIC_BYTES,
  RUNTIME_ADMISSION_ADAPTER_ENTRY,
  RUNTIME_ADMISSION_ADAPTER_IMPLEMENTATION,
  RUNTIME_ADMISSION_ADAPTER_VERSION,
  RUNTIME_ADMISSION_COMMIT_STATES,
  RUNTIME_ADMISSION_DERIVE_COMMAND_ID,
  RUNTIME_ADMISSION_INPUT_SCHEMA,
  RUNTIME_ADMISSION_OUTPUT_SCHEMA,
  PERSISTENCE_OUTCOME_SCHEMA,
  formatPersistenceOutcome,
  readAdapterImplementation,
  readNestedInertRuleConfigBytes,
  runRuntimeAdmissionDerive,
  type PersistenceOutcomeCode,
  type RuntimeAdmissionDeriveSeam,
} from "../cli/core/runtime-admission-derive";
import { describeDescriptorSupport } from "../cli/core/runtime-admission-descriptors";
import { canonicalizeRuntimeAdmissionJson } from "../cli/core/runtime-admission-manifest";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PHASES = ["tools", "root"] as const;
type Phase = (typeof PHASES)[number];

const TOOLS_CARD = "@curation-labs/buzz-delivery-tools";
const WORKER_CARD = "@curation-labs/buzz-delivery-worker";
const TOOL_SELECTORS = [
  "mcp:buzz-tools/buzz_messages_send",
  "mcp:buzz-tools/buzz_messages_thread",
];
const REQUIREMENT_IDS = ["buzz-cli-artifact", "buzz-runtime-glibc"];
const TOOLS_PUBLICATION_REF = "github:curation-labs/buzz-delivery-tools#synthetic";

const descriptorSupport = describeDescriptorSupport();
const posixPlatform = process.platform === "linux" || process.platform === "darwin";
// The descriptor layer describes a struct layout for darwin on any architecture and
// for linux only on x64, and refuses to guess anywhere else.
const DESCRIBED_STRUCT_LAYOUT = process.platform === "darwin" ||
  (process.platform === "linux" && process.arch === "x64");

// A success-path case must never pass silently where the contract cannot be honoured.
// On the two required platforms an unsupported descriptor layer is a defect, so the
// suite fails rather than skips; only Windows takes the documented fail-closed branch.
function requireDescriptorSupport(): void {
  if (descriptorSupport.supported) return;
  if (posixPlatform) {
    throw new Error(
      `descriptor-bound persistence must be supported on ${process.platform}: ${descriptorSupport.reason}`,
    );
  }
}

const SKIP_POSIX = posixPlatform
  ? ""
  : `skipped on ${process.platform}: descriptor-bound POSIX persistence is unsupported by contract`;
const SKIP_UNSUPPORTED_PLATFORM = posixPlatform
  ? `skipped on ${process.platform}: this case asserts the unsupported-platform fail-closed branch`
  : "";

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function utf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function identity(phase: Phase, bytes: Uint8Array) {
  return {
    schema: "cl.i268.serialized-artifact-identity.v1",
    phase,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function encoded(bytes: Buffer) {
  return {
    encoding: "base64",
    bytesBase64: bytes.toString("base64"),
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function toolsManifest(): Record<string, unknown> {
  return {
    name: TOOLS_CARD,
    version: "0.1.0",
    description: "Synthetic Buzz delivery tools capability",
    servers: {
      "buzz-tools": {
        description: "Buzz delivery tools exposed by the Darwinian Worker runtime",
        transport: "stdio",
        command: "drwn",
        args: ["worker", "buzz-tools"],
        optional: false,
      },
    },
    runtimeAdmission: {
      version: 1,
      servers: { "buzz-tools": { authMode: "none", requirementIds: REQUIREMENT_IDS } },
      requirements: [
        {
          requirementId: "buzz-cli-artifact",
          probeId: "buzz-artifact-sha256-v1",
          expected: { artifactSha256: "b".repeat(64) },
        },
        {
          requirementId: "buzz-runtime-glibc",
          probeId: "glibc-version-v1",
          expected: { platformCapabilities: ["glibc>=2.31"] },
        },
      ],
    },
    applicationRequirements: { version: 1, apps: [] },
    license: "Apache-2.0",
    harness: { minVersion: "1.3.0" },
    stability: "experimental",
    lastValidatedWith: "1.3.0",
  };
}

function workerManifest(): Record<string, unknown> {
  return {
    name: WORKER_CARD,
    version: "0.1.0",
    kind: "blueprint",
    composedFrom: [TOOLS_CARD],
    description: "Synthetic Buzz delivery worker blueprint",
    license: "Apache-2.0",
    harness: { minVersion: "1.3.0" },
    stability: "experimental",
    lastValidatedWith: "1.3.0",
    runtimeAdmission: { version: 1, servers: {}, requirements: [] },
    applicationRequirements: { version: 1, apps: [] },
    tools: { allow: TOOL_SELECTORS, deny: [] },
  };
}

interface CardMaterial {
  name: string;
  version: string;
  requested: string;
  treeSha: string;
  manifestBytes: Buffer;
}

interface MaterialMutators {
  manifest?: (manifest: any) => void;
  lock?: (lock: any) => void;
  /** Rewrites the candidate before it is encoded, so every byte identity moves with it. */
  candidate?: (candidate: any) => void;
}

function cardMaterial(phase: Phase, mutators: MaterialMutators = {}): CardMaterial[] {
  const manifest = toolsManifest();
  mutators.manifest?.(manifest);
  const toolsBytes = utf8(JSON.stringify(manifest));
  const tools: CardMaterial = {
    name: TOOLS_CARD,
    version: "0.1.0",
    requested: "https://github.com/curation-labs/buzz-delivery-tools.git#synthetic",
    treeSha: "1".repeat(40),
    manifestBytes: toolsBytes,
  };
  if (phase === "tools") return [tools];
  const workerBytes = utf8(JSON.stringify(workerManifest()));
  const worker: CardMaterial = {
    name: WORKER_CARD,
    version: "0.1.0",
    requested: "https://github.com/curation-labs/buzz-delivery-worker.git#synthetic",
    treeSha: "2".repeat(40),
    manifestBytes: workerBytes,
  };
  return [worker, tools];
}

function cardSummary(card: CardMaterial) {
  return {
    name: card.name,
    version: card.version,
    requested: card.requested,
    integrity: `sha256-${sha256(card.manifestBytes)}`,
    treeSha: card.treeSha,
    manifestIdentity: {
      byteLength: card.manifestBytes.byteLength,
      sha256: sha256(card.manifestBytes),
    },
  };
}

function lockBytes(phase: Phase, cards: CardMaterial[], mutators: MaterialMutators = {}): Buffer {
  const urls: Record<string, string> = {
    [TOOLS_CARD]: "https://github.com/curation-labs/buzz-delivery-tools.git",
    [WORKER_CARD]: "https://github.com/curation-labs/buzz-delivery-worker.git",
  };
  const first = cards[0]!;
  const lock: any = {
    schema: "cl.i268.synthetic-card-lock.v1",
    entrypoint: {
      name: first.name,
      version: first.version,
      kind: phase === "tools" ? "capability" : "blueprint",
    },
    cards: cards.map((card) => ({
      name: card.name,
      version: card.version,
      requested: card.requested,
      integrity: `sha256-${sha256(card.manifestBytes)}`,
      treeSha: card.treeSha,
      origin: "git",
      path: `cards/${card.name}`,
      git: { url: urls[card.name], ref: "synthetic", commit: card.treeSha },
      skills: [],
      hooks: [],
      registry: null,
    })),
    store: { minDrwnVersion: "1.3.0" },
  };
  mutators.lock?.(lock);
  return utf8(JSON.stringify(lock));
}

function phaseEvidence(phase: Phase) {
  // Publication identities describe the tools artifact in both phases.
  const publication = {
    receiptIdentity: identity("tools", utf8("tools-receipt")),
    immutableRef: TOOLS_PUBLICATION_REF,
    refetchIdentity: identity("tools", utf8("tools-refetch")),
  };
  return {
    serverIds: ["buzz-tools"],
    requirementIds: REQUIREMENT_IDS,
    toolSelectors: phase === "tools" ? [] : TOOL_SELECTORS,
    deny: [],
    toolsPublication: phase === "tools" ? null : publication,
  };
}

const STORE_EXPORT = {
  format: "tar",
  compression: "gzip",
  encoding: "base64",
  byteLength: 268,
  sha256: "d".repeat(64),
};

// The adapter's own source identity and the source the released package was built
// from are different referents, so the fixture keeps them distinct: a comparison that
// confuses the two would pass under equal values and prove nothing.
const WORKER_SOURCE_COMMIT = "8".repeat(40);
const WORKER_SOURCE_TREE = "9".repeat(40);
const RELEASE_SOURCE_COMMIT = "e".repeat(40);
const RELEASE_SOURCE_TREE = "f".repeat(40);
const RELEASE_PACKAGE_INTEGRITY =
  "sha512-iV91GIi4km5zq8vTodp2z6T/3orT0+oj3LYGBLgL35/p2D+NpAMNFpQLaf/0q2BX0AwwQIkgr+bYnzXB1rR4rQ==";

function candidateBytes(
  phase: Phase,
  cards: CardMaterial[],
  lock: Buffer,
  mutators: MaterialMutators = {},
): Buffer {
  const evidence = phaseEvidence(phase);
  const candidate: Record<string, unknown> = {
    schema: `cl.i268.finch-${phase}-candidate.v1`,
    classification: `production_${phase}_candidate`,
    phase,
    target: {
      designationIdentity: identity(phase, utf8("designation")),
      collisionSnapshotIdentity: identity(phase, utf8("collision")),
    },
    source: {
      repository: phase === "tools"
        ? "https://github.com/curation-labs/buzz-delivery-tools.git"
        : "https://github.com/curation-labs/buzz-delivery-worker.git",
      commit: "3".repeat(40),
      tree: "4".repeat(40),
      card: {
        blob: "5".repeat(40),
        byteLength: cards[0]!.manifestBytes.byteLength,
        sha256: sha256(cards[0]!.manifestBytes),
      },
      sidecar: phase === "tools"
        ? { blob: "6".repeat(40), byteLength: 12, sha256: sha256(utf8("sidecar-body")) }
        : null,
    },
    producerSources: {
      worker: {
        repository: "remyjkim/darwinian-worker",
        commit: WORKER_SOURCE_COMMIT,
        tree: WORKER_SOURCE_TREE,
        adapterVersion: "cl.i265.worker-runtime-admission-adapter.v1",
        // The frozen rollup a candidate carries is reviewed evidence, not something
        // this producer reproduces; it publishes the rollup over its own real bytes.
        adapterImplementationSha256: "1".repeat(64),
      },
      services: {
        repository: "curation-labs/darwinian-services",
        commit: "a".repeat(40),
        tree: "b".repeat(40),
        adapterVersion: "cl.i266.services-runtime-admission-adapter.v1",
        adapterImplementationSha256: "2".repeat(64),
      },
    },
    release: {
      workerPackageVersion: "1.3.0",
      workerSourceCommit: RELEASE_SOURCE_COMMIT,
      workerSourceTree: RELEASE_SOURCE_TREE,
      workerPackageIdentity: identity(phase, utf8("worker-package")),
      workerPackageIntegrity: RELEASE_PACKAGE_INTEGRITY,
      workerExecutableIdentity: identity(phase, utf8("worker-executable")),
      integratedReceiptIdentity: identity(phase, utf8("integrated-receipt")),
      sourceEquivalenceReceiptIdentity: identity(phase, utf8("source-equivalence")),
      commonBuzzSha256: "c".repeat(64),
      provisional: false,
    },
    closure: {
      entrypoint: {
        name: cards[0]!.name,
        version: "0.1.0",
        kind: phase === "tools" ? "capability" : "blueprint",
      },
      cards: cards.map(cardSummary),
      cardLock: {
        byteLength: lock.byteLength,
        sha256: sha256(lock),
        storeMinDrwnVersion: "1.3.0",
      },
      storeExportIdentity: STORE_EXPORT,
    },
    phaseEvidence: evidence,
    noSecretScan: { commandIdentity: "cl.i268.no-secret-scan.v1", result: "pass" },
  };
  if (phase === "root") candidate.toolsPublication = evidence.toolsPublication;
  mutators.candidate?.(candidate);
  return utf8(JSON.stringify(candidate));
}

type Mutator = (input: Record<string, any>) => void;

function derivationInput(phase: Phase, mutate?: Mutator, material: MaterialMutators = {}): string {
  const cards = cardMaterial(phase, material);
  const lock = lockBytes(phase, cards, material);
  const candidate = candidateBytes(phase, cards, lock, material);
  const input: Record<string, any> = {
    schema: RUNTIME_ADMISSION_INPUT_SCHEMA,
    schemaVersion: 1,
    phase,
    candidate: {
      schema: `cl.i268.finch-${phase}-candidate.v1`,
      identity: identity(phase, candidate),
      encoding: "base64",
      bytesBase64: candidate.toString("base64"),
    },
    derivationPreimage: {
      entrypoint: {
        name: cards[0]!.name,
        version: "0.1.0",
        kind: phase === "tools" ? "capability" : "blueprint",
      },
      cards: cards.map((card) => ({
        name: card.name,
        version: card.version,
        requested: card.requested,
        integrity: `sha256-${sha256(card.manifestBytes)}`,
        treeSha: card.treeSha,
        manifest: encoded(card.manifestBytes),
      })),
      cardLock: { ...encoded(lock), storeMinDrwnVersion: "1.3.0" },
    },
    context: {
      storeExportIdentity: STORE_EXPORT,
      phaseEvidence: phaseEvidence(phase),
      noSecretEvidence: {
        schema: "cl.i268.complete-derivation-preimage-no-secret.v1",
        result: "pass",
        rule: {
          schema: "cl.i268.finch-nested-inert-rule-config.v1",
          schemaVersion: 1,
          configSha256: FINCH_NESTED_INERT_RULE_SHA256,
        },
        receiptIdentity: identity(phase, utf8("no-secret-receipt")),
        covered: {
          candidateSha256: sha256(candidate),
          manifestSha256s: cards.map((card) => sha256(card.manifestBytes)),
          cardLockSha256: sha256(lock),
        },
      },
    },
  };
  mutate?.(input);
  return JSON.stringify(input);
}

const PACKAGED_BUILD_IDENTITY = {
  kind: "packaged" as const,
  schema: "darwinian.worker.build-identity" as const,
  schemaVersion: 1 as const,
  version: "1.3.0",
  sourceCommit: RELEASE_SOURCE_COMMIT,
  qualificationEligible: true,
};

const DEVELOPMENT_BUILD_IDENTITY = {
  kind: "development" as const,
  schema: "darwinian.worker.build-identity" as const,
  schemaVersion: 1 as const,
  version: "1.3.0",
  sourceCommit: "0".repeat(40),
  qualificationEligible: false,
};

const roots: string[] = [];

function confinementRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "i265-derive-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    rmSync(root, { recursive: true, force: true });
  }
});

interface RunOptions {
  phase?: Phase;
  input?: string | null;
  inputOperand?: string;
  outputOperand?: string;
  seams?: Record<string, RuntimeAdmissionDeriveSeam>;
  buildIdentity?: typeof PACKAGED_BUILD_IDENTITY | typeof DEVELOPMENT_BUILD_IDENTITY;
  mutate?: Mutator;
  material?: MaterialMutators;
  root?: string;
}

interface RunResult {
  root: string;
  outcome: Awaited<ReturnType<typeof runRuntimeAdmissionDerive>>;
  entries: string[];
  outputPath: string;
}

async function run(options: RunOptions = {}): Promise<RunResult> {
  const root = options.root ?? confinementRoot();
  const phase = options.phase ?? "tools";
  const inputOperand = options.inputOperand ?? "derivation-input.json";
  const outputOperand = options.outputOperand ?? "result.json";
  const contents = options.input === undefined
    ? derivationInput(phase, options.mutate, options.material)
    : options.input;
  // The admitted input always lives at the default name; a rejected operand is only
  // ever an argv value and must never require a file to exist.
  if (contents !== null) writeFileSync(join(root, "derivation-input.json"), contents);
  const outcome = await runRuntimeAdmissionDerive({
    argv: ["--input", inputOperand, "--output", outputOperand],
    workingDirectory: root,
    loadBuildIdentity: async () => options.buildIdentity ?? PACKAGED_BUILD_IDENTITY,
    seams: options.seams,
  });
  return {
    root,
    outcome,
    entries: readdirSync(root).sort(),
    outputPath: join(root, outputOperand),
  };
}

/**
 * Sets the unused padding bits of the final data character so the string decodes to
 * the same bytes but is no longer the canonical encoding of them.
 */
function noncanonicalBase64(canonical: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const decoded = Buffer.from(canonical, "base64");
  const padding = canonical.endsWith("==") ? 2 : canonical.endsWith("=") ? 1 : 0;
  if (padding === 0) throw new Error("the fixture must encode with padding for this case");
  const position = canonical.length - padding - 1;
  for (const character of alphabet) {
    const variant = `${canonical.slice(0, position)}${character}${canonical.slice(position + 1)}`;
    if (variant === canonical) continue;
    if (!Buffer.from(variant, "base64").equals(decoded)) continue;
    return variant;
  }
  throw new Error("no noncanonical variant exists for this encoding");
}

function temporaryEntries(entries: readonly string[]): string[] {
  return entries.filter((entry) => entry !== "derivation-input.json" && entry !== "result.json");
}

function fault(message: string): RuntimeAdmissionDeriveSeam {
  return () => {
    throw new Error(message);
  };
}

function expectCode(result: RunResult, code: PersistenceOutcomeCode): void {
  expect(result.outcome).not.toBeNull();
  expect(result.outcome!.code).toBe(code);
  expect(result.outcome!.commitState).toBe(RUNTIME_ADMISSION_COMMIT_STATES[code]);
  expect(result.outcome!.retry).toBe("forbidden");
  if (RUNTIME_ADMISSION_COMMIT_STATES[code] === "not_committed") {
    expect(result.outcome!.artifactIdentity).toBeNull();
  } else {
    expect(result.outcome!.artifactIdentity).not.toBeNull();
  }
}

describe("adapter binding", () => {
  test("package command, adapter files, and schema identities are the accepted binding", async () => {
    const packageMetadata = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(packageMetadata.scripts[RUNTIME_ADMISSION_DERIVE_COMMAND_ID]).toBe(
      "bun run cli/tools/runtime-admission-derive.ts",
    );
    expect(RUNTIME_ADMISSION_DERIVE_COMMAND_ID).toBe("runtime-admission:derive:v2");
    expect(RUNTIME_ADMISSION_ADAPTER_VERSION).toBe("cl.i265.worker-runtime-admission-adapter.v1");
    expect(RUNTIME_ADMISSION_INPUT_SCHEMA).toBe("cl.i268.finch-derivation-input.v1");
    expect(RUNTIME_ADMISSION_OUTPUT_SCHEMA).toBe("cl.i268.finch-derivation-output.v2");
    expect(RUNTIME_ADMISSION_ADAPTER_ENTRY).toBe("cli/tools/runtime-admission-derive.ts");
    expect(lstatSync(join(REPO_ROOT, RUNTIME_ADMISSION_ADAPTER_ENTRY)).isFile()).toBe(true);
  });

  test("the attested implementation set is the real bytes of every contract file", () => {
    // The rollup is recomputed here from the files on disk rather than compared against
    // a second hardcoded digest, so any edit to any of them fails this case. A frozen
    // table cannot express this: whichever file held it would contain its own digest.
    const { implementation, implementationSha256 } = readAdapterImplementation();
    expect(implementation.map(({ path }) => path)).toEqual([...RUNTIME_ADMISSION_ADAPTER_IMPLEMENTATION]);
    expect(implementation).toHaveLength(5);
    // The entrypoint is a fourteen-line shim, so an attestation that named only it and
    // one collaborator would not change when the contract itself was replaced.
    expect(implementation.some(({ path }) => path === RUNTIME_ADMISSION_ADAPTER_ENTRY)).toBe(true);
    for (let index = 1; index < implementation.length; index += 1) {
      expect(implementation[index - 1]!.path < implementation[index]!.path).toBe(true);
    }
    for (const entry of implementation) {
      const bytes = readFileSync(join(REPO_ROOT, entry.path));
      expect(entry.byteLength, entry.path).toBe(bytes.byteLength);
      expect(entry.sha256, entry.path).toBe(sha256(bytes));
      expect(Buffer.byteLength(entry.path)).toBeLessThanOrEqual(256);
      expect(entry.path.normalize("NFC")).toBe(entry.path);
    }
    expect(implementationSha256).toBe(sha256(utf8(JSON.stringify(implementation))));
  });

  test("the adapter dispatches on no shared error type, which is why errors.ts is excluded", () => {
    // cli/core/errors.ts is reachable through the derivation module but carries none of
    // the process-adapter contract, and 61 unrelated modules import it. The exclusion
    // holds only while nothing here dispatches on those types, so that is asserted
    // rather than left as a condition nobody re-checks.
    expect([...RUNTIME_ADMISSION_ADAPTER_IMPLEMENTATION]).not.toContain("cli/core/errors.ts");
    for (const file of ["cli/core/runtime-admission-derive.ts", RUNTIME_ADMISSION_ADAPTER_ENTRY]) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect(source, file).not.toContain("DrwnError");
      expect(source, file).not.toContain("NotAuthenticatedError");
    }
  });

  test("the adapter never registers a deploy or network control plane", () => {
    for (const file of [
      RUNTIME_ADMISSION_ADAPTER_ENTRY,
      "cli/core/runtime-admission-derive.ts",
      "cli/core/runtime-admission-descriptors.ts",
    ]) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect(source, file).not.toMatch(/fetch\(|node:https?|node:net|Bun\.spawn|child_process/);
      expect(source, file).not.toMatch(/process\.env|import\.meta\.env/);
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
      expect(imports.some((specifier) =>
        /darwinian-services|ops\/i268|finch-receipt-contract|finch-card-parity/.test(specifier)), file)
        .toBe(false);
    }
  });
});

describe("nested inert rule config", () => {
  test("the embedded config is exactly the frozen 1225 canonical bytes", () => {
    const bytes = readNestedInertRuleConfigBytes();
    expect(bytes.byteLength).toBe(1_225);
    expect(sha256(bytes)).toBe(FINCH_NESTED_INERT_RULE_SHA256);
    expect(FINCH_NESTED_INERT_RULE_SHA256).toBe(
      "32225d0b5dda0d2a7ad37981d7441cde12a83a1200d2bdafbff25add0f300c2a",
    );
    // The accepted parser rejects a trailing LF, so an editor or hook that adds one
    // must fail here rather than at I268 parse time.
    expect(bytes.at(-1)).not.toBe(0x0a);
    expect(JSON.stringify(JSON.parse(Buffer.from(bytes).toString("utf8")))).toBe(
      Buffer.from(bytes).toString("utf8"),
    );
  });
});

describe("diagnostic envelope bytes", () => {
  const IDENTITY_BEARING_LENGTHS: Record<string, { tools: number; root: number }> = {
    WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE: { tools: 360, root: 359 },
    WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE: { tools: 371, root: 370 },
    WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED: { tools: 365, root: 364 },
    WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE: { tools: 378, root: 377 },
    WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED: { tools: 369, root: 368 },
  };
  const NOT_COMMITTED_LENGTHS: Record<string, number> = {
    WORKER_RUNTIME_ADMISSION_INPUT_INVALID: 191,
    WORKER_RUNTIME_ADMISSION_DERIVATION_FAILED: 195,
    WORKER_RUNTIME_ADMISSION_OUTPUT_SERIALIZATION_FAILED: 205,
    WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED: 199,
    WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS: 191,
    WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED: 208,
    WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED: 214,
    WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE: 227,
  };
  const FIXED_IDENTITY = (phase: Phase) => ({
    schema: "cl.i268.serialized-artifact-identity.v1" as const,
    phase,
    byteLength: 1,
    sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
  });

  test("the closed code set is exactly the accepted thirteen", () => {
    expect(MAX_DIAGNOSTIC_BYTES).toBe(512);
    expect(Object.keys(RUNTIME_ADMISSION_COMMIT_STATES).sort()).toEqual(
      [...Object.keys(IDENTITY_BEARING_LENGTHS), ...Object.keys(NOT_COMMITTED_LENGTHS)].sort(),
    );
    expect(Object.keys(RUNTIME_ADMISSION_COMMIT_STATES)).toHaveLength(13);
    expect(PERSISTENCE_OUTCOME_SCHEMA).toBe(
      "cl.i265.worker-runtime-admission-persistence-outcome.v1",
    );
  });

  test("the fixed commit-indeterminate tools vector is byte-exact", () => {
    const line = formatPersistenceOutcome({
      schema: PERSISTENCE_OUTCOME_SCHEMA,
      code: "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE",
      commitState: "indeterminate",
      retry: "forbidden",
      artifactIdentity: FIXED_IDENTITY("tools"),
    });
    expect(line).toBe(
      '{"schema":"cl.i265.worker-runtime-admission-persistence-outcome.v1","code":"WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE","commitState":"indeterminate","retry":"forbidden","artifactIdentity":{"schema":"cl.i268.serialized-artifact-identity.v1","phase":"tools","byteLength":1,"sha256":"ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"}}\n',
    );
    expect(Buffer.byteLength(line, "utf8")).toBe(360);
  });

  test("all twenty-six frozen vectors match their accepted byte lengths and ceiling", () => {
    for (const phase of PHASES) {
      for (const [code, lengths] of Object.entries(IDENTITY_BEARING_LENGTHS)) {
        const line = formatPersistenceOutcome({
          schema: PERSISTENCE_OUTCOME_SCHEMA,
          code: code as PersistenceOutcomeCode,
          commitState: RUNTIME_ADMISSION_COMMIT_STATES[code as PersistenceOutcomeCode],
          retry: "forbidden",
          artifactIdentity: FIXED_IDENTITY(phase),
        });
        expect(Buffer.byteLength(line, "utf8")).toBe(lengths[phase]);
        expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES);
        expect(line.endsWith("}\n")).toBe(true);
      }
      for (const [code, length] of Object.entries(NOT_COMMITTED_LENGTHS)) {
        const line = formatPersistenceOutcome({
          schema: PERSISTENCE_OUTCOME_SCHEMA,
          code: code as PersistenceOutcomeCode,
          commitState: "not_committed",
          retry: "forbidden",
          artifactIdentity: null,
        });
        expect(Buffer.byteLength(line, "utf8")).toBe(length);
        expect(line).toContain('"artifactIdentity":null}');
      }
    }
  });

  test("serialization is insertion-ordered, not the sorted canonical form", () => {
    const line = formatPersistenceOutcome({
      schema: PERSISTENCE_OUTCOME_SCHEMA,
      code: "WORKER_RUNTIME_ADMISSION_INPUT_INVALID",
      commitState: "not_committed",
      retry: "forbidden",
      artifactIdentity: null,
    });
    expect(line.indexOf('"schema"')).toBeLessThan(line.indexOf('"code"'));
    expect(line.indexOf('"code"')).toBeLessThan(line.indexOf('"commitState"'));
    expect(line.indexOf('"commitState"')).toBeLessThan(line.indexOf('"retry"'));
    expect(line.indexOf('"retry"')).toBeLessThan(line.indexOf('"artifactIdentity"'));
    expect(line).not.toContain(" ");
    expect(line.slice(0, -1)).not.toContain("\n");
  });
});

describe.skipIf(SKIP_POSIX !== "")(`clean success${SKIP_POSIX}`, () => {
  test("valid tools input emits every reviewed output field", async () => {
    requireDescriptorSupport();
    const root = confinementRoot();
    const contents = derivationInput("tools");
    writeFileSync(join(root, "derivation-input.json"), contents);
    const result = await run({ root, input: null });
    expect(result.outcome).toBeNull();
    expect(temporaryEntries(result.entries)).toEqual([]);

    const outputBytes = readFileSync(result.outputPath);
    const output = JSON.parse(outputBytes.toString("utf8"));
    expect(Object.keys(output).sort()).toEqual([
      "adapter",
      "candidateIdentity",
      "input",
      "output",
      "phase",
      "phaseEvidence",
      "producer",
      "producerSource",
      "schema",
      "schemaVersion",
      "security",
      "semantic",
    ]);
    expect(output.schema).toBe(RUNTIME_ADMISSION_OUTPUT_SCHEMA);
    expect(output.schemaVersion).toBe(2);
    expect(output.phase).toBe("tools");
    expect(output.producer).toBe("worker");
    expect(output.producerSource).toEqual({
      repository: "remyjkim/darwinian-worker",
      commit: WORKER_SOURCE_COMMIT,
      tree: WORKER_SOURCE_TREE,
    });
    const adapter = readAdapterImplementation();
    expect(output.adapter).toEqual({
      ownerIssue: 265,
      entrypoint: "cli/tools/runtime-admission-derive.ts",
      implementation: adapter.implementation,
      implementationSha256: adapter.implementationSha256,
      commandId: "runtime-admission:derive:v2",
      commandVersion: "cl.i265.worker-runtime-admission-adapter.v1",
    });
    expect(output.input.derivationInputIdentity).toEqual(identity("tools", utf8(contents)));
    expect(output.input.cards).toHaveLength(1);
    expect(output.input.cardLock.storeMinDrwnVersion).toBe("1.3.0");
    expect(output.input.storeExport).toEqual(STORE_EXPORT);
    expect(output.semantic.derivationVersion).toBe("worker-runtime-admission-v1");
    expect(output.semantic.cardLockHash).toBe(output.input.cardLock.sha256);
    expect(output.semantic.storeExportHash).toBe(STORE_EXPORT.sha256);
    for (const key of [
      "closureHash",
      "activationHash",
      "runtimeRequirementsManifestHash",
      "applicationRequirementsHash",
      "cardsHash",
    ]) expect(output.semantic[key]).toMatch(/^[0-9a-f]{64}$/);
    expect(output.phaseEvidence).toEqual(phaseEvidence("tools"));
    expect(output.security.nestedInertRule.result).toBe("pass");
    expect(output.security.nestedInertRule.configSha256).toBe(FINCH_NESTED_INERT_RULE_SHA256);
    expect(output.security.nestedInertRule.covered.candidateSha256)
      .toBe(output.candidateIdentity.sha256);

    const envelopeBytes = Buffer.from(output.output.envelope.bytesBase64, "base64");
    expect(output.output.envelope.byteLength).toBe(envelopeBytes.byteLength);
    expect(output.output.envelope.sha256).toBe(sha256(envelopeBytes));
    expect(JSON.parse(envelopeBytes.toString("utf8")).schema)
      .toBe("darwinian.worker-runtime-admission");
    // The derived value never becomes self-identifying.
    expect(outputBytes.toString("utf8")).not.toContain(sha256(outputBytes));
    expect(outputBytes.toString("utf8")).not.toContain("serialized-artifact-identity.v1\",\"phase\":\"tools\",\"byteLength\":" + outputBytes.byteLength);
  });

  test("the semantic hashes cover exactly the values output v2 already binds", async () => {
    // Neither producer architecture states these two preimages, and the cross-producer
    // comparator compares them for equality. Hashing values that both producers bind
    // byte-identically is the only choice that cannot drift between lanes, so the rule
    // is pinned here where a reviewer can read and recompute it.
    requireDescriptorSupport();
    const result = await run();
    expect(result.outcome).toBeNull();
    const output = JSON.parse(readFileSync(result.outputPath, "utf8"));
    const applicationBytes = Buffer.from(output.output.applicationRequirements.bytesBase64, "base64");
    expect(output.semantic.applicationRequirementsHash).toBe(sha256(applicationBytes));
    expect(output.semantic.applicationRequirementsHash)
      .toBe(output.output.applicationRequirements.sha256);
    expect(output.semantic.cardsHash)
      .toBe(sha256(canonicalizeRuntimeAdmissionJson(output.input.cards)));
    expect(output.semantic.closureHash)
      .toBe(JSON.parse(Buffer.from(output.output.envelope.bytesBase64, "base64").toString("utf8")).closureHash);
  });

  test("valid root input binds the ordered two-Card closure and publication evidence", async () => {
    requireDescriptorSupport();
    const result = await run({ phase: "root" });
    expect(result.outcome).toBeNull();
    const output = JSON.parse(readFileSync(result.outputPath, "utf8"));
    expect(output.phase).toBe("root");
    expect(output.input.cards.map((card: { name: string }) => card.name)).toEqual([
      WORKER_CARD,
      TOOLS_CARD,
    ]);
    expect(output.phaseEvidence.toolSelectors).toEqual(TOOL_SELECTORS);
    expect(output.phaseEvidence.toolsPublication.immutableRef).toBe(TOOLS_PUBLICATION_REF);
  });

  test("the output file is a mode-0600 regular file with exactly one link", async () => {
    requireDescriptorSupport();
    const result = await run();
    expect(result.outcome).toBeNull();
    const stats = statSync(result.outputPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.mode & 0o777).toBe(0o600);
    expect(stats.nlink).toBe(1);
  });

  test("clean success performs the exact descriptor-bound sequence, not a path-only write", async () => {
    requireDescriptorSupport();
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const calls: string[] = [];
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      observeDescriptorOps: (ops) => ({
        ...ops,
        openDirectoryNoFollow(path) {
          calls.push("open-directory");
          return ops.openDirectoryNoFollow(path);
        },
        openTemporaryExclusive(dirfd, name) {
          calls.push("open-temporary");
          return ops.openTemporaryExclusive(dirfd, name);
        },
        fchmod(fd, mode) {
          calls.push(`fchmod:${mode.toString(8)}`);
          ops.fchmod(fd, mode);
        },
        write(fd, bytes) {
          calls.push("write");
          return ops.write(fd, bytes);
        },
        fsync(fd) {
          calls.push("fsync");
          ops.fsync(fd);
        },
        linkat(dirfd, from, to) {
          calls.push("linkat");
          return ops.linkat(dirfd, from, to);
        },
        unlinkat(dirfd, name) {
          calls.push("unlinkat");
          ops.unlinkat(dirfd, name);
        },
      }),
    });
    expect(outcome).toBeNull();
    expect(calls).toEqual([
      "open-directory",
      "fsync",
      "open-temporary",
      "fchmod:600",
      "write",
      "fsync",
      "linkat",
      "fsync",
      "unlinkat",
      "fsync",
    ]);
  });

  test("a development build identity is admitted and binds the candidate's producer source", async () => {
    // Output v2 is a closed twelve-key schema, so the build's own kind is deliberately
    // not one of its fields. What this case pins is that the packaged-only commit rule
    // does not reject a development build and that the bound source is the candidate's.
    requireDescriptorSupport();
    const result = await run({ buildIdentity: DEVELOPMENT_BUILD_IDENTITY });
    expect(result.outcome).toBeNull();
    const output = JSON.parse(readFileSync(result.outputPath, "utf8"));
    expect(output.producerSource.commit).toBe(WORKER_SOURCE_COMMIT);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`accepted I268 parity vectors${SKIP_POSIX}`, () => {
  // The exact accepted artifacts, vendored beside this file at darwinian-services
  // 4449a59c. Pinning identities alone would assert nothing, so the bytes are here and
  // every pinned number below is the identity of a file the suite actually reads.
  const FIXTURES = join(REPO_ROOT, "test", "fixtures", "runtime-admission");
  // One value with two readings that must agree: the rollup the vendored artifacts
  // carry, and the rollup this adapter computes over its own real bytes. Any edit to
  // the implementation set moves the second and fails here until a regeneration moves
  // the first to match.
  const ACCEPTED_ROLLUP = "cf8ffe146aa023f91c08c1b5536d5669967200901c5ccc4b8c0a5148f7065c53";
  // A rollup is fixed-width hex, so a regeneration moves the digests and leaves the
  // lengths alone. Only the digest separates one pinned set from another.
  const ACCEPTED = {
    toolsInput: { byteLength: 9513, sha256: "d7c7d7e51cf67317115af3e7d22659f925fd2dc1f5d6013b2bfb5645ec782e63" },
    toolsCandidate: { byteLength: 3859, sha256: "27ac76d37d7ed7bda3e567ba2cdf3b4aa4ebafaae8bbc6b1296f3b1476546766" },
    rootInput: { byteLength: 13538, sha256: "33d0a3ed37965bfb0bd02689448976fc85574b74a61e89e22b91eeb1016c993f" },
    rootCandidate: { byteLength: 5056, sha256: "fe0bf7063489fd3867c33e622a74592c184760f729069f189498a8fe39980c96" },
    workerOutput: { byteLength: 4152, sha256: "9aaa8ac4609d39a8753399194c8212f8e78be81049a4fac3862b0b87ac4e0c45" },
  };

  function vector(name: string): Buffer {
    return readFileSync(join(FIXTURES, name));
  }

  function candidateOf(inputBytes: Buffer): Buffer {
    return Buffer.from(JSON.parse(inputBytes.toString("utf8")).candidate.bytesBase64, "base64");
  }

  async function derive(phase: Phase, inputBytes: Buffer): Promise<{ root: string; outcome: unknown }> {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), inputBytes);
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      // The accepted candidates declare release.workerSourceCommit, which is what a
      // packaged build's own source commit must equal.
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
    });
    expect(outcome, phase).toBeNull();
    return { root, outcome };
  }

  test("the vendored vectors are the accepted identities and this head declares its rollup", () => {
    const toolsInput = vector("i268-tools-derivation-input.v1.json");
    const rootInput = vector("i268-root-derivation-input.v1.json");
    const workerOutput = vector("i268-worker-output.v2.json");
    for (const [bytes, expected, name] of [
      [toolsInput, ACCEPTED.toolsInput, "tools input v1"],
      [candidateOf(toolsInput), ACCEPTED.toolsCandidate, "tools candidate"],
      [rootInput, ACCEPTED.rootInput, "root input v1"],
      [candidateOf(rootInput), ACCEPTED.rootCandidate, "root candidate"],
      [workerOutput, ACCEPTED.workerOutput, "worker output v2"],
    ] as const) {
      expect(bytes.byteLength, name).toBe(expected.byteLength);
      // A rollup is a fixed-width hex string, so a candidate's byte length does not
      // separate one rollup from another; only the digest does.
      expect(sha256(bytes), name).toBe(expected.sha256);
    }

    // The live link: the frozen value in both candidates is this adapter's own rollup
    // over its real bytes, so any edit to the implementation set fails here.
    expect(readAdapterImplementation().implementationSha256).toBe(ACCEPTED_ROLLUP);
    for (const input of [toolsInput, rootInput]) {
      const candidate = JSON.parse(candidateOf(input).toString("utf8"));
      expect(candidate.producerSources.worker.adapterImplementationSha256).toBe(ACCEPTED_ROLLUP);
    }
    expect(JSON.parse(workerOutput.toString("utf8")).adapter.implementationSha256).toBe(ACCEPTED_ROLLUP);
  });

  test("the tools vector reproduces every accepted block this adapter does not derive", async () => {
    // The accepted output artifact is a parser shape vector, not a derivation product:
    // its semantic hashes are `1111…` through `5555…` and its envelope is a 38-byte
    // stub. Asserting whole-artifact equality would pin those placeholders, so the
    // blocks the adapter binds rather than derives are compared byte for byte and the
    // two derived blocks are instead required to be real.
    requireDescriptorSupport();
    const { root } = await derive("tools", vector("i268-tools-derivation-input.v1.json"));
    const produced = JSON.parse(readFileSync(join(root, "result.json"), "utf8"));
    const expected = JSON.parse(vector("i268-worker-output.v2.json").toString("utf8"));

    expect(Object.keys(produced).sort()).toEqual(Object.keys(expected).sort());
    for (const block of [
      "adapter",
      "candidateIdentity",
      "input",
      "phase",
      "phaseEvidence",
      "producer",
      "producerSource",
      "schema",
      "schemaVersion",
      "security",
    ]) {
      expect(JSON.stringify(produced[block]), block).toBe(JSON.stringify(expected[block]));
    }

    // `adapter` is inside that comparison, so the vector's per-file lengths and digests
    // are required to be this head's own bytes rather than merely the same shape.
    expect(produced.adapter.implementation).toEqual(readAdapterImplementation().implementation);

    // The derived blocks must be this adapter's real output, never the vector's stubs.
    for (const [key, placeholder] of [
      ["closureHash", "1".repeat(64)],
      ["activationHash", "2".repeat(64)],
      ["runtimeRequirementsManifestHash", "3".repeat(64)],
      ["applicationRequirementsHash", "4".repeat(64)],
      ["cardsHash", "5".repeat(64)],
    ] as const) {
      expect(produced.semantic[key], key).toMatch(/^[0-9a-f]{64}$/);
      expect(produced.semantic[key], key).not.toBe(placeholder);
    }
    const envelopeBytes = Buffer.from(produced.output.envelope.bytesBase64, "base64");
    expect(JSON.parse(envelopeBytes.toString("utf8")).schema).toBe("darwinian.worker-runtime-admission");
    expect(envelopeBytes.byteLength).toBeGreaterThan(expected.output.envelope.byteLength);
    expect(produced.semantic.closureHash)
      .toBe(JSON.parse(envelopeBytes.toString("utf8")).closureHash);
  });

  test("the root vector is admitted and attests the same implementation set", async () => {
    requireDescriptorSupport();
    const { root } = await derive("root", vector("i268-root-derivation-input.v1.json"));
    const output = JSON.parse(readFileSync(join(root, "result.json"), "utf8"));
    expect(output.phase).toBe("root");
    expect(output.input.cards.map((card: { name: string }) => card.name)).toEqual([
      WORKER_CARD,
      TOOLS_CARD,
    ]);
    expect(output.adapter.implementationSha256).toBe(ACCEPTED_ROLLUP);
    expect(output.adapter.implementation).toEqual(readAdapterImplementation().implementation);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`operand admission${SKIP_POSIX}`, () => {
  const rejected: Array<[string, Partial<RunOptions>]> = [
    ["absolute input", { inputOperand: "/etc/hosts" }],
    ["absolute output", { outputOperand: "/tmp/result.json" }],
    ["empty input", { inputOperand: "" }],
    ["dot input", { inputOperand: "." }],
    ["dot output", { outputOperand: "." }],
    ["traversal input", { inputOperand: "../derivation-input.json" }],
    ["traversal output", { outputOperand: "../result.json" }],
    ["nul byte", { outputOperand: "result\u0000.json" }],
    ["backslash separator", { outputOperand: "nested\\result.json" }],
    ["lone surrogate", { outputOperand: "result\uD800.json" }],
    ["oversize operand", { outputOperand: `${"a".repeat(4_097)}.json` }],
    ["missing output parent", { outputOperand: "absent/result.json" }],
    ["unnormalized path", { outputOperand: "./result.json" }],
  ];

  for (const [name, options] of rejected) {
    test(`rejects ${name} before derivation or output creation`, async () => {
      const result = await run(options);
      expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
      expect(temporaryEntries(result.entries)).toEqual([]);
      expect(result.entries).not.toContain("result.json");
    });
  }

  test("rejects identical input and output operand identity", async () => {
    const result = await run({ outputOperand: "derivation-input.json" });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
  });

  test("rejects unknown, missing, and duplicated operands", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    for (const argv of [
      [],
      ["--input", "derivation-input.json"],
      ["--output", "result.json"],
      ["--input", "derivation-input.json", "--output", "result.json", "--force"],
      ["--input", "derivation-input.json", "--input", "derivation-input.json", "--output", "result.json"],
      ["--input=derivation-input.json", "--output=result.json"],
    ]) {
      const outcome = await runRuntimeAdmissionDerive({
        argv,
        workingDirectory: root,
        loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      });
      expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    }
    expect(readdirSync(root)).toEqual(["derivation-input.json"]);
  });

  test("rejects a symlinked input, a symlinked output parent, and a symlinked output name", async () => {
    const root = confinementRoot();
    const outside = confinementRoot();
    writeFileSync(join(outside, "real-input.json"), derivationInput("tools"));
    symlinkSync(join(outside, "real-input.json"), join(root, "linked-input.json"));
    mkdirSync(join(root, "real-parent"));
    symlinkSync(join(root, "real-parent"), join(root, "linked-parent"));
    symlinkSync(join(outside, "elsewhere.json"), join(root, "linked-result.json"));
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    writeFileSync(join(root, "real-parent", "nested-input.json"), derivationInput("tools"));

    for (const [inputOperand, outputOperand] of [
      ["linked-input.json", "result.json"],
      ["linked-parent/nested-input.json", "result.json"],
      ["derivation-input.json", "linked-parent/result.json"],
      ["derivation-input.json", "linked-result.json"],
    ] as const) {
      const outcome = await runRuntimeAdmissionDerive({
        argv: ["--input", inputOperand, "--output", outputOperand],
        workingDirectory: root,
        loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      });
      expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    }
    expect(lstatSync(join(root, "linked-result.json")).isSymbolicLink()).toBe(true);
    expect(readdirSync(join(root, "real-parent"))).toEqual(["nested-input.json"]);
  });

  test("rejects a non-regular input and a pre-existing final output", async () => {
    const root = confinementRoot();
    mkdirSync(join(root, "directory-input.json"));
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    writeFileSync(join(root, "occupied.json"), "existing");

    const nonRegular = await runRuntimeAdmissionDerive({
      argv: ["--input", "directory-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
    });
    expect(nonRegular?.code).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");

    const existing = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "occupied.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
    });
    expect(existing?.code).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    expect(readFileSync(join(root, "occupied.json"), "utf8")).toBe("existing");
  });

  test("creates no directory", async () => {
    const result = await run({ outputOperand: "nested/result.json" });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    expect(result.entries).not.toContain("nested");
  });
});

describe.skipIf(SKIP_POSIX !== "")(`input admission${SKIP_POSIX}`, () => {
  test("rejects an input file larger than the shared ceiling before output creation", async () => {
    // Trailing whitespace keeps every field and key set exactly as admitted, so the
    // raw-byte ceiling is the only rule that can reject this input.
    const valid = derivationInput("tools");
    const padded = `${valid}${" ".repeat(1_048_577 - Buffer.byteLength(valid, "utf8"))}`;
    expect(Buffer.byteLength(padded, "utf8")).toBeGreaterThan(1_048_576);
    const result = await run({ input: padded });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    expect(result.entries).toEqual(["derivation-input.json"]);
  });

  test("an input at the ceiling is still admitted", async () => {
    const valid = derivationInput("tools");
    const padded = `${valid}${" ".repeat(1_048_576 - Buffer.byteLength(valid, "utf8"))}`;
    expect(Buffer.byteLength(padded, "utf8")).toBe(1_048_576);
    const result = await run({ input: padded });
    expect(result.outcome).toBeNull();
  });

  const structural: Array<[string, Mutator]> = [
    ["identity-only candidate", (input) => { delete input.derivationPreimage; }],
    ["missing schema", (input) => { delete input.schema; }],
    ["wrong schema", (input) => { input.schema = "cl.i268.finch-derivation-input.v2"; }],
    ["extra top-level field", (input) => { input.extra = true; }],
    ["missing candidate bytes", (input) => { delete input.candidate.bytesBase64; }],
    ["extra candidate field", (input) => { input.candidate.extra = 1; }],
    ["noncanonical base64", (input) => {
      // Only an encoding with padding carries unused bits to set, and which admitted
      // envelope has them follows from its byte length, so the case takes the first
      // one that does rather than depending on a fixture staying that length.
      for (const envelope of [
        input.candidate,
        input.derivationPreimage.cardLock,
        input.derivationPreimage.cards[0].manifest,
      ]) {
        if (!envelope.bytesBase64.endsWith("=")) continue;
        envelope.bytesBase64 = noncanonicalBase64(envelope.bytesBase64);
        return;
      }
      throw new Error("no admitted envelope encodes with padding");
    }],
    ["candidate length mismatch", (input) => { input.candidate.identity.byteLength += 1; }],
    ["candidate digest mismatch", (input) => {
      // The declared coverage moves with the identity so only the recomputed digest
      // over the actual candidate bytes can reject this input.
      input.candidate.identity.sha256 = "0".repeat(64);
      input.context.noSecretEvidence.covered.candidateSha256 = "0".repeat(64);
    }],
    ["card manifest digest mismatch", (input) => {
      input.derivationPreimage.cards[0].manifest.sha256 = "0".repeat(64);
      input.context.noSecretEvidence.covered.manifestSha256s = ["0".repeat(64)];
    }],
    ["card summary mismatch", (input) => {
      input.derivationPreimage.cards[0].treeSha = "7".repeat(40);
    }],
    ["lock digest mismatch", (input) => { input.derivationPreimage.cardLock.sha256 = "0".repeat(64); }],
    ["store minimum drift", (input) => {
      input.derivationPreimage.cardLock.storeMinDrwnVersion = "1.2.0";
    }],
    ["store export drift", (input) => { input.context.storeExportIdentity.sha256 = "0".repeat(64); }],
    ["phase evidence drift", (input) => { input.context.phaseEvidence.serverIds = ["other"]; }],
    ["extra Card", (input) => {
      input.derivationPreimage.cards.push(input.derivationPreimage.cards[0]);
    }],
    ["missing Card", (input) => { input.derivationPreimage.cards = []; }],
    ["phase drift", (input) => { input.phase = "root"; }],
    ["no-secret coverage drift", (input) => {
      input.context.noSecretEvidence.covered.cardLockSha256 = "0".repeat(64);
    }],
    ["no-secret rule digest drift", (input) => {
      input.context.noSecretEvidence.rule.configSha256 = "0".repeat(64);
    }],
    ["forged caller pass", (input) => {
      const manifest = JSON.parse(
        Buffer.from(input.derivationPreimage.cards[0].manifest.bytesBase64, "base64").toString("utf8"),
      );
      manifest.servers["buzz-tools"].command = "curl";
      const bytes = utf8(JSON.stringify(manifest));
      input.derivationPreimage.cards[0].manifest = encoded(bytes);
      input.derivationPreimage.cards[0].integrity = `sha256-${sha256(bytes)}`;
      input.context.noSecretEvidence.covered.manifestSha256s = [sha256(bytes)];
      input.context.noSecretEvidence.result = "pass";
    }],
  ];

  for (const [name, mutate] of structural) {
    test(`rejects ${name} without output`, async () => {
      const result = await run({ mutate });
      expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
      expect(result.entries).not.toContain("result.json");
      expect(temporaryEntries(result.entries)).toEqual([]);
    });
  }

  test("root publication identities must stay tools-phase", async () => {
    // The publication tuple describes the tools artifact, so a root-phase identity
    // inside a root candidate is a relationship failure rather than a phase match.
    const result = await run({
      phase: "root",
      mutate: (input) => {
        input.context.phaseEvidence.toolsPublication.receiptIdentity.phase = "root";
      },
    });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    expect(result.entries).toEqual(["derivation-input.json"]);
  });

  test("one-bit mutation of the candidate bytes fails", async () => {
    const result = await run({
      mutate: (input) => {
        const bytes = Buffer.from(input.candidate.bytesBase64, "base64");
        bytes[bytes.length - 2] = (bytes[bytes.length - 2] ?? 0) ^ 0x01;
        input.candidate.bytesBase64 = bytes.toString("base64");
      },
    });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
  });

  test("one-bit mutation of a declaration inside the manifest bytes fails", async () => {
    const result = await run({
      mutate: (input) => {
        const bytes = Buffer.from(input.derivationPreimage.cards[0].manifest.bytesBase64, "base64");
        bytes[bytes.length - 3] = (bytes[bytes.length - 3] ?? 0) ^ 0x01;
        input.derivationPreimage.cards[0].manifest.bytesBase64 = bytes.toString("base64");
      },
    });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
  });

  test("rejects top-level path, command, URL, and environment authority fields", async () => {
    for (const key of ["path", "command", "argv", "url", "env", "credential", "storeArchiveBase64", "fallback"]) {
      const result = await run({ mutate: (input) => { input[key] = "value"; } });
      expectCode(result, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    }
  });

  test("rejects raw-server drift and hostile nested authority without side effects", async () => {
    const hostile: Array<[string, (manifest: any) => void]> = [
      ["provider", (manifest) => { manifest.servers["buzz-tools"].provider = "pipedream"; }],
      ["url", (manifest) => { manifest.servers["buzz-tools"].url = "https://evil.test"; }],
      ["env", (manifest) => { manifest.servers["buzz-tools"].env = { TOKEN: "x" }; }],
      ["headers", (manifest) => { manifest.servers["buzz-tools"].headers = { Authorization: "x" }; }],
      ["command", (manifest) => { manifest.servers["buzz-tools"].command = "curl"; }],
      ["arg", (manifest) => { manifest.servers["buzz-tools"].args = ["worker", "buzz-tools", "--exec"]; }],
      ["optionality", (manifest) => { manifest.servers["buzz-tools"].optional = true; }],
      ["extra server", (manifest) => { manifest.servers.shell = { command: "sh" }; }],
      ["harness floor", (manifest) => { manifest.harness.minVersion = "1.2.0"; }],
      ["application payload", (manifest) => { manifest.applicationRequirements.apps = [{ app: "x" }]; }],
      // A Card name that names an inherited property is not an allowlisted Card.
      ["prototype Card name", (manifest) => { manifest.name = "__proto__"; }],
      ["constructor Card name", (manifest) => { manifest.name = "constructor"; }],
    ];
    for (const [name, apply] of hostile) {
      // Every byte identity is rebuilt around the hostile value, so only the producer's
      // own rerun of the frozen rule can reject it.
      const result = await run({ material: { manifest: apply } });
      expect(result.outcome?.code, name).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
      expect(result.entries, name).toEqual(["derivation-input.json"]);
    }
  });

  test("rejects hostile lock paths and Git URL authority", async () => {
    const hostile: Array<[string, (lock: any) => void]> = [
      ["userinfo", (lock) => {
        lock.cards[0].git.url = "https://user:pass@github.com/curation-labs/buzz-delivery-tools.git";
      }],
      ["query", (lock) => {
        lock.cards[0].git.url = "https://github.com/curation-labs/buzz-delivery-tools.git?token=x";
      }],
      ["fragment", (lock) => {
        lock.cards[0].git.url = "https://github.com/curation-labs/buzz-delivery-tools.git#x";
      }],
      ["foreign host", (lock) => { lock.cards[0].git.url = "https://evil.test/repo.git"; }],
      ["insecure scheme", (lock) => {
        lock.cards[0].git.url = "http://github.com/curation-labs/buzz-delivery-tools.git";
      }],
      ["control character path", (lock) => { lock.cards[0].path = "cards/\u0007evil"; }],
      ["oversize path", (lock) => { lock.cards[0].path = "a".repeat(4_097); }],
      ["registry authority", (lock) => { lock.cards[0].registry = { url: "https://evil.test" }; }],
      ["skill payload", (lock) => { lock.cards[0].skills = ["evil"]; }],
      ["hook payload", (lock) => { lock.cards[0].hooks = ["evil"]; }],
      ["origin drift", (lock) => { lock.cards[0].origin = "npm"; }],
      ["commit detached from tree", (lock) => { lock.cards[0].git.commit = "f".repeat(40); }],
      ["store floor drift", (lock) => { lock.store.minDrwnVersion = "1.2.0"; }],
    ];
    for (const [name, apply] of hostile) {
      const result = await run({ material: { lock: apply } });
      expect(result.outcome?.code, name).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
      expect(result.entries, name).toEqual(["derivation-input.json"]);
    }
  });

  test("rejects malformed release bindings and adapter rollups inside the candidate", async () => {
    const hostile: Array<[string, (candidate: any) => void]> = [
      ["short release source commit", (c) => { c.release.workerSourceCommit = "e".repeat(39); }],
      ["missing release source tree", (c) => { delete c.release.workerSourceTree; }],
      ["extra release field", (c) => { c.release.workerSourceBranch = "main"; }],
      ["sha256 package integrity", (c) => {
        c.release.workerPackageIntegrity = `sha256-${"a".repeat(64)}`;
      }],
      ["truncated package integrity", (c) => {
        c.release.workerPackageIntegrity = `sha512-${"a".repeat(85)}==`;
      }],
      ["noncanonical package integrity", (c) => {
        c.release.workerPackageIntegrity =
          `sha512-${noncanonicalBase64(RELEASE_PACKAGE_INTEGRITY.slice("sha512-".length))}`;
      }],
      ["wrong-phase executable identity", (c) => {
        c.release.workerExecutableIdentity.phase = "root";
      }],
      ["missing worker adapter rollup", (c) => {
        delete c.producerSources.worker.adapterImplementationSha256;
      }],
      ["short services adapter rollup", (c) => {
        c.producerSources.services.adapterImplementationSha256 = "2".repeat(63);
      }],
      ["uppercase worker adapter rollup", (c) => {
        c.producerSources.worker.adapterImplementationSha256 = "A".repeat(64);
      }],
    ];
    for (const [name, apply] of hostile) {
      const result = await run({ material: { candidate: apply } });
      expect(result.outcome?.code, name).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
      expect(result.entries, name).toEqual(["derivation-input.json"]);
    }
  });

  test("requires the running Worker build identity rather than caller-supplied source authority", async () => {
    const drifted = await run({
      buildIdentity: { ...PACKAGED_BUILD_IDENTITY, version: "1.4.0" },
    });
    expectCode(drifted, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");

    const mismatched = await run({
      buildIdentity: { ...PACKAGED_BUILD_IDENTITY, sourceCommit: "7".repeat(40) },
    });
    expectCode(mismatched, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");

    // The packaged build's source commit is the commit the released package was built
    // from, which is release.workerSourceCommit. producerSources.worker.commit is the
    // adapter's own source; matching against it would only ever hold by coincidence.
    expect(WORKER_SOURCE_COMMIT).not.toBe(RELEASE_SOURCE_COMMIT);
    const adapterSource = await run({
      buildIdentity: { ...PACKAGED_BUILD_IDENTITY, sourceCommit: WORKER_SOURCE_COMMIT },
    });
    expectCode(adapterSource, "WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    const releaseSource = await run({
      buildIdentity: { ...PACKAGED_BUILD_IDENTITY, sourceCommit: RELEASE_SOURCE_COMMIT },
    });
    expect(releaseSource.outcome).toBeNull();
  });

  test("the admitted descriptor, not the pathname, supplies the derivation bytes", async () => {
    // The `input-read` seam is the window between proving one regular input and
    // reading it. A pathname read there takes whatever occupies the name instead.
    const root = confinementRoot();
    const contents = derivationInput("tools");
    const result = await run({
      root,
      seams: {
        "input-read": () => {
          rmSync(join(root, "derivation-input.json"));
          writeFileSync(join(root, "derivation-input.json"), "not an admissible input");
        },
      },
    });
    expect(result.outcome).toBeNull();
    const output = JSON.parse(readFileSync(result.outputPath, "utf8"));
    expect(output.input.derivationInputIdentity).toEqual(identity("tools", utf8(contents)));
  });

  test("a FIFO substituted for the admitted input cannot block or redirect the read", async () => {
    const root = confinementRoot();
    const result = await run({
      root,
      seams: {
        "input-read": () => {
          rmSync(join(root, "derivation-input.json"));
          Bun.spawnSync(["mkfifo", join(root, "derivation-input.json")]);
          // A pathname read of this name never returns while no writer exists.
          expect(lstatSync(join(root, "derivation-input.json")).isFIFO()).toBe(true);
        },
      },
    });
    expect(result.outcome).toBeNull();
    expect(JSON.parse(readFileSync(result.outputPath, "utf8")).schema)
      .toBe(RUNTIME_ADMISSION_OUTPUT_SCHEMA);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`descriptor-bound persistence${SKIP_POSIX}`, () => {
  test("preflight directory-sync failure is persistence-unsupported before any entry exists", async () => {
    const result = await run({ seams: { "preflight-sync": fault("preflight") } });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
    expect(temporaryEntries(result.entries)).toEqual([]);
    expect(result.entries).not.toContain("result.json");
  });

  test("an unproven temp mode fails closed before any byte is written", async () => {
    // The variadic mode argument is untrusted on every platform: the adapter proves the
    // descriptor's mode with fstat and refuses to write when the proof does not hold.
    const result = await run({
      seams: {
        "temp-mode": (context) => {
          const { fd, ops } = context as { fd: number; ops: { fchmod(fd: number, mode: number): void } };
          ops.fchmod(fd, 0o640);
        },
      },
    });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
    expect(temporaryEntries(result.entries)).toEqual([]);
    expect(result.entries).not.toContain("result.json");
  });

  test("the temporary is created with no group or other bits and restores the umask", async () => {
    // POSIX evaluates permission at open, not at each write, so a descriptor another
    // process obtains during creation survives every later fchmod. The mode the create
    // actually produced is what has to be bounded; the fchmod and fstat proof that
    // follow cannot reach the instant this asserts.
    requireDescriptorSupport();
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const before = process.umask();
    let mask = -1;
    let createdMode = -1;
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      observeDescriptorOps: (ops) => ({
        ...ops,
        openTemporaryExclusive(dirfd, name) {
          mask = process.umask();
          const fd = ops.openTemporaryExclusive(dirfd, name);
          createdMode = ops.fstat(fd).mode & 0o777;
          return fd;
        },
      }),
    });
    expect(outcome).toBeNull();
    expect(mask).toBe(0o077);
    expect(createdMode).toBeGreaterThanOrEqual(0);
    expect(createdMode & 0o077).toBe(0);
    expect(process.umask()).toBe(before);
  });

  test("the umask is restored when the exclusive create raises inside the window", async () => {
    // The temp-open seam fires before the mask is narrowed, so only a raise from the
    // create itself lands inside the window the restoration has to cover.
    requireDescriptorSupport();
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const before = process.umask();
    let maskAtRaise = -1;
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      observeDescriptorOps: (ops) => ({
        ...ops,
        openTemporaryExclusive() {
          maskAtRaise = process.umask();
          throw new Error("exclusive temporary creation failed");
        },
      }),
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    expect(maskAtRaise).toBe(0o077);
    expect(process.umask()).toBe(before);
    expect(readdirSync(root)).toEqual(["derivation-input.json"]);
  });

  test("open, short-write, file-sync, and close failures are persist-failed with clean residue", async () => {
    for (const seam of ["temp-open", "temp-write", "temp-file-sync", "temp-close"]) {
      const result = await run({ seams: { [seam]: fault(seam) } });
      expect(result.outcome?.code, seam).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
      expect(temporaryEntries(result.entries), seam).toEqual([]);
      expect(result.entries).not.toContain("result.json");
    }
  });

  test("derivation and serialization failures never create a temp or final entry", async () => {
    for (const [seam, code] of [
      ["derive", "WORKER_RUNTIME_ADMISSION_DERIVATION_FAILED"],
      ["serialize", "WORKER_RUNTIME_ADMISSION_OUTPUT_SERIALIZATION_FAILED"],
    ] as const) {
      const result = await run({ seams: { [seam]: fault(seam) } });
      expect(result.outcome?.code, seam).toBe(code);
      expect(result.entries).toEqual(["derivation-input.json"]);
    }
  });

  test("a conclusively uncommitted link failure is persist-failed after identity-safe cleanup", async () => {
    const result = await run({ seams: { link: fault("link") } });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    expect(result.entries).toEqual(["derivation-input.json"]);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`competing destination${SKIP_POSIX}`, () => {
  test("EEXIST maps to output-exists and preserves the competing bytes", async () => {
    const competing = "competing destination bytes\n";
    const result = await run({
      seams: {
        "pre-link": (context) => {
          const { root } = context as { root: string };
          writeFileSync(join(root, "result.json"), competing);
        },
      },
    });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_EXISTS");
    expect(result.outcome!.artifactIdentity).toBeNull();
    expect(readFileSync(result.outputPath, "utf8")).toBe(competing);
    expect(temporaryEntries(result.entries)).toEqual([]);
  });

  test("cleanup faults after EEXIST surface their own code without hiding behind output-exists", async () => {
    const competing = "competing destination bytes\n";
    for (const [seam, code] of [
      ["cleanup-identity-proof", "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED"],
      ["cleanup-unlink", "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED"],
      ["cleanup-dir-sync", "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE"],
    ] as const) {
      const result = await run({
        seams: {
          "pre-link": (context) => {
            const { root } = context as { root: string };
            writeFileSync(join(root, "result.json"), competing);
          },
          [seam]: fault(seam),
        },
      });
      expect(result.outcome?.code, seam).toBe(code);
      expect(result.outcome!.artifactIdentity, seam).toBeNull();
      expect(readFileSync(result.outputPath, "utf8"), seam).toBe(competing);
    }
  });

  test("pre-commit cleanup faults on an ordinary failure keep their own code", async () => {
    for (const [seam, code, residue] of [
      ["cleanup-identity-proof", "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED", true],
      ["cleanup-unlink", "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_TEMP_CLEANUP_FAILED", true],
      ["cleanup-dir-sync", "WORKER_RUNTIME_ADMISSION_OUTPUT_PRECOMMIT_CLEANUP_DURABILITY_INDETERMINATE", false],
    ] as const) {
      const result = await run({ seams: { link: fault("link"), [seam]: fault(seam) } });
      expect(result.outcome?.code, seam).toBe(code);
      expect(result.outcome!.artifactIdentity, seam).toBeNull();
      expect(result.entries).not.toContain("result.json");
      expect(temporaryEntries(result.entries).length > 0, seam).toBe(residue);
    }
  });
});

describe.skipIf(SKIP_POSIX !== "")(`parent and temp substitution${SKIP_POSIX}`, () => {
  function substituteParent(root: string): { moved: string; foreign: string } {
    const moved = `${root}-moved`;
    const foreign = `${root}-foreign`;
    mkdirSync(foreign);
    roots.push(moved, foreign);
    renameSync(root, moved);
    mkdirSync(root);
    writeFileSync(join(root, "planted.json"), "foreign bytes");
    return { moved, foreign };
  }

  test("substitution inside the parent-open seam is rejected before preflight or any entry", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    let moved = "";
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      seams: {
        "parent-open": () => { ({ moved } = substituteParent(root)); },
      },
    });
    // A detected substitution is not unsupported semantics: the identity comparison
    // worked and refused the handle, which is an open-phase pre-commit failure.
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    expect(readdirSync(root)).toEqual(["planted.json"]);
    expect(readdirSync(moved).sort()).toEqual(["derivation-input.json"]);
  });

  for (const seam of ["temp-create", "pre-link", "cleanup-identity-proof"] as const) {
    test(`substitution inside the ${seam} seam writes and removes nothing outside the frozen directory`, async () => {
      const root = confinementRoot();
      writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
      let moved = "";
      const seams: Record<string, RuntimeAdmissionDeriveSeam> = {
        [seam]: () => { if (moved === "") ({ moved } = substituteParent(root)); },
      };
      if (seam === "cleanup-identity-proof") seams.link = fault("link");
      const outcome = await runRuntimeAdmissionDerive({
        argv: ["--input", "derivation-input.json", "--output", "result.json"],
        workingDirectory: root,
        loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
        seams,
      });
      expect(outcome).not.toBeNull();
      expect(outcome!.commitState).toBe("not_committed");
      expect(readdirSync(root)).toEqual(["planted.json"]);
      expect(readdirSync(moved)).not.toContain("result.json");
    });
  }

  test("a parent swapped during open and restored afterwards is caught by the frozen handle", async () => {
    // Every pathname check would pass here; only the pre-open admitted device/inode
    // matched against the opened handle can refuse the substituted directory.
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const original = `${root}-original`;
    const foreign = `${root}-foreign`;
    roots.push(original, foreign);
    mkdirSync(foreign);
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      seams: {
        "parent-open": () => {
          renameSync(root, original);
          renameSync(foreign, root);
        },
      },
      observeDescriptorOps: (ops) => ({
        ...ops,
        openDirectoryNoFollow(path) {
          const fd = ops.openDirectoryNoFollow(path);
          renameSync(root, foreign);
          renameSync(original, root);
          return fd;
        },
      }),
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    expect(readdirSync(foreign)).toEqual([]);
    expect(readdirSync(root)).toEqual(["derivation-input.json"]);
  });

  test("an intermediate directory substituted after admission cannot move the publication", async () => {
    // `lstat` does not follow a final component but does follow every intermediate
    // one, and `O_NOFOLLOW` guards only the final component. Re-deriving the parent
    // from its pathname after admission therefore proves self-consistency across
    // three instants, not containment: all three readings traverse the same swapped
    // intermediate component and agree on the attacker's directory.
    const root = confinementRoot();
    const foreign = confinementRoot();
    mkdirSync(join(root, "nested", "out"), { recursive: true });
    mkdirSync(join(foreign, "out"));
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "nested/out/result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => {
        // The admission-to-publication window: reading the input, admitting up to a
        // mebibyte of JSON, and this awaited lookup all sit inside it.
        renameSync(join(root, "nested"), join(root, "nested-real"));
        symlinkSync(foreign, join(root, "nested"));
        return PACKAGED_BUILD_IDENTITY;
      },
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    expect(outcome?.commitState).toBe("not_committed");
    expect(readdirSync(join(foreign, "out"))).toEqual([]);
    expect(readdirSync(join(root, "nested-real", "out"))).toEqual([]);
  });

  // The parent is resolved one component at a time from the admitted root, and the
  // identity is the resulting descriptor's own. These two cases bracket the step the
  // substitution can land on: before a component is opened the walk refuses it, and
  // after it is opened the descriptor already holds the real directory, so the
  // pathname the publication re-opens no longer matches. A second pathname reading
  // taken to record the identity would have agreed with the attacker in both.
  const substituteIntermediate = (root: string, foreign: string) => () => {
    renameSync(join(root, "nested"), join(root, "nested-real"));
    symlinkSync(foreign, join(root, "nested"));
  };

  test("an intermediate substituted before the walk reaches it is refused at admission", async () => {
    const root = confinementRoot();
    const foreign = confinementRoot();
    mkdirSync(join(root, "nested", "out"), { recursive: true });
    mkdirSync(join(foreign, "out"));
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const substitute = substituteIntermediate(root, foreign);
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "nested/out/result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      seams: {
        "parent-resolve": (context) => {
          if (context.component === "nested") substitute();
        },
      },
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    expect(outcome?.commitState).toBe("not_committed");
    expect(readdirSync(join(foreign, "out"))).toEqual([]);
    expect(readdirSync(join(root, "nested-real", "out"))).toEqual([]);
  });

  test("an intermediate substituted after the walk passes it cannot move the publication", async () => {
    const root = confinementRoot();
    const foreign = confinementRoot();
    mkdirSync(join(root, "nested", "out"), { recursive: true });
    mkdirSync(join(foreign, "out"));
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const substitute = substituteIntermediate(root, foreign);
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "nested/out/result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      seams: {
        "parent-resolve": (context) => {
          if (context.component === "out") substitute();
        },
      },
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED");
    expect(outcome?.commitState).toBe("not_committed");
    expect(readdirSync(join(foreign, "out"))).toEqual([]);
    expect(readdirSync(join(root, "nested-real", "out"))).toEqual([]);
  });

  test("post-link substitution before the first directory sync is commit-validation-indeterminate", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      seams: { "post-link-validation": () => { substituteParent(root); } },
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_VALIDATION_INDETERMINATE");
    expect(outcome?.commitState).toBe("indeterminate");
    expect(outcome?.artifactIdentity).not.toBeNull();
    expect(outcome?.retry).toBe("forbidden");
  });

  test("substitution at the final pre-success check is committed-final-validation-failed", async () => {
    const result = await run({ seams: { "final-validation": fault("final-validation") } });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_FINAL_VALIDATION_FAILED");
    expect(result.outcome!.commitState).toBe("committed");
    expect(readFileSync(result.outputPath).byteLength).toBe(
      result.outcome!.artifactIdentity!.byteLength,
    );
    expect(temporaryEntries(result.entries)).toEqual([]);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`link reconciliation${SKIP_POSIX}`, () => {
  test("a committed link that then throws still completes both durability barriers", async () => {
    const result = await run({
      seams: { "link-after": fault("link raised after committing the namespace entry") },
    });
    expect(result.outcome).toBeNull();
    expect(temporaryEntries(result.entries)).toEqual([]);
    expect(statSync(result.outputPath).nlink).toBe(1);
  });

  test("reconciliation that cannot prove owned-final or absent-final is commit-indeterminate", async () => {
    for (const seam of ["reconcile-final", "reconcile-temp"] as const) {
      const result = await run({ seams: { link: fault("link"), [seam]: fault(seam) } });
      expect(result.outcome?.code, seam).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE");
      expect(result.outcome?.commitState, seam).toBe("indeterminate");
      expect(result.outcome?.artifactIdentity, seam).not.toBeNull();
      expect(result.entries).not.toContain("result.json");
      expect(temporaryEntries(result.entries).length, seam).toBe(1);
    }
  });

  test("an owned final whose temporary identity is lost is commit-indeterminate", async () => {
    // The link commits and the owned temporary then disappears, so reconciliation
    // must classify on the identity mismatch rather than on a thrown lookup. A
    // committed final may never be reported as an ordinary pre-commit failure.
    const result = await run({
      seams: {
        "reconcile-temp": (context) => {
          const { root } = context as { root: string };
          for (const entry of temporaryEntries(readdirSync(root))) rmSync(join(root, entry));
        },
      },
    });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE");
    expect(result.entries).toContain("result.json");
    expect(temporaryEntries(result.entries)).toEqual([]);
    const bytes = readFileSync(result.outputPath);
    expect(result.outcome!.artifactIdentity).toEqual({
      schema: "cl.i268.serialized-artifact-identity.v1",
      phase: "tools",
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    });
  });

  test("a reported link whose final is then absent is commit-indeterminate, never persist-failed", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      observeDescriptorOps: (ops) => ({
        ...ops,
        linkat(dirfd, from, to) {
          const linked = ops.linkat(dirfd, from, to);
          rmSync(join(root, to));
          return linked;
        },
      }),
    });
    expect(outcome?.code).toBe("WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE");
    expect(outcome?.commitState).toBe("indeterminate");
    expect(outcome?.artifactIdentity).not.toBeNull();
    expect(readdirSync(root)).not.toContain("result.json");
  });

  test("first directory-sync failure after an owned final is commit-indeterminate and mutates nothing", async () => {
    const result = await run({ seams: { "first-dir-sync": fault("first-dir-sync") } });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMIT_INDETERMINATE");
    expect(result.entries).toContain("result.json");
    expect(temporaryEntries(result.entries)).toHaveLength(1);
    expect(statSync(result.outputPath).nlink).toBe(2);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`committed cleanup${SKIP_POSIX}`, () => {
  test("temp identity-proof and unlink failures after commit preserve the final", async () => {
    for (const seam of ["cleanup-identity-proof", "cleanup-unlink"] as const) {
      const result = await run({ seams: { [seam]: fault(seam) } });
      expect(result.outcome?.code, seam).toBe(
        "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_TEMP_CLEANUP_FAILED",
      );
      expect(result.outcome?.commitState, seam).toBe("committed");
      expect(result.outcome?.artifactIdentity, seam).not.toBeNull();
      expect(result.entries, seam).toContain("result.json");
      expect(temporaryEntries(result.entries).length, seam).toBe(1);
    }
  });

  test("second directory-sync failure keeps the final and reports non-durable temp removal", async () => {
    const result = await run({ seams: { "second-dir-sync": fault("second-dir-sync") } });
    expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_COMMITTED_CLEANUP_DURABILITY_INDETERMINATE");
    expect(result.outcome!.commitState).toBe("committed");
    expect(result.entries).toContain("result.json");
    expect(temporaryEntries(result.entries)).toEqual([]);
    expect(readFileSync(result.outputPath).byteLength)
      .toBe(result.outcome!.artifactIdentity!.byteLength);
  });

  test("an identity-bearing outcome's observed bytes equal its bounded identity", async () => {
    const result = await run({ seams: { "second-dir-sync": fault("second-dir-sync") } });
    const bytes = readFileSync(result.outputPath);
    expect(result.outcome!.artifactIdentity).toEqual({
      schema: "cl.i268.serialized-artifact-identity.v1",
      phase: "tools",
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    });
  });

  test("a directory handle release that raises cannot discard a committed outcome", async () => {
    // The handle is released after the link and outside every outcome handler, so a
    // throw there would replace a committed result with the entry backstop's
    // not-committed code for an artifact that already exists on disk.
    requireDescriptorSupport();
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    let directoryFd = -1;
    let released = 0;
    const outcome = await runRuntimeAdmissionDerive({
      argv: ["--input", "derivation-input.json", "--output", "result.json"],
      workingDirectory: root,
      loadBuildIdentity: async () => PACKAGED_BUILD_IDENTITY,
      observeDescriptorOps: (ops) => ({
        ...ops,
        openDirectoryNoFollow(path) {
          directoryFd = ops.openDirectoryNoFollow(path);
          return directoryFd;
        },
        close(fd) {
          ops.close(fd);
          if (fd !== directoryFd) return;
          released += 1;
          throw new Error("directory handle release");
        },
      }),
    });
    expect(outcome).toBeNull();
    expect(released).toBe(1);
    expect(readdirSync(root).sort()).toEqual(["derivation-input.json", "result.json"]);
  });
});

describe(`unsupported platform fail-closed${SKIP_UNSUPPORTED_PLATFORM}`, () => {
  test.skipIf(SKIP_UNSUPPORTED_PLATFORM !== "")(
    "an unsupported descriptor layer yields persistence-unsupported with no output",
    async () => {
      const result = await run();
      expectCode(result, "WORKER_RUNTIME_ADMISSION_OUTPUT_PERSISTENCE_UNSUPPORTED");
      expect(result.entries).toEqual(["derivation-input.json"]);
      expect(descriptorSupport.supported).toBe(false);
      expect(descriptorSupport.reason.length).toBeGreaterThan(0);
    },
  );

  test("the descriptor layer reports its support decision without throwing at import time", () => {
    expect(typeof descriptorSupport.supported).toBe("boolean");
    expect(descriptorSupport.supported).toBe(DESCRIBED_STRUCT_LAYOUT);
  });
});

describe.skipIf(SKIP_POSIX !== "")(`process contract${SKIP_POSIX}`, () => {
  const entry = join(REPO_ROOT, RUNTIME_ADMISSION_ADAPTER_ENTRY);

  async function spawnAdapter(root: string, inputOperand: string, outputOperand: string) {
    const proc = Bun.spawn(
      [process.execPath, "run", entry, "--input", inputOperand, "--output", outputOperand],
      { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).arrayBuffer(),
      proc.exited,
    ]);
    return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
  }

  test("clean success exits 0 with no stdout, no stderr, and one output file", async () => {
    requireDescriptorSupport();
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const result = await spawnAdapter(root, "derivation-input.json", "result.json");
    expect(result.stderr.toString("utf8")).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.byteLength).toBe(0);
    expect(readdirSync(root).sort()).toEqual(["derivation-input.json", "result.json"]);
    expect(JSON.parse(readFileSync(join(root, "result.json"), "utf8")).schema)
      .toBe(RUNTIME_ADMISSION_OUTPUT_SCHEMA);
  });

  test("a not_committed failure exits 1 with exactly one canonical stderr line and no stdout", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), "{}");
    const result = await spawnAdapter(root, "derivation-input.json", "result.json");
    expect(result.exitCode).toBe(1);
    expect(result.stdout.byteLength).toBe(0);
    expect(result.stderr.byteLength).toBeLessThanOrEqual(MAX_DIAGNOSTIC_BYTES);
    expect(result.stderr.at(-1)).toBe(0x0a);
    const body = result.stderr.toString("utf8").slice(0, -1);
    expect(body).not.toContain("\n");
    const payload = JSON.parse(body);
    expect(Object.keys(payload)).toEqual([
      "schema",
      "code",
      "commitState",
      "retry",
      "artifactIdentity",
    ]);
    expect(payload.schema).toBe(PERSISTENCE_OUTCOME_SCHEMA);
    expect(payload.code).toBe("WORKER_RUNTIME_ADMISSION_INPUT_INVALID");
    expect(payload.commitState).toBe("not_committed");
    expect(payload.retry).toBe("forbidden");
    expect(payload.artifactIdentity).toBeNull();
    expect(`${JSON.stringify(payload)}\n`).toBe(result.stderr.toString("utf8"));
    expect(readdirSync(root)).toEqual(["derivation-input.json"]);
  });

  test("the diagnostic never carries a path, command, environment, or exception text", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), "not json at all");
    const result = await spawnAdapter(root, "derivation-input.json", "secret-name.json");
    const stderr = result.stderr.toString("utf8");
    expect(stderr).not.toContain(root);
    expect(stderr).not.toContain("secret-name.json");
    expect(stderr).not.toContain("derivation-input.json");
    expect(stderr).not.toContain("Error");
    expect(stderr).not.toContain("bun");
  });

  test("an operand rejection happens before any output file exists", async () => {
    const root = confinementRoot();
    writeFileSync(join(root, "derivation-input.json"), derivationInput("tools"));
    const result = await spawnAdapter(root, "derivation-input.json", "../escape.json");
    expect(result.exitCode).toBe(1);
    expect(readdirSync(root)).toEqual(["derivation-input.json"]);
  });
});
