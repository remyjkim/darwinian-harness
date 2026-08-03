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
  contentIntegrity: "sha256-ce016375f77d80cec1081b45995a06ff9ece36f57f182f2137baea87a09575ef",
  skills: DARWINIAN_OPERATOR_SKILL_IDS,
  mcpServers: [],
} as const;
