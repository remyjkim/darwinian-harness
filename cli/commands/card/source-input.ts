// ABOUTME: Connects command context and user preferences to the shared Card source-input resolver.
// ABOUTME: Keeps path/name resolution identical across publish, release, Worker, and source commands.

import type { AgentsContext } from "../../context";
import { resolveCardSourceInput } from "../../core/card-source-input";
import { loadUserPreferences } from "../../core/user-preferences";

export async function resolveCommandCardSource(
  context: AgentsContext,
  options: { input?: string; from?: string },
) {
  const preferences = await loadUserPreferences(context.agentsDir);
  return resolveCardSourceInput({
    ...options,
    cwd: context.cwd,
    homeDir: context.homeDir,
    catalogCheckouts: preferences.catalogCheckouts,
  });
}
