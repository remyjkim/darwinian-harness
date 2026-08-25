// ABOUTME: Implements ordinary local-containment and strict confirmed-revoke logout modes.
// ABOUTME: Emits sanitized receipts only after safe v3 credential identity is established.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { deriveCredentialScope } from "../../core/auth/credential-scope";
import { deleteCredentials, readCredentials } from "../../core/auth/credentials";
import { revokeToken, type RevokeTokenResult } from "../../core/auth/device-flow";
import { drwnCliProfile } from "../../core/auth/profile";
import { createAuthOperationReceipt, serializeAuthOperationReceipt } from "../../core/auth/receipt";
import { loadBuildIdentity } from "../../core/build-identity";
import { resolveCredentialsPath } from "../../core/paths";
import type { KeychainBackend } from "../../core/secret-store";

type LogoutDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  readCredentials?: typeof readCredentials;
  deleteCredentials?: typeof deleteCredentials;
  deriveCredentialScope?: typeof deriveCredentialScope;
  loadBuildIdentity?: typeof loadBuildIdentity;
  keychainBackend?: KeychainBackend;
};

type LogoutRemoteState = { action: "revoke" } & (
  | RevokeTokenResult
  | {
      result: "not_applicable";
      httpClass: "not_applicable";
      reason: "CREDENTIAL_PROFILE_MISMATCH";
    }
);

function diagnosticCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code)) return code;
  }
  return "CREDENTIAL_DELETE_FAILED";
}

export class LogoutCommand extends BaseCommand {
  static override paths = [["logout"]];

  static testDeps: LogoutDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Revoke the DAH refresh token and remove scoped local credentials.",
    details: `
      Ordinary logout attempts remote refresh-token revocation and then removes the
      selected local credential scope even when the remote result is rejected or
      indeterminate. Use --require-remote-revoke to preserve local custody unless
      DAH first confirms revocation with a 2xx response.

      The revoke contract covers the refresh token. It does not claim that access
      tokens already issued by the server are invalidated. Use --json for the exact
      sanitized auth-operation receipt.
    `,
    examples: [
      ["Contain locally even if remote revoke degrades", "drwn logout"],
      ["Require confirmed revoke before deletion", "drwn logout --json --require-remote-revoke"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit a machine-readable auth-operation receipt.",
  });

  requireRemoteRevoke = Option.Boolean("--require-remote-revoke", false, {
    description: "Delete local custody only after confirmed remote revoke.",
  });

  async execute() {
    const deps = LogoutCommand.testDeps ?? {};
    const credentialsPath = resolveCredentialsPath(this.context.agentsDir);

    try {
      const credential = await (deps.readCredentials ?? readCredentials)(credentialsPath, deps.keychainBackend);
      if (!credential) {
        if (this.requireRemoteRevoke) {
          this.context.stderr.write("CREDENTIAL_ABSENT\n");
          return 1;
        }
        this.context.stdout.write("Not logged in.\n");
        return 0;
      }

      const profile = drwnCliProfile(deps.env ?? process.env);
      const buildIdentity = this.json
        ? await (deps.loadBuildIdentity ?? loadBuildIdentity)()
        : null;
      const credentialScope = this.json || this.requireRemoteRevoke
        ? await (deps.deriveCredentialScope ?? deriveCredentialScope)(credentialsPath)
        : null;
      const profileMatches = credential.issuer === profile.issuer &&
        credential.clientId === profile.clientId &&
        credential.resource === profile.resource;
      const remote: LogoutRemoteState = profileMatches
        ? { action: "revoke", ...await revokeToken(profile, credential.refreshToken, deps.fetch ?? fetch) }
        : {
            action: "revoke",
            result: "not_applicable",
            httpClass: "not_applicable",
            reason: "CREDENTIAL_PROFILE_MISMATCH",
          };

      const shouldDelete = !this.requireRemoteRevoke || remote.result === "confirmed";
      let local: {
        action: "delete";
        result: "confirmed" | "not_performed" | "failed";
        afterConfirmedRemoteRevoke: boolean;
      } = {
        action: "delete",
        result: "not_performed",
        afterConfirmedRemoteRevoke: false,
      };
      if (shouldDelete) {
        try {
          await (deps.deleteCredentials ?? deleteCredentials)(credentialsPath, deps.keychainBackend);
          local = {
            action: "delete",
            result: "confirmed",
            afterConfirmedRemoteRevoke: remote.result === "confirmed",
          };
        } catch {
          local = {
            action: "delete",
            result: "failed",
            afterConfirmedRemoteRevoke: remote.result === "confirmed",
          };
        }
      }

      const outcome = local.result === "failed" ||
          (this.requireRemoteRevoke && remote.result !== "confirmed")
        ? "failed"
        : "succeeded";
      const reason = local.result === "failed" ? "CREDENTIAL_DELETE_FAILED" : remote.reason;

      if (this.json && buildIdentity && credentialScope) {
        const actionAtMillis = Math.max(
          (deps.now ?? Date.now)(),
          Date.parse(credential.issuedAt),
        );
        const receipt = createAuthOperationReceipt({
          buildIdentity,
          qualificationNamespaceDigest: credentialScope.qualificationNamespaceDigest,
          credential,
          actionAt: new Date(actionAtMillis).toISOString(),
          operation: {
            action: "logout",
            mode: this.requireRemoteRevoke ? "require_remote_revoke" : "ordinary",
            outcome,
            remote: {
              action: remote.action,
              result: remote.result,
              httpClass: remote.httpClass,
            },
            local,
            reason,
          },
        });
        this.context.stdout.write(serializeAuthOperationReceipt(receipt));
      }

      if (local.result === "failed") {
        this.context.stderr.write("CREDENTIAL_DELETE_FAILED\n");
        return 1;
      }
      if (this.requireRemoteRevoke && remote.result !== "confirmed") {
        this.context.stderr.write(`${remote.reason}\n`);
        return 1;
      }
      if (remote.reason !== null) {
        this.context.stderr.write(`Warning: remote revoke failed (${remote.reason}); local credentials removed.\n`);
      }
      if (!this.json) this.context.stdout.write("Logged out. Credentials removed.\n");
      return 0;
    } catch (error) {
      this.context.stderr.write(`${diagnosticCode(error)}\n`);
      return 1;
    }
  }
}
