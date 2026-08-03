// ABOUTME: Implements `drwn card status` for project card config and lockfile state.
// ABOUTME: Makes card consumption inspectable without mutating project files.

import { Option } from "clipanion";
import { readProjectCardStatus } from "../../core/card-project";
import { explainStatus } from "../../core/diagnostics";
import { isHookConsentValid } from "../../core/hook-consent";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";
import type { CardLockEntry } from "../../core/card-lock";
import {
  isInstructionConsentValid,
  resolveExplicitInstructionContribution,
} from "../../core/instruction-contribution";

function formatHookConsent(card: CardLockEntry) {
  if (!card.hookConsent) {
    return "absent";
  }
  if (isHookConsentValid(card)) {
    return `granted (${card.hookConsent.consentedRange})`;
  }
  return `out-of-range (consented: ${card.hookConsent.consentedRange}, locked: ${card.version})`;
}

function formatInstructionConsent(card: CardLockEntry) {
  if (!card.instructionConsent) return "absent";
  try {
    const contribution = resolveExplicitInstructionContribution(card, card.path);
    if (contribution && isInstructionConsentValid(card, contribution)) {
      return `granted (${card.instructionConsent.consentedRange})`;
    }
  } catch {
    // Status reports stale/invalid rather than leaking source content or failing.
  }
  return "stale";
}

export class CardStatusCommand extends BaseCommand {
  static override paths = [["card", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show current project card specs, lock entries, and outdated cards.",
    details: `
      Shows the current project's configured card refs, locked versions, and
      available updates. Use --explain for provenance across cards, skills,
      MCP servers, targets, and write-record ownership.
    `,
    examples: [["Show card status", "drwn card status"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  explain = Option.Boolean("--explain", false, {
    description: "Show card provenance and related write-record state.",
  });

  async execute() {
    if (!this.context.projectConfigPath) {
      throw new Error("Run this command inside a project with .agents/drwn/config.json.");
    }
    if (this.explain) {
      this.context.stdout.write(
        await explainStatus(this.context.repoRoot, this.context.agentsDir, this.context.homeDir, this.context.projectConfigPath),
      );
      return 0;
    }
    const status = await readProjectCardStatus(this.context.projectConfigPath, this.context.agentsDir, {
      repoRoot: this.context.repoRoot,
      homeDir: this.context.homeDir,
    });
    if (this.json) {
      this.context.stdout.write(renderJson({
        ...status,
        locked: status.locked.map((card) => ({
          ...card,
          hookConsent: card.hookConsent ?? null,
          instructionConsent: card.instructionConsent ?? null,
          mode: status.modes[card.name] ?? null,
        })),
        modes: status.modes,
      }));
      return 0;
    }
    this.context.stdout.write(
      [
        `Project: ${status.projectRoot}`,
        `Specs: ${status.specs.join(", ") || "none"}`,
        status.locked.length === 0
          ? "Locked: none"
          : `Locked:\n${status.locked.map((card) => {
              const mode = status.modes[card.name];
              const modeLine = mode
                ? ` mode=${mode.mode} reason=${mode.reason} lane=${mode.lane}${mode.sourcePath ? ` source=${mode.sourcePath}` : ""}`
                : "";
              return `- ${card.name}@${card.version} (${card.requested}) hook-consent: ${formatHookConsent(card)} instruction-consent: ${formatInstructionConsent(card)}${modeLine}`;
            }).join("\n")}`,
        status.outdated.length === 0
          ? "Outdated: none"
          : `Outdated:\n${status.outdated.map((card) => `- ${card.name} ${card.current} -> ${card.latest}`).join("\n")}`,
      ].join("\n") + "\n",
    );
    return 0;
  }
}
