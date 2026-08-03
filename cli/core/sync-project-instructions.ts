// ABOUTME: Applies consented Worker instructions to project and supported machine-scope adapters.
// ABOUTME: Uses exact managed-block ownership to preserve foreign bytes and fail closed on drift.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { EffectiveState } from "./effective-state";
import { writeManagedBytes } from "./managed-file";
import {
  composeConsentedInstructions,
  planClaudeInstructionAdapter,
  planInstructionProjection,
  type ClaudeAdapterOwnership,
  type InstructionComposition,
} from "./sync-instructions";
import type { SyncResult } from "./types";
import { ownManagedPath, type ManagedPath } from "./write-record";

const OWNERSHIP_FIELD = "drwn:instructions";

const MACHINE_INSTRUCTION_ADAPTERS = [
  { target: "claude" as const, path: ".claude/CLAUDE.md" },
  { target: "codex" as const, path: ".codex/AGENTS.md" },
] as const;

export function instructionCompositionForState(
  state: EffectiveState,
): InstructionComposition {
  return composeConsentedInstructions({
    cards: state.activeCards,
    contentRootsByCard: state.contentRootsByCard,
    organizationConsent: state.organizationInstructionConsent,
  });
}

function instructionWarnings(composition: InstructionComposition) {
  return composition.excluded.map(
    (item) =>
      item.expectedEvidenceKind === "org_worker_bundle_consent"
        ? `${item.card} organization instruction consent excluded: ${item.reason}. Verify Org Worker materialization evidence.`
        : `${item.card} explicit instructions excluded: ${item.reason}. Run drwn card trust ${item.card} --instructions.`,
  );
}

function assertStrictInstructionConsent(
  state: EffectiveState,
  composition: InstructionComposition,
) {
  if (state.scopedOptions.strict && composition.excluded.length > 0) {
    throw new Error(
      `Explicit instruction consent required for: ${composition.excluded
        .map((item) => item.card)
        .join(", ")}`,
    );
  }
}

function selectedMachineInstructionAdapters(state: EffectiveState) {
  if (
    state.scopedOptions.writeScope !== "machine" ||
    state.scopedOptions.mcpOnly ||
    state.scopedOptions.skillsOnly
  ) {
    return [];
  }
  return MACHINE_INSTRUCTION_ADAPTERS.filter(
    (adapter) =>
      !state.scopedOptions.target || state.scopedOptions.target === adapter.target,
  );
}

export function planMachineInstructionManagedPaths(
  state: EffectiveState,
  composition = instructionCompositionForState(state),
): ManagedPath[] {
  if (!composition.bytes) return [];
  const ownershipHash = planInstructionProjection({
    currentBytes: new Uint8Array(),
    composition,
    instructionId: `worker:${state.workerSelection?.selectedRoot?.name ?? "none"}`,
  }).ownershipHash;
  if (!ownershipHash) return [];
  return selectedMachineInstructionAdapters(state).map((adapter) =>
    ownManagedPath(
      {
        path: adapter.path,
        kind: "managed-fields" as const,
        fields: [OWNERSHIP_FIELD],
        fieldHashes: { [OWNERSHIP_FIELD]: ownershipHash },
      },
      { surface: "instructions", target: adapter.target },
    ),
  );
}

export function syncMachineInstructions(input: {
  state: EffectiveState;
  previousManagedPaths: readonly ManagedPath[];
  composition?: InstructionComposition;
}): SyncResult {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const adapters = selectedMachineInstructionAdapters(input.state);
  if (adapters.length === 0) return result;
  const composition =
    input.composition ?? instructionCompositionForState(input.state);
  result.warnings.push(...instructionWarnings(composition));
  assertStrictInstructionConsent(input.state, composition);

  for (const adapter of adapters) {
    const previous = input.previousManagedPaths.find(
      (entry) =>
        entry.surface === "instructions" &&
        entry.kind === "managed-fields" &&
        entry.path === adapter.path,
    );
    const previousOwnershipHash =
      previous?.kind === "managed-fields"
        ? previous.fieldHashes[OWNERSHIP_FIELD]
        : undefined;
    const path = join(input.state.scopeRoot, adapter.path);
    const currentBytes = existsSync(path)
      ? new Uint8Array(readFileSync(path))
      : new Uint8Array();
    const plan = planInstructionProjection({
      currentBytes,
      composition,
      instructionId: `worker:${
        input.state.workerSelection?.selectedRoot?.name ?? "none"
      }`,
      previousOwnershipHash,
      force: input.state.scopedOptions.force,
    });
    if (plan.changed) {
      if (plan.bytes.byteLength === 0) {
        result.changes.push(`remove ${path}`);
        if (!input.state.scopedOptions.dryRun) rmSync(path, { force: true });
      } else {
        writeManagedBytes(
          path,
          plan.bytes,
          input.state.scopedOptions.dryRun,
          result,
        );
      }
    }
    if (plan.ownershipHash) {
      result.managedPaths?.push(
        ownManagedPath(
          {
            path: adapter.path,
            kind: "managed-fields",
            fields: [OWNERSHIP_FIELD],
            fieldHashes: { [OWNERSHIP_FIELD]: plan.ownershipHash },
          },
          { surface: "instructions", target: adapter.target },
        ),
      );
    }
  }
  return result;
}

export function syncProjectInstructions(input: {
  state: EffectiveState;
  previousManagedPaths: readonly ManagedPath[];
  composition?: InstructionComposition;
}): SyncResult {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  if (
    !input.state.projectRoot ||
    input.state.scopedOptions.writeScope === "machine" ||
    input.state.scopedOptions.mcpOnly ||
    input.state.scopedOptions.skillsOnly ||
    input.state.scopedOptions.target
  ) {
    return result;
  }
  const composition =
    input.composition ?? instructionCompositionForState(input.state);
  result.warnings.push(...instructionWarnings(composition));
  assertStrictInstructionConsent(input.state, composition);

  const previous = input.previousManagedPaths.find(
    (entry) =>
      entry.surface === "instructions" &&
      entry.kind === "managed-fields" &&
      entry.path === "AGENTS.md",
  );
  const previousOwnershipHash =
    previous?.kind === "managed-fields"
      ? previous.fieldHashes[OWNERSHIP_FIELD]
      : undefined;
  const path = join(input.state.projectRoot, "AGENTS.md");
  const currentBytes = existsSync(path)
    ? new Uint8Array(readFileSync(path))
    : new Uint8Array();
  const instructionId = `worker:${
    input.state.workerSelection?.selectedRoot?.name ?? "none"
  }`;
  const plan = planInstructionProjection({
    currentBytes,
    composition,
    instructionId,
    previousOwnershipHash,
    force: input.state.normalized.force,
  });
  if (plan.changed) {
    writeManagedBytes(
      path,
      plan.bytes,
      input.state.scopedOptions.dryRun,
      result,
    );
  }
  if (plan.ownershipHash) {
    result.managedPaths?.push(
      ownManagedPath(
        {
          path: "AGENTS.md",
          kind: "managed-fields",
          fields: [OWNERSHIP_FIELD],
          fieldHashes: { [OWNERSHIP_FIELD]: plan.ownershipHash },
        },
        { surface: "instructions" },
      ),
    );
  }

  const adapterRelativePath = ".claude/CLAUDE.md";
  const previousAdapter = input.previousManagedPaths.find(
    (entry) =>
      entry.surface === "instructions" && entry.path === adapterRelativePath,
  );
  const previousAdapterOwnership: ClaudeAdapterOwnership | undefined =
    previousAdapter?.kind === "managed-content"
      ? {
          kind: "managed-content",
          hash: previousAdapter.contentHash as `sha256-${string}`,
        }
      : previousAdapter?.kind === "managed-fields"
        ? {
            kind: "managed-fields",
            hash: previousAdapter.fieldHashes["drwn:claude-adapter"] as `sha256-${string}`,
          }
        : undefined;
  const adapterPath = join(input.state.projectRoot, adapterRelativePath);
  const adapterCurrent = existsSync(adapterPath)
    ? new Uint8Array(readFileSync(adapterPath))
    : new Uint8Array();
  const adapterPlan = planClaudeInstructionAdapter({
    currentBytes: adapterCurrent,
    desired: Boolean(composition.bytes),
    previousOwnership: previousAdapterOwnership,
    applyForeignAdapter: input.state.scopedOptions.applyClaudeAdapter,
    force: input.state.normalized.force,
  });
  if (adapterPlan.warning) result.warnings.push(adapterPlan.warning);
  if (adapterPlan.changed) {
    if (adapterPlan.bytes.byteLength === 0) {
      result.changes.push(`remove ${adapterPath}`);
      if (!input.state.scopedOptions.dryRun) rmSync(adapterPath, { force: true });
    } else {
      writeManagedBytes(
        adapterPath,
        adapterPlan.bytes,
        input.state.scopedOptions.dryRun,
        result,
      );
    }
  }
  if (adapterPlan.ownership?.kind === "managed-content") {
    result.managedPaths?.push(
      ownManagedPath(
        {
          path: adapterRelativePath,
          kind: "managed-content",
          contentHash: adapterPlan.ownership.hash,
        },
        { surface: "instructions" },
      ),
    );
  }
  if (adapterPlan.ownership?.kind === "managed-fields") {
    result.managedPaths?.push(
      ownManagedPath(
        {
          path: adapterRelativePath,
          kind: "managed-fields",
          fields: ["drwn:claude-adapter"],
          fieldHashes: {
            "drwn:claude-adapter": adapterPlan.ownership.hash,
          },
        },
        { surface: "instructions" },
      ),
    );
  }
  return result;
}
