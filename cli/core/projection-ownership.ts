// ABOUTME: Selects projection ownership for full and partial write reconciliation.
// ABOUTME: Keeps retention policy independent from adapter-specific filesystem paths.

import { OPENCODE_SKILLS_PATHS_FIELD } from "./mcp";
import { dedupeManagedPathsByPath, managedFieldsSubset, type ManagedPath, type ProjectionTarget } from "./write-record";

export interface ProjectionSelection {
  mcpOnly?: boolean;
  skillsOnly?: boolean;
  target?: Extract<ProjectionTarget, "claude" | "codex" | "cursor" | "opencode">;
}

export function isProjectionOwnershipSelected(
  entry: Pick<ManagedPath, "surface" | "target">,
  selection: ProjectionSelection,
) {
  if (entry.surface === "worker") {
    return true;
  }
  if (entry.surface === "mcp") {
    return !selection.skillsOnly && (!selection.target || entry.target === selection.target);
  }
  if (entry.surface === "skill") {
    return !selection.mcpOnly && (!selection.target || entry.target === selection.target);
  }
  return !selection.mcpOnly && !selection.skillsOnly && (!selection.target || entry.target === selection.target);
}

// The skills.paths declaration lives inside the mcp-owned opencode.json entry but carries
// skill-surface semantics: skills-side writes refresh it and --mcp-only retains it.
function isManagedFieldSelected(
  field: string,
  entry: Extract<ManagedPath, { kind: "managed-fields" }>,
  selection: ProjectionSelection,
) {
  if (field === OPENCODE_SKILLS_PATHS_FIELD && entry.target === "opencode") {
    return !selection.mcpOnly && (!selection.target || selection.target === "opencode");
  }
  return isProjectionOwnershipSelected(entry, selection);
}

export function retainUnselectedProjectionOwnership(
  previous: ManagedPath[],
  desired: ManagedPath[],
  selection: ProjectionSelection,
) {
  const retained: ManagedPath[] = [];
  for (const entry of previous) {
    if (entry.kind === "managed-fields") {
      const retainedFields = entry.fields.filter((field) => !isManagedFieldSelected(field, entry, selection));
      if (retainedFields.length === 0) {
        continue;
      }
      retained.push(retainedFields.length === entry.fields.length ? entry : managedFieldsSubset(entry, retainedFields));
      continue;
    }
    if (!isProjectionOwnershipSelected(entry, selection)) {
      retained.push(entry);
    }
  }

  const merged = new Map<string, ManagedPath>(retained.map((entry) => [entry.path, entry]));
  for (const entry of desired) {
    const current = merged.get(entry.path);
    if (
      current?.kind === "managed-fields" &&
      entry.kind === "managed-fields" &&
      current.surface === entry.surface &&
      current.target === entry.target
    ) {
      merged.set(entry.path, {
        ...entry,
        fields: [...new Set([...current.fields, ...entry.fields])],
        fieldHashes: { ...current.fieldHashes, ...entry.fieldHashes },
      });
      continue;
    }
    merged.set(entry.path, entry);
  }
  return dedupeManagedPathsByPath([...merged.values()]);
}
