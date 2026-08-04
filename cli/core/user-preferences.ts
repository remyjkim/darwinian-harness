// ABOUTME: Defines strict machine-local preferences for Card authoring and catalog checkout discovery.
// ABOUTME: Keeps user preferences independent from machine Worker intent and lifecycle.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { DrwnError } from "./errors";
import { writeAtomically } from "./fs";
import { withInventoryLock } from "./inventory-lock";
import { resolveUserConfigPath } from "./paths";
import { assertStoreWritable } from "./store-paths";

const checkoutPath = z.string().min(1).refine(
  (value) => value.trim() === value,
  "must not have surrounding whitespace",
);

const userPreferencesSchema = z.object({
  schema: z.literal("drwn.user-preferences"),
  schemaVersion: z.literal(1),
  catalogCheckouts: z.array(checkoutPath).superRefine((values, context) => {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      if (seen.has(value)) {
        context.addIssue({ code: "custom", path: [index], message: `duplicate catalog checkout: ${value}` });
      }
      seen.add(value);
    }
  }),
  defaultAuthorScope: z.string().min(1).optional(),
}).strict();

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

function invalidPreferences(message: string, cause?: unknown): DrwnError {
  return new DrwnError(
    "USER_PREFERENCES_INVALID",
    message,
    ["Use `drwn config` to repair ~/.agents/drwn/config.json."],
    cause,
  );
}

function isRetiredPrototype(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (value as Record<string, unknown>).schema === undefined
    && "version" in value;
}

export function createEmptyUserPreferences(): UserPreferences {
  return {
    schema: "drwn.user-preferences",
    schemaVersion: 1,
    catalogCheckouts: [],
  };
}

export function parseUserPreferences(value: unknown, path = "config.json"): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "root"}: ${issue.message}`)
      .join("; ");
    throw invalidPreferences(`Invalid user preferences at ${path}: ${details}`, parsed.error);
  }
  return parsed.data;
}

export async function readUserPreferencesFile(path: string): Promise<UserPreferences | null> {
  if (!existsSync(path)) return null;
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    if (isRetiredPrototype(raw)) return null;
    return parseUserPreferences(raw, path);
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw invalidPreferences(`Invalid JSON in user preferences at ${path}`, error);
  }
}

export async function writeUserPreferencesFile(path: string, preferences: UserPreferences): Promise<void> {
  const validated = parseUserPreferences(preferences, path);
  try {
    await writeAtomically(path, `${JSON.stringify(validated, null, 2)}\n`);
  } catch (error) {
    throw new DrwnError(
      "USER_PREFERENCES_WRITE_FAILED",
      `Failed to write user preferences at ${path}`,
      ["Check write permission on the user preferences directory."],
      error,
    );
  }
}

export async function loadUserPreferences(agentsDir: string): Promise<UserPreferences> {
  const preferencesPath = resolveUserConfigPath(agentsDir);
  return await readUserPreferencesFile(preferencesPath) ?? createEmptyUserPreferences();
}

export async function mutateUserPreferences<T>(
  agentsDir: string,
  prepare: (preferences: UserPreferences) =>
    | { preferences: UserPreferences; value: T }
    | Promise<{ preferences: UserPreferences; value: T }>,
  options: { dryRun?: boolean } = {},
): Promise<T> {
  const run = async () => {
    const preferencesPath = resolveUserConfigPath(agentsDir);
    const current = await readUserPreferencesFile(preferencesPath) ?? createEmptyUserPreferences();
    const prepared = await prepare(structuredClone(current));
    const validated = parseUserPreferences(prepared.preferences, preferencesPath);
    if (!options.dryRun) await writeUserPreferencesFile(preferencesPath, validated);
    return prepared.value;
  };
  if (options.dryRun) return run();
  assertStoreWritable();
  return withInventoryLock(agentsDir, run);
}
