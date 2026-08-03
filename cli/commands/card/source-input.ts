// ABOUTME: Connects command context and user preferences to the shared Card source-input resolver.
// ABOUTME: Keeps path/name resolution identical across publish, release, Worker, and source commands.

import type { AgentsContext } from "../../context";
import { resolveCardSourceInput } from "../../core/card-source-input";
import { loadUserPreferences } from "../../core/user-preferences";
import { DrwnError } from "../../core/errors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCardSourceDir } from "../../core/store-paths";

export async function resolveCommandCardSource(
  context: AgentsContext,
  options: { input?: string; from?: string },
) {
  const preferences = await loadUserPreferences(context.agentsDir);
  try {
    return await resolveCardSourceInput({
      ...options,
      cwd: context.cwd,
      homeDir: context.homeDir,
      catalogCheckouts: preferences.catalogCheckouts,
    });
  } catch (error) {
    // Temporary compatibility while the I176 test/command conversion drains legacy fixtures.
    if (!options.from && options.input && error instanceof DrwnError && error.code === "CARD_SOURCE_NOT_FOUND") {
      const legacyDir = resolveCardSourceDir(context.agentsDir, options.input);
      if (existsSync(join(legacyDir, "card.json"))) {
        return resolveCardSourceInput({
          from: legacyDir,
          input: options.input,
          cwd: context.cwd,
          homeDir: context.homeDir,
          catalogCheckouts: preferences.catalogCheckouts,
        });
      }
    }
    throw error;
  }
}
