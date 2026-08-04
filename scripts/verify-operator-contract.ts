// ABOUTME: Verifies the canonical Operator Card source independently from machine activation.
// ABOUTME: Runs offline and reports deterministic release-blocking issues without mutating repository state.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertValidCardManifest, type CardManifest } from "../cli/core/card-manifest";
import {
  computeContentManifest,
  hashFileContent,
  manifestIntegrityDigest,
  type ContentManifest,
} from "../cli/core/content-manifest";
import {
  DARWINIAN_OPERATOR_CARD,
  DARWINIAN_OPERATOR_SKILL_IDS,
} from "../cli/core/operator-card-contract";
import type { CheckResult } from "./verify-release-readiness";

type SourceOverrides = Record<string, string>;

const OPERATOR_ROOT = "darwinian-worker-skills/cards/operator";
const CANONICAL_SKILL_ROOT = "darwinian-worker-skills/skills";

const retiredCommands = [
  /\bdrwn card (?:add|apply|pin|remove|update|detach)\b/,
  /\bdrwn worker stack\b/,
  /\bdrwn mind (?:list|use|clear)\b/,
  /\bdrwn (?:library|store)\b/,
  /\bdrwn skills (?:curate|uncurate)\b/,
  /\bdrwn machine (?:skill|mcp) (?:enable|disable)\b/,
  /--no-apply\b/,
];

const retiredOperatorSkillIds = [
  "apply-mind-card",
  "author-mind-card",
  "install-project",
  "inspect-minds",
  "materialize-minds",
  "manage-library",
  "repair-minds",
  "manage-defaults",
  "recommend-minds",
  "share-mind-card",
  "sync-card-skills",
  "import-mcp-from-claude",
  "manage-active-mind-stack",
] as const;

function withoutComments(sourceText: string): string {
  return sourceText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function source(root: string, path: string, overrides: SourceOverrides): string {
  if (Object.hasOwn(overrides, path)) return overrides[path]!;
  return readFileSync(join(root, path), "utf8");
}

async function manifestWithOverrides(
  root: string,
  relativeDir: string,
  overrides: SourceOverrides,
): Promise<ContentManifest> {
  const manifest = await computeContentManifest(join(root, relativeDir));
  const files = [...manifest.files];
  const prefix = `${relativeDir}/`;
  for (const [path, content] of Object.entries(overrides)) {
    if (!path.startsWith(prefix)) continue;
    const relativePath = path.slice(prefix.length);
    const index = files.findIndex((file) => file.path === relativePath);
    const replacement = {
      path: relativePath,
      exec: index === -1 ? false : files[index]!.exec,
      hash: hashFileContent(Buffer.from(content)),
    };
    if (index === -1) files.push(replacement);
    else files[index] = replacement;
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function verifyOperatorContract(
  root = process.cwd(),
  overrides: SourceOverrides = {},
): Promise<CheckResult> {
  const issues: string[] = [];
  if (existsSync(join(root, "registry/machine-profiles.json")) || Object.hasOwn(overrides, "registry/machine-profiles.json")) {
    issues.push("retired machine profile registry must not ship");
  }

  const manifestPath = `${OPERATOR_ROOT}/card.json`;
  let manifest: CardManifest | undefined;
  try {
    manifest = JSON.parse(source(root, manifestPath, overrides)) as CardManifest;
    assertValidCardManifest(manifest);
  } catch {
    issues.push("canonical Operator manifest must be valid");
  }
  if (manifest) {
    if (manifest.name !== DARWINIAN_OPERATOR_CARD.name || manifest.version !== DARWINIAN_OPERATOR_CARD.version) {
      issues.push("canonical Operator identity must match the Operator Card contract");
    }
    if (!sameJson(manifest.skills?.include ?? [], DARWINIAN_OPERATOR_CARD.skills)) {
      issues.push("canonical Operator manifest must expose exactly eight approved skills");
    }
    if (!sameJson(Object.keys(manifest.servers ?? {}), DARWINIAN_OPERATOR_CARD.mcpServers)) {
      issues.push("unapproved Operator MCP definition");
    }
    if (manifest.harness?.minVersion !== DARWINIAN_OPERATOR_CARD.minDrwnVersion) {
      issues.push(`canonical Operator harness floor must be ${DARWINIAN_OPERATOR_CARD.minDrwnVersion}`);
    }
    if (manifest.lastValidatedWith !== DARWINIAN_OPERATOR_CARD.minDrwnVersion) {
      issues.push(`canonical Operator lastValidatedWith must be ${DARWINIAN_OPERATOR_CARD.minDrwnVersion}`);
    }
  }

  if (existsSync(join(root, OPERATOR_ROOT))) {
    const integrity = manifestIntegrityDigest(await manifestWithOverrides(root, OPERATOR_ROOT, overrides));
    if (integrity !== DARWINIAN_OPERATOR_CARD.contentIntegrity) {
      issues.push("canonical Operator content integrity differs from the Operator Card contract");
    }
  } else {
    issues.push("canonical Operator Card source is missing");
  }

  const operatorSources: string[] = [
    manifestPath,
    "darwinian-worker-skills/scripts/card-map.mjs",
    "darwinian-worker-skills/bundle.json",
  ];
  for (const skill of DARWINIAN_OPERATOR_SKILL_IDS) {
    const canonicalDir = `${CANONICAL_SKILL_ROOT}/${skill}`;
    const bundledDir = `${OPERATOR_ROOT}/skills/${skill}`;
    const canonicalManifest = await manifestWithOverrides(root, canonicalDir, overrides);
    const bundledManifest = await manifestWithOverrides(root, bundledDir, overrides);
    if (!sameJson(canonicalManifest, bundledManifest)) {
      issues.push(`bundled Operator skill differs from canonical source: ${skill}`);
    }
    for (const file of canonicalManifest.files) {
      const path = `${canonicalDir}/${file.path}`;
      operatorSources.push(path);
    }
    for (const file of bundledManifest.files) {
      const path = `${bundledDir}/${file.path}`;
      operatorSources.push(path);
    }
  }

  const operatorText = operatorSources
    .filter((path) => existsSync(join(root, path)) || Object.hasOwn(overrides, path))
    .map((path) => source(root, path, overrides))
    .join("\n");
  if (retiredCommands.some((pattern) => pattern.test(operatorText))) {
    issues.push("retired Operator command remains in canonical or bundled content");
  }
  for (const id of retiredOperatorSkillIds) {
    if (new RegExp(`(?:^|[^a-z0-9-])${id}(?:$|[^a-z0-9-])`, "m").test(operatorText)) {
      issues.push(`retired Operator skill ID remains: ${id}`);
    }
  }

  const runtimeText = [...new Bun.Glob("**/*.ts").scanSync({ cwd: join(root, "cli"), absolute: true })]
    .map((path) => {
      const relativePath = path.slice(root.length + 1);
      return withoutComments(source(root, relativePath, overrides));
    })
    .join("\n");
  if (retiredCommands.some((pattern) => pattern.test(runtimeText))) {
    issues.push("retired Operator command remains in production runtime guidance");
  }

  const inventorySkill = source(root, `${CANONICAL_SKILL_ROOT}/manage-machine-inventory/SKILL.md`, overrides);
  if (/portable inventory[^\n]*(?:is|as|provides|serves as)[^\n]*(?:backup|restore)|(?:backup|restore)[^\n]*portable inventory/i.test(inventorySkill)) {
    issues.push("portable inventory is not backup or restore");
  }

  return {
    name: "operator runtime contract",
    ok: issues.length === 0,
    details: issues.join("; ") || undefined,
  };
}
