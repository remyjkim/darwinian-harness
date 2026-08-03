// ABOUTME: Implements drwn card release as the Stage-B publish pipeline entrypoint.
// ABOUTME: Runs source sync, doctor, bump proposal, and publish when confirmed.

import { Option } from "clipanion";
import { runRelease } from "../../core/release-pipeline";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";
import { resolveCommandCardSource } from "./source-input";

export class CardReleaseCommand extends BaseCommand {
  static override paths = [["card", "release"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Run the card release pipeline for an editable source.",
    details: `
      Runs source sync --check, doctor, version bump proposal, and publish when
      --yes is provided. Doctor failures stop before publish. Remote push and
      catalog publication (Task 68 Phase 10 Step 5) are deferred post-V1.
    `,
    examples: [
      ["Dry-run release", "drwn card release @me/operator"],
      ["Release with bump", "drwn card release @me/operator --bump minor --yes"],
    ],
  });

  name = Option.String({ required: false });
  from = Option.String("--from", { description: "Explicit Card source directory." });
  bump = Option.String("--bump", { description: "major, minor, or patch" });
  yes = Option.Boolean("--yes", false, { description: "Apply bump and publish." });
  json = Option.Boolean("--json", false);

  async execute() {
    const bump = this.bump as "major" | "minor" | "patch" | undefined;
    const source = await resolveCommandCardSource(this.context, { input: this.name, from: this.from });
    const result = await runRelease(this.context.agentsDir, source.sourceDir, { bump, yes: this.yes });
    if (this.json) {
      this.context.stdout.write(renderJson(result));
    } else {
      this.context.stdout.write(
        `${result.steps.map((step) => `${step.ok ? "ok" : "fail"} ${step.step}${step.detail ? `: ${step.detail}` : ""}`).join("\n")}\n`,
      );
      if (result.proposedVersion) {
        this.context.stdout.write(`Proposed version: ${result.proposedVersion}\n`);
      }
    }
    return result.ok ? 0 : 1;
  }
}
