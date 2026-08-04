// ABOUTME: Idempotently authors project gitignore and vendor gitattributes for drwn hygiene.
// ABOUTME: Keeps overlay files gitignored and vendor trees byte-exact across platform checkouts.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProjectConfig } from "./project";

export const DRWN_GITIGNORE_MARKER = "# drwn";

const ALWAYS_IGNORED_ENTRIES = [
  ".agents/drwn/config.local.json",
  ".agents/drwn/card.lock.local",
  ".agents/drwn/write-record.json",
  ".agents/drwn/org-worker-materialization.json",
  ".agents/drwn/.org-worker-materialization-journal.json",
  ".agents/drwn/receipts/",
  ".agents/drwn/generated/",
];

const PROJECTION_SURFACE_ENTRIES = [
  ".claude/skills/",
  ".codex/skills/",
  ".agents/drwn/opencode-skills/",
  ".cursor/",
  ".mcp.json",
  ".cursor/mcp.json",
  ".opencode/plugins/drwn-hooks.js",
];

export async function committedSurfacesEnabled(projectRoot: string) {
  const configPath = join(projectRoot, ".agents", "drwn", "config.json");
  if (!existsSync(configPath)) return false;
  return (await loadProjectConfig(configPath)).committedSurfaces === true;
}

export async function buildDesiredGitignoreEntries(projectRoot: string) {
  const entries = [...ALWAYS_IGNORED_ENTRIES];
  if (!(await committedSurfacesEnabled(projectRoot))) {
    entries.push(...PROJECTION_SURFACE_ENTRIES);
  }
  return entries;
}

function extractDrwnBlock(lines: string[]) {
  const start = lines.findIndex((line) => line.trim() === DRWN_GITIGNORE_MARKER);
  if (start === -1) {
    return { before: lines, block: [] as string[], after: [] as string[] };
  }
  let end = start + 1;
  while (end < lines.length && lines[end]?.trim() !== "") {
    end += 1;
  }
  return {
    before: lines.slice(0, start),
    block: lines.slice(start, end),
    after: lines.slice(end),
  };
}

function renderDrwnBlock(entries: string[]) {
  return [DRWN_GITIGNORE_MARKER, ...entries, ""];
}

export async function ensureGitignoreEntries(projectRoot: string) {
  const gitignorePath = join(projectRoot, ".gitignore");
  const existing = existsSync(gitignorePath) ? await readFile(gitignorePath, "utf8") : "";
  const desiredEntries = await buildDesiredGitignoreEntries(projectRoot);
  const lines = existing.length > 0 ? existing.replace(/\n$/, "").split("\n") : [];
  const { before, block, after } = extractDrwnBlock(lines);
  const previousEntries = block.slice(1).filter((line) => line.trim().length > 0);
  const committedSurfaces = await committedSurfacesEnabled(projectRoot);
  const toggledCommittedSurfaces =
    block.length > 0 &&
    ((committedSurfaces && previousEntries.includes(".claude/skills/")) ||
      (!committedSurfaces && !previousEntries.includes(".claude/skills/")));

  const nextLines = [...before, ...renderDrwnBlock(desiredEntries), ...after.filter((line) => line.trim().length > 0 || line === "")];
  const next = nextLines.join("\n");
  const normalizedNext = next.length > 0 && !next.endsWith("\n") ? `${next}\n` : next.length > 0 ? next : "";
  if (normalizedNext !== existing) {
    if (normalizedNext.length === 0) {
      await writeFile(gitignorePath, "");
    } else {
      await writeFile(gitignorePath, normalizedNext.endsWith("\n") ? normalizedNext : `${normalizedNext}\n`);
    }
  }

  if (toggledCommittedSurfaces) {
    console.warn(
      "committedSurfaces mode changed: projection surfaces may now be committable. Review working-tree git status before committing.",
    );
  }

  return gitignorePath;
}

export async function ensureVendorGitattributes(projectRoot: string) {
  const drwnDir = join(projectRoot, ".agents", "drwn");
  await mkdir(drwnDir, { recursive: true });
  const path = join(drwnDir, ".gitattributes");
  const desired = ["vendor/** -text linguist-generated=true", ""].join("\n");
  if (existsSync(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.includes("vendor/** -text")) {
      return path;
    }
    await writeFile(path, `${existing.replace(/\n?$/, "\n")}${desired}`);
    return path;
  }
  await writeFile(path, desired);
  return path;
}
