// ABOUTME: Computes additive Worker capability deltas without override semantics.
// ABOUTME: Omits identical base identities and fails divergent skill or MCP collisions.

import { DrwnError } from "../errors";

export interface WorkerCapabilityIdentity {
  id: string;
  identityHash: string;
}

function conflictCode(kind: "skill" | "mcp" | "hook") {
  if (kind === "skill") return "LAUNCH_SKILL_CONFLICT";
  if (kind === "mcp") return "LAUNCH_MCP_CONFLICT";
  return "LAUNCH_ROOT_CLOSURE_INVALID";
}

export function computeWorkerCapabilityDelta<T extends WorkerCapabilityIdentity>(input: {
  kind: "skill" | "mcp" | "hook";
  base: readonly T[];
  assigned: readonly T[];
}): T[] {
  const baseById = new Map<string, T>();
  for (const entry of input.base) {
    const previous = baseById.get(entry.id);
    if (previous && previous.identityHash !== entry.identityHash) {
      throw new DrwnError(conflictCode(input.kind), `Base ${input.kind} capability ${entry.id} has divergent definitions`);
    }
    baseById.set(entry.id, entry);
  }
  const assignedById = new Map<string, T>();
  for (const entry of input.assigned) {
    const previous = assignedById.get(entry.id);
    if (previous && previous.identityHash !== entry.identityHash) {
      throw new DrwnError(conflictCode(input.kind), `Assigned ${input.kind} capability ${entry.id} has divergent definitions`);
    }
    assignedById.set(entry.id, entry);
  }
  const delta: T[] = [];
  for (const entry of [...assignedById.values()].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) {
    const base = baseById.get(entry.id);
    if (!base) {
      delta.push(entry);
      continue;
    }
    if (base.identityHash !== entry.identityHash) {
      throw new DrwnError(
        conflictCode(input.kind),
        `Worker launch ${input.kind} capability ${entry.id} would replace the active base definition`,
        ["Choose compatible Worker roots or rename the conflicting capability."],
      );
    }
  }
  return delta;
}
