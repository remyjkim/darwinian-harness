// ABOUTME: Implements explicit forced refresh for the sole supported DAH credential payload.
// ABOUTME: Emits a sanitized receipt only for the user-invoked refresh operation.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { deriveCredentialScope } from "../../core/auth/credential-scope";
import { readCredentials, writeCredentials } from "../../core/auth/credentials";
import { drwnCliProfile } from "../../core/auth/profile";
import { createAuthOperationReceipt, serializeAuthOperationReceipt } from "../../core/auth/receipt";
import { refreshStoredCredentialTransaction } from "../../core/auth/resolve-token";
import { loadBuildIdentity } from "../../core/build-identity";
import { resolveCredentialsPath } from "../../core/paths";
import type { KeychainBackend } from "../../core/secret-store";

type RefreshDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  loadBuildIdentity?: typeof loadBuildIdentity;
  deriveCredentialScope?: typeof deriveCredentialScope;
  readCredentials?: typeof readCredentials;
  writeCredentials?: typeof writeCredentials;
  keychainBackend?: KeychainBackend;
};

function diagnosticCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code)) return code;
  }
  return "AUTH_RESPONSE_INVALID";
}

export class RefreshCommand extends BaseCommand {
  static override paths = [["refresh"]];

  static testDeps: RefreshDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Force-refresh the stored DAH credential.",
    details: `
      Reads the v3 credential from ~/.agents/drwn/credentials.json and always performs
      a remote refresh, even when the current access token has not neared expiry.

      DRWN_TOKEN is never refreshed or persisted. Use --json to emit the sanitized
      auth-operation receipt consumed by qualification tooling.
    `,
    examples: [
      ["Refresh stored credentials", "drwn refresh"],
      ["Emit a qualification receipt", "drwn refresh --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit a machine-readable auth-operation receipt.",
  });

  async execute() {
    const deps = RefreshCommand.testDeps ?? {};
    const credentialsPath = resolveCredentialsPath(this.context.agentsDir);

    try {
      const credential = await (deps.readCredentials ?? readCredentials)(credentialsPath, deps.keychainBackend);
      if (!credential) {
        this.context.stderr.write("CREDENTIAL_ABSENT\n");
        return 1;
      }

      const buildIdentity = await (deps.loadBuildIdentity ?? loadBuildIdentity)();
      const credentialScope = await (deps.deriveCredentialScope ?? deriveCredentialScope)(credentialsPath);
      const result = await refreshStoredCredentialTransaction({
        credentialsPath,
        credential,
        profile: drwnCliProfile(deps.env ?? process.env),
        fetcher: deps.fetch ?? fetch,
        now: deps.now,
        writeCredential: deps.writeCredentials ?? writeCredentials,
        keychainBackend: deps.keychainBackend,
      });
      const actionAtMillis = Math.max(
        (deps.now ?? Date.now)(),
        Date.parse(result.credential.issuedAt),
      );
      const receipt = createAuthOperationReceipt({
        buildIdentity,
        qualificationNamespaceDigest: credentialScope.qualificationNamespaceDigest,
        credential: result.credential,
        actionAt: new Date(actionAtMillis).toISOString(),
        operation: {
          action: "refresh",
          mode: "ordinary",
          outcome: result.outcome,
          remote: result.remote,
          local: result.local,
          reason: result.reason,
        },
      });

      if (this.json) {
        this.context.stdout.write(serializeAuthOperationReceipt(receipt));
      } else if (result.outcome === "succeeded") {
        this.context.stdout.write("Credentials refreshed.\n");
      }
      if (result.outcome === "failed") {
        const guidance = result.reason === "CREDENTIAL_WRITE_FAILED"
          ? ": remote credentials may have rotated; run `drwn login` again"
          : "";
        this.context.stderr.write(`${result.reason}${guidance}\n`);
        return 1;
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${diagnosticCode(error)}\n`);
      return 1;
    }
  }
}
