// ABOUTME: Implements drwn worker delete for removing a deployed worker.
// ABOUTME: Requires --force for destructive deletion until interactive confirmation exists.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchWithWorkerAuth } from "../../core/worker-http";

export class WorkerDeleteCommand extends BaseCommand {
  static override paths = [["worker", "delete"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Delete a worker and all of its deployments.",
    details: `
      Sends a destructive delete request for the worker slug, including its
      deployments and aliases. This command requires --force so scripted usage is
      explicit and accidental deletes fail before making a network request.
    `,
    examples: [
      ["Delete a worker", "drwn worker delete harari --force"],
      ["See the safety check", "drwn worker delete harari"],
    ],
  });

  slug = Option.String();

  force = Option.Boolean("--force", false, {
    description: "Skip the confirmation prompt.",
  });

  async execute(): Promise<number> {
    if (!this.force) {
      this.context.stderr.write(`Refusing to delete "${this.slug}" without --force.\n`);
      return 1;
    }
    const { apiBaseUrl } = resolveWorkerConfig();
    try {
      const res = await fetchWithWorkerAuth(this.context, `${apiBaseUrl}/api/minds/${this.slug}`, { method: "DELETE" });
      if (!res.ok) {
        this.context.stderr.write(`Delete failed (${res.status}): ${await res.text()}\n`);
        return 1;
      }
      this.context.stdout.write(`Deleted "${this.slug}".\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }
  }
}
