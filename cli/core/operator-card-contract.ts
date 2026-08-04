// ABOUTME: Defines the canonical Operator Card payload validated for the drwn 1.1.0 release.
// ABOUTME: Keeps Operator release validation independent from machine Worker activation.

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

export const DARWINIAN_OPERATOR_CARD = {
  source: "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.2",
  name: "@darwinian/operator",
  version: "2.0.2",
  minDrwnVersion: "1.1.0",
  contentIntegrity: "sha256-51503533bd60943e5ba16873f129bd600f42c2553084e29d1770e43a7e858999",
  skills: DARWINIAN_OPERATOR_SKILL_IDS,
  mcpServers: [],
} as const;
