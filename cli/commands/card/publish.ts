// ABOUTME: Implements `drwn card publish` for immutable local card versions.
// ABOUTME: Refuses overwrites so lockfiles can trust published versions.

import { Option } from "clipanion";
import { publishCard, type ConsentImpact } from "../../core/card-store";
import { BaseCommand } from "../base";

export class CardPublishCommand extends BaseCommand {
  static override paths = [["card", "publish"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Publish a card source into the Git-backed local card store.",
    details: `
      Validates card.json and package.json when present, then commits the source
      into the card's bare repo under ~/.agents/drwn/cards/ and tags the manifest
      version. Existing versions are never overwritten. When bumping an existing
      version, prints a consent-impact report showing which surfaces (hooks,
      instructions, skills, servers) changed content.
    `,
    examples: [
      ["Publish a card", "drwn card publish @your-handle/backend"],
      ["Publish with JSON consent-impact output", "drwn card publish @your-handle/backend --json"],
    ],
  });

  name = Option.String({ required: true });

  forceBumpMismatch = Option.Boolean("--force-bump-mismatch", false, {
    description: "Publish despite a mismatch between structural diff classification and declared version bump.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output including consent-impact analysis.",
  });

  async execute() {
    let published;
    try {
      published = await publishCard(this.context.agentsDir, this.name, {
        forceBumpMismatch: this.forceBumpMismatch,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.forceBumpMismatch) {
      this.context.stderr.write(
        `Warning: --force-bump-mismatch used for ${published.name}@${published.version}\n`,
      );
    }
    if (this.json) {
      this.context.stdout.write(
        `${JSON.stringify(
          {
            name: published.name,
            version: published.version,
            versionDir: published.versionDir,
            integrity: published.integrity,
            consentImpact: published.consentImpact ?? null,
          },
          null,
          2,
        )}\n`,
      );
    } else {
      this.context.stdout.write(`Published ${published.name}@${published.version}: ${published.versionDir}\n`);
      if (published.consentImpact) {
        renderConsentImpactHuman(this.context.stdout, published.name, published.consentImpact);
      }
    }
    return 0;
  }
}

function renderConsentImpactHuman(stdout: { write: (s: string) => void }, cardName: string, impact: ConsentImpact) {
  stdout.write(`\nConsent impact (for consumers of ${cardName}):\n`);
  stdout.write(`  hooks:        ${formatChanged(impact.hooks.changed)}`);
  if (impact.hooks.changed) stdout.write(` — policy digest changed (consumers must re-trust --hooks)`);
  stdout.write(`\n`);
  stdout.write(`  instructions: ${formatChanged(impact.instructions.changed)}`);
  if (impact.instructions.changed) stdout.write(` — content changed (consumers must re-trust --instructions)`);
  stdout.write(`\n`);
  stdout.write(`  skills:       ${formatChanged(impact.skills.changed)}`);
  if (!impact.skills.changed) stdout.write(` (${impact.skills.fromCount} → ${impact.skills.toCount})`);
  stdout.write(`\n`);
  stdout.write(`  servers:      ${formatChanged(impact.servers.changed)}\n`);
  if (impact.hooks.changed || impact.instructions.changed) {
    stdout.write(`\nAffected consumers: run \`drwn up\` (or \`drwn projects update --all\`) in projects selecting this card.\n`);
  }
}

function formatChanged(changed: boolean): string {
  return changed ? "CHANGED" : "unchanged";
}
