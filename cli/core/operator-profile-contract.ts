// ABOUTME: Defines the one exact Recommended Darwinian Operator profile accepted by drwn.
// ABOUTME: Centralizes immutable Card coordinates and the machine-safe capability allowlist.

import { z } from "zod";

export const DARWINIAN_OPERATOR_SKILL_IDS = [
  "bootstrap-project",
  "manage-project-worker",
  "inspect-worker",
  "repair-worker",
  "author-card",
  "share-card",
  "manage-machine-inventory",
  "manage-machine-capabilities",
] as const;

export const DARWINIAN_OPERATOR_PROFILE = {
  id: "darwinian-operator",
  displayName: "Recommended Darwinian Operator",
  source: "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.1",
  name: "@darwinian/operator",
  version: "2.0.1",
  commit: "33e3aa7a4cc37bbc462efad8aa50400d940ab0d5",
  treeSha: "c9623c0bc4998c625cc9fefa0ed4fc929e71f0d9",
  integrity: "sha256-e29b7f089df854e8f7f186778fa83de15717712fd710902d642114327b52f380",
  skills: DARWINIAN_OPERATOR_SKILL_IDS,
  mcpServers: [],
} as const;

const exactIds = (expected: readonly string[], label: string) => z.array(z.string().min(1))
  .superRefine((actual, context) => {
    if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
      context.addIssue({
        code: "custom",
        message: `${label} must exactly equal: ${expected.join(", ") || "(empty)"}`,
      });
    }
  });

export const operatorProfilePinSchema = z.object({
  id: z.literal(DARWINIAN_OPERATOR_PROFILE.id),
  source: z.literal(DARWINIAN_OPERATOR_PROFILE.source),
  name: z.literal(DARWINIAN_OPERATOR_PROFILE.name),
  version: z.literal(DARWINIAN_OPERATOR_PROFILE.version),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  treeSha: z.string().regex(/^[a-f0-9]{40}$/),
  integrity: z.string().regex(/^sha256-[a-f0-9]{64}$/),
  skills: exactIds(DARWINIAN_OPERATOR_PROFILE.skills, "Operator skills"),
  mcpServers: exactIds(DARWINIAN_OPERATOR_PROFILE.mcpServers, "Operator MCP servers"),
}).strict();

export const operatorProfileDescriptorSchema = operatorProfilePinSchema.extend({
  displayName: z.literal(DARWINIAN_OPERATOR_PROFILE.displayName),
}).strict();

export const operatorProfileRegistrySchema = z.object({
  schema: z.literal("drwn.machine-profiles"),
  schemaVersion: z.literal(1),
  profiles: z.array(operatorProfileDescriptorSchema).length(1),
}).strict();

export const DARWINIAN_OPERATOR_REGISTRY = {
  schema: "drwn.machine-profiles",
  schemaVersion: 1,
  profiles: [DARWINIAN_OPERATOR_PROFILE],
} as const;

export function createDarwinianOperatorPin(coordinates: {
  commit?: string;
  treeSha?: string;
  integrity?: `sha256-${string}`;
} = {}) {
  return {
    id: DARWINIAN_OPERATOR_PROFILE.id,
    source: DARWINIAN_OPERATOR_PROFILE.source,
    name: DARWINIAN_OPERATOR_PROFILE.name,
    version: DARWINIAN_OPERATOR_PROFILE.version,
    commit: coordinates.commit ?? DARWINIAN_OPERATOR_PROFILE.commit,
    treeSha: coordinates.treeSha ?? DARWINIAN_OPERATOR_PROFILE.treeSha,
    integrity: coordinates.integrity ?? DARWINIAN_OPERATOR_PROFILE.integrity,
    skills: [...DARWINIAN_OPERATOR_SKILL_IDS],
    mcpServers: [],
  };
}
