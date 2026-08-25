// ABOUTME: Implements `drwn whoami` from DAH services-audience credentials.
// ABOUTME: Avoids session endpoint calls; identity comes from validated JWT claims.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { readCredentials } from "../../core/auth/credentials";
import { resolveToken } from "../../core/auth/resolve-token";
import { drwnCliProfile } from "../../core/auth/profile";
import { assertJwtAudience } from "../../core/auth/jwt";
import { resolveCredentialsPath } from "../../core/paths";
import type { KeychainBackend } from "../../core/secret-store";

type WhoamiDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  keychainBackend?: KeychainBackend;
};

export class WhoamiCommand extends BaseCommand {
  static override paths = [["whoami"]];

  static testDeps: WhoamiDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Print the current DAH identity.",
    details: `
      Resolves auth from DRWN_TOKEN or ~/.agents/drwn/credentials.json. The token
      must be JWT-shaped and valid for
      the Darwinian services audience.

      Use --json when scripting identity checks.
    `,
    examples: [
      ["Print the signed-in email", "drwn whoami"],
      ["Print JSON identity details", "drwn whoami --json"],
      ["Check an explicit token", "DRWN_TOKEN=... drwn whoami"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const deps = WhoamiCommand.testDeps ?? {};
    const env = deps.env ?? process.env as NonNullable<WhoamiDeps["env"]>;
    const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
    try {
      const profile = drwnCliProfile(env);
      const auth = await resolveToken({
        credentialsPath,
        env,
        fetcher: deps.fetch ?? fetch,
        profile,
        keychainBackend: deps.keychainBackend,
      });
      if (!auth) {
        this.context.stderr.write("Not authenticated. Run `drwn login` first, or set DRWN_TOKEN.\n");
        return 1;
      }
      const claims = assertJwtAudience(auth.token, profile.resource, { requireUnexpired: true });
      const email = typeof claims.email === "string" ? claims.email : auth.credential?.userEmail ?? "";
      if (this.json) {
        const stored = auth.source === "env" ? null : await readCredentials(credentialsPath, deps.keychainBackend);
        const expiresAt = stored?.expiresAt;
        this.context.stdout.write(
          JSON.stringify({
            email,
            user_id: typeof claims.sub === "string" ? claims.sub : undefined,
            issuer: claims.iss,
            audience: claims.aud,
            expires_at: expiresAt,
            source: auth.source,
          }) + "\n",
        );
      } else {
        this.context.stdout.write(`${email || String(claims.sub ?? "unknown")}\n`);
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
