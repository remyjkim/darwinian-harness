// ABOUTME: Resolves every Card authoring input through one explicit-path or catalog-name contract.
// ABOUTME: Normalizes source directories and treats each validated card.json manifest as authoritative identity.

import { existsSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type CardManifest, isCardScopeName, isCardUnscopedName, retiredGovernanceFieldErrors, validateCardManifest } from "./card-manifest";
import { DrwnError } from "./errors";
import { expandHomePath } from "./paths";

export interface ResolvedCardSourceInput {
  sourceDir: string;
  manifestPath: string;
  manifest: CardManifest;
  resolution: "explicit" | "catalog";
}

export interface ResolveCardSourceInputOptions {
  input?: string;
  from?: string;
  cwd: string;
  homeDir: string;
  catalogCheckouts: string[];
}

function sourceError(code: string, message: string, hints: string[] = []): DrwnError {
  return new DrwnError(code, message, hints);
}

function looksLikeCardName(value: string): boolean {
  return isCardScopeName(value) || isCardUnscopedName(value);
}

function explicitPath(value: string, cwd: string, homeDir: string): string {
  let pathValue = value;
  if (pathValue.startsWith("file://")) {
    try {
      pathValue = fileURLToPath(pathValue);
    } catch (error) {
      throw sourceError("CARD_SOURCE_INVALID", `Invalid file URL for Card source: ${value}`, [String(error)]);
    }
  } else if (pathValue.startsWith("file:")) {
    pathValue = pathValue.slice("file:".length);
  }
  pathValue = expandHomePath(pathValue, homeDir);
  return isAbsolute(pathValue) ? pathValue : resolve(cwd, pathValue);
}

async function readValidatedSource(sourcePath: string, resolution: "explicit" | "catalog"): Promise<ResolvedCardSourceInput> {
  let sourceDir: string;
  try {
    const info = await stat(sourcePath);
    if (!info.isDirectory()) throw new Error("not a directory");
    sourceDir = await realpath(sourcePath);
  } catch (error) {
    throw sourceError("CARD_SOURCE_INVALID", `Card source is not a readable directory: ${sourcePath}`, [String(error)]);
  }
  const manifestPath = join(sourceDir, "card.json");
  if (!existsSync(manifestPath)) {
    throw sourceError("CARD_SOURCE_INVALID", `Card source is missing card.json: ${sourceDir}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw sourceError("CARD_SOURCE_INVALID", `Card source has invalid card.json: ${manifestPath}`, [String(error)]);
  }
  const validation = validateCardManifest(raw);
  if (!validation.ok) {
    throw sourceError("CARD_SOURCE_INVALID", `Invalid Card manifest at ${manifestPath}: ${validation.errors.join("; ")}`);
  }
  const retired = retiredGovernanceFieldErrors(raw);
  if (retired.length > 0) {
    throw sourceError("CARD_SOURCE_INVALID", `Invalid Card manifest at ${manifestPath}: ${retired.join("; ")}`);
  }
  return { sourceDir, manifestPath, manifest: raw as CardManifest, resolution };
}

async function catalogMatches(
  name: string,
  options: Pick<ResolveCardSourceInputOptions, "catalogCheckouts" | "homeDir">,
): Promise<ResolvedCardSourceInput[]> {
  const matches: ResolvedCardSourceInput[] = [];
  for (const checkout of options.catalogCheckouts) {
    const checkoutPath = expandHomePath(checkout, options.homeDir);
    const cardsDir = join(checkoutPath, "cards");
    let entries;
    try {
      entries = await readdir(cardsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        const source = await readValidatedSource(join(cardsDir, entry.name), "catalog");
        if (source.manifest.name === name) matches.push(source);
      } catch {
        // An unrelated invalid checkout entry cannot prevent resolution of a valid Card.
      }
    }
  }
  return matches;
}

export async function resolveCardSourceInput(
  options: ResolveCardSourceInputOptions,
): Promise<ResolvedCardSourceInput> {
  if (!options.input && !options.from) {
    throw sourceError(
      "CARD_SOURCE_INPUT_REQUIRED",
      "A Card source name or --from path is required.",
      ["Pass --from <path> or configure catalogCheckouts and pass a Card name."],
    );
  }

  if (options.from) {
    const source = await readValidatedSource(explicitPath(options.from, options.cwd, options.homeDir), "explicit");
    if (options.input && options.input !== source.manifest.name) {
      throw sourceError(
        "CARD_SOURCE_NAME_MISMATCH",
        `Requested Card ${options.input} does not match card.json.name ${source.manifest.name}.`,
      );
    }
    return source;
  }

  const input = options.input!;
  if (!looksLikeCardName(input)) {
    return readValidatedSource(explicitPath(input, options.cwd, options.homeDir), "explicit");
  }

  const matches = await catalogMatches(input, options);
  if (matches.length === 0) {
    throw sourceError(
      "CARD_SOURCE_NOT_FOUND",
      `No configured catalog checkout contains Card source ${input}.`,
      ["Pass --from <path> or run `drwn config set catalogCheckouts '[\"/path/to/catalog\"]'`."],
    );
  }
  if (matches.length > 1) {
    throw sourceError(
      "CARD_SOURCE_AMBIGUOUS",
      `Card source ${input} is ambiguous across configured catalog checkouts: ${matches.map((match) => match.sourceDir).join(", ")}`,
      ["Pass --from <path> to select the intended source explicitly."],
    );
  }
  return matches[0]!;
}
