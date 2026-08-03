// ABOUTME: Implements explicit hook and instruction consent for locked Cards.
// ABOUTME: Records user-reviewed ranges and exact instruction content identity.

import { Option, UsageError } from "clipanion";
import { setCardConsent } from "../../core/card-project";
import {
  buildHookConsentAckKey,
  computeHookPolicyDigest,
  recordHookConsentAck,
} from "../../core/hook-consent-ack";
import {
  buildInstructionConsentAckKey,
  recordInstructionConsentAck,
} from "../../core/instruction-consent-ack";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardTrustCommand extends BaseCommand {
  static override paths = [["card", "trust"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Trust a locked card for hook or instruction materialization.",
    details: `
      Records explicit consent for hook policies and/or instruction content
      declared by a locked card. Consent is stored in card.lock and scoped to a
      semver range; instruction consent also pins the exact content digest.
    `,
    examples: [["Trust card hooks", "drwn card trust @your-handle/backend --hooks"]],
  });

  spec = Option.String({ required: true });

  hooks = Option.Boolean("--hooks", false, {
    description: "Record hook execution consent for this card.",
  });

  instructions = Option.Boolean("--instructions", false, {
    description: "Record explicit instruction projection consent for this card.",
  });

  range = Option.String("--range", {
    description: "Semver range covered by this consent. Defaults to ^<locked-version>.",
  });

  async execute() {
    if (!this.hooks && !this.instructions) {
      throw new UsageError("Specify --hooks and/or --instructions to record consent.");
    }
    let result;
    try {
      result = await setCardConsent(
        requireProjectRoot(this),
        this.context.agentsDir,
        this.spec,
        { hooks: this.hooks, instructions: this.instructions },
        this.range,
      );
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    const projectRoot = requireProjectRoot(this);
    if (this.hooks) {
      const hookPolicyDigest = await computeHookPolicyDigest(result.card, result.card.path);
      await recordHookConsentAck(
        this.context.agentsDir,
        buildHookConsentAckKey({ projectRoot, card: result.card, hookPolicyDigest }),
      );
    }
    if (this.instructions) {
      await recordInstructionConsentAck(
        this.context.agentsDir,
        buildInstructionConsentAckKey({ projectRoot, card: result.card }),
      );
    }
    const trusted = [this.hooks ? "hooks" : null, this.instructions ? "instructions" : null]
      .filter(Boolean)
      .join(" and ");
    this.context.stdout.write(
      `Trusted ${trusted} for ${result.card.name}@${result.card.version} (${this.range ?? `^${result.card.version}`})\nWrote ${result.lockPath}\n`,
    );
    return 0;
  }
}
