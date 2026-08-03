// ABOUTME: Implements drwn card fork for copying a source into a new scope.
// ABOUTME: Leaves the original source untouched.

import { Option } from "clipanion";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readCardSourceManifest } from "../../core/card-store";
import { BaseCommand } from "../base";
import { resolveCommandCardSource } from "./source-input";

export class CardForkCommand extends BaseCommand {
  static override paths = [["card", "fork"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Fork a card source into a new scope or org monorepo.",
    details: `
      Copies an editable card source into a new scope or org monorepo directory,
      rewriting card.json to the target name. The original source is untouched.
    `,
    examples: [["Fork to your scope", "drwn card fork @team/backend --scope @you"]],
  });

  sourceName = Option.String({ required: true });
  scope = Option.String("--scope", { description: "Target scope, e.g. @you" });
  into = Option.String("--into", { description: "Org monorepo directory to copy into." });

  async execute() {
    const source = await resolveCommandCardSource(this.context, { input: this.sourceName });
    const manifest = await readCardSourceManifest(source.sourceDir);
    const [, baseName] = manifest.name.includes("/") ? manifest.name.split("/") : ["", manifest.name];
    const targetScope = this.scope ?? manifest.name.split("/")[0]!;
    const targetName = `${targetScope}/${baseName}`;
    const targetDir = join(this.into ?? this.context.cwd, baseName!);
    await mkdir(this.into ?? this.context.cwd, { recursive: true });
    await cp(source.sourceDir, targetDir, { recursive: true, force: true });
    const { readFile, writeFile } = await import("node:fs/promises");
    const cardPath = join(targetDir, "card.json");
    const next = JSON.parse(await readFile(cardPath, "utf8"));
    next.name = targetName;
    await writeFile(cardPath, `${JSON.stringify(next, null, 2)}\n`);
    this.context.stdout.write(`Forked ${manifest.name} -> ${targetName} at ${targetDir}\n`);
    return 0;
  }
}
