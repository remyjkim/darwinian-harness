// ABOUTME: Implements `drwn card outdated` for project card version checks.
// ABOUTME: Provides a --check mode suitable for CI gates.

import { Option } from "clipanion";
import { loadCardLock } from "../../core/card-lock";
import { findOutdatedProjectCards } from "../../core/card-project";
import { pMap, resolveFetchConcurrency } from "../../core/concurrency";
import * as git from "../../core/git";
import { renderJson, renderTable } from "../../core/output";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "./project-command";

export class CardOutdatedCommand extends BaseCommand {
  static override paths = [["card", "outdated"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Report project cards with newer local versions available.",
    details: `
      Refreshes the project lockfile, compares locked versions to the latest
      local versions, and optionally exits non-zero with --check.
    `,
    examples: [
      ["Show outdated cards", "drwn card outdated"],
      ["Fail when updates are available", "drwn card outdated --check"],
    ],
  });

  check = Option.Boolean("--check", false, {
    description: "Exit non-zero when any project card is outdated.",
  });

  fetch = Option.Boolean("--fetch", false, {
    description: "Fetch Git-origin card remotes before checking.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve project card refs even when trustedSources.strict would reject them.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    if (this.fetch) {
      const lock = await loadCardLock(projectRoot);
      const fetchable = (lock?.cards ?? []).filter((entry) => Boolean(entry.git?.url));
      await pMap(fetchable, resolveFetchConcurrency(), async (entry) => {
        await git.fetch(
          resolveCardBareRepoPath(this.context.agentsDir, entry.name),
          "origin",
          ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*", "+refs/meta/*:refs/meta/*"],
        );
      });
    }
    if (this.allowUntrustedSource) {
      this.context.stderr.write(`Warning: --allow-untrusted-source used for card outdated\n`);
    }
    const outdated = await findOutdatedProjectCards(projectRoot, this.context.agentsDir, {
      allowUntrustedSource: this.allowUntrustedSource,
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    if (this.json) {
      this.context.stdout.write(renderJson({ outdated }));
    } else if (outdated.length === 0) {
      this.context.stdout.write("No outdated cards.\n");
    } else {
      this.context.stdout.write(
        renderTable(
          ["name", "current", "latest"],
          outdated.map((entry) => [
            entry.name,
            entry.current,
            [
              entry.latest,
              ...(entry.hookConsentRequiresRegrant
                ? ["hook consent will require re-grant"]
                : []),
              ...(entry.instructionConsentRequiresRegrant
                ? ["instruction consent will require re-grant"]
                : []),
            ].length > 1
              ? `${entry.latest} (${[
                  ...(entry.hookConsentRequiresRegrant
                    ? ["hook consent will require re-grant"]
                    : []),
                  ...(entry.instructionConsentRequiresRegrant
                    ? ["instruction consent will require re-grant"]
                    : []),
                ].join("; ")})`
              : entry.latest,
          ]),
        ),
      );
    }
    return this.check && outdated.length > 0 ? 1 : 0;
  }
}
