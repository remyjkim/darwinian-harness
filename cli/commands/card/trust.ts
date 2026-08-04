// ABOUTME: Implements explicit hook and instruction consent for locked Cards.
// ABOUTME: Records user-reviewed ranges and exact instruction content identity.

import { Option, UsageError } from "clipanion";
import { setCardConsent } from "../../core/card-project";
import { projectConsentScope, type ConsentScope } from "../../core/consent-scope";
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
import { setMachineCardConsent } from "../../core/worker-machine";

export class CardTrustCommand extends BaseCommand {
  static override paths = [["card", "trust"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Trust a locked card for hook or instruction materialization.",
    details: `
      Records explicit consent for hook policies and/or instruction content
      declared by a locked card. Project consent is stored in card.lock;
      --scope machine stores consent in machine.json's embedded Worker lock.
      Consent is scoped to a semver range; instruction consent also pins the
      exact content digest.
    `,
    examples: [
      ["Trust project Card hooks", "drwn card trust @your-handle/backend --hooks"],
      ["Trust machine Card hooks", "drwn card trust @your-handle/backend --hooks --scope machine"],
      ["Trust machine Card instructions", "drwn card trust @your-handle/backend --instructions --scope machine"],
    ],
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

  scope = Option.String("--scope", "project", {
    description: "Consent scope: project or machine.",
  });

  async execute() {
    if (!this.hooks && !this.instructions) {
      throw new UsageError("Specify --hooks and/or --instructions to record consent.");
    }
    if (this.scope !== "project" && this.scope !== "machine") {
      throw new UsageError(`Unsupported consent scope: ${this.scope}. Use project or machine.`);
    }
    let result;
    let consentScope!: ConsentScope;
    try {
      if (this.scope === "machine") {
        result = await setMachineCardConsent(
          this.context.agentsDir,
          this.spec,
          { hooks: this.hooks, instructions: this.instructions },
          this.range,
        );
        consentScope = result.scope;
      } else {
        const projectRoot = requireProjectRoot(this);
        result = await setCardConsent(
          projectRoot,
          this.context.agentsDir,
          this.spec,
          { hooks: this.hooks, instructions: this.instructions },
          this.range,
        );
        consentScope = projectConsentScope(projectRoot);
      }
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    if (this.hooks) {
      const hookPolicyDigest = await computeHookPolicyDigest(result.card, result.card.path);
      await recordHookConsentAck(
        this.context.agentsDir,
        buildHookConsentAckKey({ scope: consentScope, card: result.card, hookPolicyDigest }),
      );
    }
    if (this.instructions) {
      await recordInstructionConsentAck(
        this.context.agentsDir,
        buildInstructionConsentAckKey({ scope: consentScope, card: result.card }),
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
