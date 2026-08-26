// ABOUTME: Implements bounded organization discovery through the route-keyed management kernel.
// ABOUTME: JSON and human output project the same strict command-result envelope.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import {
  listOrganizations,
  renderManagementCommandFailure,
  renderOrganizationResultHuman,
  type ManagementReadDependencies,
} from "../../core/management/organizations";
import { renderManagementResultJson } from "../../core/management/results";

type OrgListDeps = ManagementReadDependencies & { env?: Record<string, string | undefined> };

export class OrgListCommand extends BaseCommand {
  static override paths = [["org", "list"]];
  static testDeps: OrgListDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Organization",
    description: "List organizations visible to the current DAH identity.",
    details: "Uses the management protocol's bounded, opaque-cursor organization collection.",
    examples: [["List the first page", "drwn org list --limit 50"], ["Continue from a cursor", "drwn org list --cursor opaque-value --json"]],
  });
  limit = Option.String("--limit", { description: "Page size from 1 through 100." });
  cursor = Option.String("--cursor", { description: "Opaque continuation cursor (maximum 512 characters)." });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = OrgListCommand.testDeps ?? {};
    try {
      const result = await listOrganizations({
        credentialsPath: resolveCredentialsPath(this.context.agentsDir),
        env: deps.env ?? process.env,
        keychainBackend: deps.keychainBackend,
        ...(this.limit === undefined ? {} : { limit: Number(this.limit) }),
        ...(this.cursor === undefined ? {} : { cursor: this.cursor }),
      }, deps);
      const output = this.json ? renderManagementResultJson(result) : renderOrganizationResultHuman(result);
      (result.outcome === "succeeded" ? this.context.stdout : this.context.stderr).write(output);
      return result.outcome === "succeeded" ? 0 : 1;
    } catch (error) {
      this.context.stderr.write(renderManagementCommandFailure(error));
      return 1;
    }
  }
}
