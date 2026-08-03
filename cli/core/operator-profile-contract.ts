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

export const DARWINIAN_OPERATOR_V200_PIN = {
  id: "darwinian-operator",
  source: "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.0",
  name: "@darwinian/operator",
  version: "2.0.0",
  commit: "68271137d21a59f13eb02bd0cd61ce471c9757a7",
  treeSha: "4c9217f758b8f78949929b935514d5173d99004c",
  integrity: "sha256-c698f560e696e4d629180a6ea1da0b9880774eea2bd3ef47d9034ea549dd782b",
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

export const operatorV200ProfilePinSchema = z.object({
  id: z.literal(DARWINIAN_OPERATOR_V200_PIN.id),
  source: z.literal(DARWINIAN_OPERATOR_V200_PIN.source),
  name: z.literal(DARWINIAN_OPERATOR_V200_PIN.name),
  version: z.literal(DARWINIAN_OPERATOR_V200_PIN.version),
  commit: z.literal(DARWINIAN_OPERATOR_V200_PIN.commit),
  treeSha: z.literal(DARWINIAN_OPERATOR_V200_PIN.treeSha),
  integrity: z.literal(DARWINIAN_OPERATOR_V200_PIN.integrity),
  skills: exactIds(DARWINIAN_OPERATOR_V200_PIN.skills, "Operator v2.0.0 skills"),
  mcpServers: exactIds(DARWINIAN_OPERATOR_V200_PIN.mcpServers, "Operator v2.0.0 MCP servers"),
}).strict();

export const supportedOperatorProfilePinSchema = z.union([
  operatorProfilePinSchema,
  operatorV200ProfilePinSchema,
]);

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
