// ABOUTME: Implements `drwn logout` by revoking the DAH refresh token and removing local credentials.
// ABOUTME: Local credential deletion remains authoritative if the credential is already absent.

import { BaseCommand } from "../base";
import { deleteCredentials, readCredentials } from "../../core/auth/credentials";
import { revokeToken } from "../../core/auth/device-flow";
import { drwnCliProfile } from "../../core/auth/profile";
import { resolveCredentialsPath } from "../../core/paths";

type LogoutDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
};

export class LogoutCommand extends BaseCommand {
  static override paths = [["logout"]];

  static testDeps: LogoutDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Revoke the DAH refresh token and remove local credentials.",
    details: `
      Reads ~/.agents/drwn/credentials.json, revokes the stored DAH refresh
      token, and then removes the local credentials file.

      This command is safe to run when not logged in.
    `,
    examples: [
      ["Log out locally and remotely", "drwn logout"],
      ["Verify after logout", "drwn whoami"],
    ],
  });

  async execute() {
    const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
    const creds = await readCredentials(credentialsPath);
    if (!creds) {
      this.context.stdout.write("Not logged in.\n");
      return 0;
    }

    const deps = LogoutCommand.testDeps ?? {};
    if ("version" in creds) {
      // Server revoke is best-effort: local deletion stays authoritative (I65 Fix 1 / I49 TC-A6).
      try {
        await revokeToken(drwnCliProfile(deps.env ?? process.env), creds.refreshToken, deps.fetch ?? fetch);
      } catch (error) {
        this.context.stderr.write(
          `Warning: remote token revoke failed (${error instanceof Error ? error.message : String(error)}); removing local credentials anyway.\n`,
        );
      }
    }
    await deleteCredentials(credentialsPath);
    this.context.stdout.write("Logged out. Credentials removed.\n");
    return 0;
  }
}
