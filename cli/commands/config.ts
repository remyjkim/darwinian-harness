// ABOUTME: Implements drwn config get/set for strict user authoring preferences.
// ABOUTME: Keeps catalog checkout and default author scope mutations explicit and validated.

import { Option } from "clipanion";
import { renderJson } from "../core/output";
import { loadUserPreferences, mutateUserPreferences, type UserPreferences } from "../core/user-preferences";
import { BaseCommand } from "./base";

type PreferenceKey = "catalogCheckouts" | "defaultAuthorScope";

function preferenceKey(value: string): PreferenceKey {
  if (value === "catalogCheckouts" || value === "defaultAuthorScope") return value;
  throw new Error(`Unknown config key: ${value}. Expected catalogCheckouts or defaultAuthorScope.`);
}

export class ConfigGetCommand extends BaseCommand {
  static override paths = [["config", "get"]];
  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Read a machine-local Card authoring preference.",
    details: `
      Reads strict user preferences without consulting project or machine
      capability state. Missing preferences are reported as null.
    `,
    examples: [["Show catalog checkouts", "drwn config get catalogCheckouts"]],
  });

  key = Option.String({ required: true });
  json = Option.Boolean("--json", false);

  async execute() {
    try {
      const key = preferenceKey(this.key);
      const preferences = await loadUserPreferences(this.context.agentsDir);
      const value = preferences[key] ?? null;
      this.context.stdout.write(this.json ? renderJson({ key, value }) : `${JSON.stringify(value)}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}

export class ConfigSetCommand extends BaseCommand {
  static override paths = [["config", "set"]];
  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Set a machine-local Card authoring preference.",
    details: `
      Atomically updates catalog checkout roots or the default Card author
      scope in the strict user-preferences file.
    `,
    examples: [
      ["Set catalog checkouts", "drwn config set catalogCheckouts '[\"~/dev/darwinian-cards\"]'"],
      ["Set the default author scope", "drwn config set defaultAuthorScope @your-handle"],
    ],
  });

  key = Option.String({ required: true });
  value = Option.String({ required: true });
  json = Option.Boolean("--json", false);

  async execute() {
    try {
      const key = preferenceKey(this.key);
      let value: UserPreferences[PreferenceKey];
      if (key === "catalogCheckouts") {
        value = JSON.parse(this.value) as string[];
      } else {
        if (!/^@[a-z0-9-]+$/.test(this.value)) {
          throw new Error("defaultAuthorScope must look like @your-handle.");
        }
        value = this.value;
      }
      await mutateUserPreferences(this.context.agentsDir, (preferences) => ({
        preferences: { ...preferences, [key]: value },
        value: undefined,
      }));
      this.context.stdout.write(this.json ? renderJson({ key, value }) : `Set ${key}.\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
