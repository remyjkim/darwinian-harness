// ABOUTME: Defines the top-level organization management command group.
// ABOUTME: The group help is static and performs no profile, custody, state, or network work.

import { BaseCommand } from "../base";

const DETAILS = [
  "Organizations scope Deployed Worker management. Selection is local UX context, not authorization.",
  "",
  "Available commands:",
  "  drwn org list [--limit 1-100] [--cursor <opaque>]",
  "  drwn org use <organizationId>",
].join("\n");

export class OrgCommand extends BaseCommand {
  static override paths = [["org"]];
  static override usage = BaseCommand.Usage({
    category: "Organization",
    description: "Discover and select a visible organization.",
    details: DETAILS,
    examples: [["List visible organizations", "drwn org list"], ["Select one organization", "drwn org use org_acme"]],
  });
  async execute(): Promise<number> { this.context.stdout.write(`${DETAILS}\n`); return 0; }
}
