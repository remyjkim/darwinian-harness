// ABOUTME: Verifies organization visibility before persisting one profile-isolated UX selection.
// ABOUTME: A refused or malformed readback never changes the current local selection.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { resolveCloudProfile } from "../../core/management/profile";
import {
  renderManagementCommandFailure,
  renderOrganizationResultHuman,
  useOrganization,
  type ManagementReadDependencies,
} from "../../core/management/organizations";
import { renderManagementResultJson } from "../../core/management/results";

type OrgUseDeps = ManagementReadDependencies & { env?: Record<string, string | undefined> };

export class OrgUseCommand extends BaseCommand {
  static override paths = [["org", "use"]];
  static testDeps: OrgUseDeps | undefined;
  static override usage = BaseCommand.Usage({
    category: "Organization",
    description: "Verify and select one visible organization.",
    details: "Calls the exact organization detail route before writing local profile-isolated context.",
    examples: [["Select an organization", "drwn org use org_acme"], ["Select and emit the verified receipt", "drwn org use org_acme --json"]],
  });
  organizationId = Option.String({ required: true });
  json = Option.Boolean("--json", false, { description: "Emit the strict command-result JSON envelope." });

  async execute(): Promise<number> {
    const deps = OrgUseCommand.testDeps ?? {};
    const env = deps.env ?? process.env;
    try {
      const profile = resolveCloudProfile(env);
      const result = await useOrganization({
        credentialsPath: resolveCredentialsPath(this.context.agentsDir), env, keychainBackend: deps.keychainBackend,
        homeDir: this.context.homeDir, profileDigest: profile.profileDigest, organizationId: this.organizationId,
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
