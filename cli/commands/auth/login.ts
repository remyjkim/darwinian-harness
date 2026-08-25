// ABOUTME: Implements `drwn login` using DAH's native OAuth device flow.
// ABOUTME: Persists services-audience DAH credentials under ~/.agents/drwn for future commands.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { openBrowser as defaultOpenBrowser } from "../../core/auth/browser";
import { deriveCredentialScope } from "../../core/auth/credential-scope";
import { runDeviceFlow } from "../../core/auth/device-flow";
import { writeCredentials } from "../../core/auth/credentials";
import { drwnCliProfile } from "../../core/auth/profile";
import { createAuthOperationReceipt, serializeAuthOperationReceipt } from "../../core/auth/receipt";
import { loadBuildIdentity } from "../../core/build-identity";
import { resolveCredentialsPath } from "../../core/paths";
import type { KeychainBackend } from "../../core/secret-store";

type LoginDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  randomUUID?: () => string;
  openBrowser?: (url: string) => void;
  loadBuildIdentity?: typeof loadBuildIdentity;
  deriveCredentialScope?: typeof deriveCredentialScope;
  writeCredentials?: typeof writeCredentials;
  keychainBackend?: KeychainBackend;
};

function jsonLoginFailureDiagnostic(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "BUILD_IDENTITY_INVALID" || code === "AUTH_RECEIPT_INVALID") return code;
  }
  if (error instanceof TypeError) return "AUTH_REMOTE_INDETERMINATE";
  const message = error instanceof Error ? error.message : "";
  const status = message.match(/\(([0-9]{3})\)/)?.[1];
  if (status?.startsWith("4")) return "AUTH_REMOTE_REJECTED";
  if (status?.startsWith("3") || status?.startsWith("5")) return "AUTH_REMOTE_INDETERMINATE";
  if (/device_authorization_denied|device_code_expired|access_denied|expired_token/.test(message)) {
    return "AUTH_REMOTE_REJECTED";
  }
  return "AUTH_RESPONSE_INVALID";
}

function openOnEnter(stdin: NodeJS.ReadableStream, open: () => void): (() => void) | undefined {
  const input = stdin as NodeJS.ReadableStream & { isTTY?: boolean };
  if (!input.isTTY) {
    open();
    return undefined;
  }

  const cleanup = () => {
    input.off("data", onData);
    input.pause();
  };
  const onData = () => {
    cleanup();
    open();
  };
  input.once("data", onData);
  input.resume();
  return cleanup;
}

export class LoginCommand extends BaseCommand {
  static override paths = [["login"]];

  static testDeps: LoginDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Authenticate with Darwinian Auth Hub via the device flow.",
    details: `
      Requests a DAH sign-in URL, opens the browser for Google account selection,
      exchanges the approved device session for a services-audience JWT and refresh token, and
      saves credentials to ~/.agents/drwn/credentials.json.

      Set DRWN_DAH_HUB_URL to use a non-production Auth Hub.
    `,
    examples: [
      ["Sign in", "drwn login"],
      ["Use a local Auth Hub", "DRWN_DAH_HUB_URL=http://localhost:8789 drwn login"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const deps = LoginCommand.testDeps ?? {};
    const env = deps.env ?? process.env as LoginDeps["env"];
    const profile = drwnCliProfile(env);
    let cancelOpenOnEnter: (() => void) | undefined;

    try {
      const buildIdentity = await (deps.loadBuildIdentity ?? loadBuildIdentity)();
      const credential = await runDeviceFlow({
        profile,
        fetcher: deps.fetch ?? fetch,
        sleep: deps.sleep,
        now: deps.now,
        randomUUID: deps.randomUUID,
        onUserAction: ({ verification_uri_complete }) => {
          const instructions = [
            "Log in to your Darwinian account:",
            "1. Press Enter to open it in your browser",
            `2. Or open this URL manually: ${verification_uri_complete}`,
            "",
            "Waiting for browser sign-in...",
            "",
          ].join("\n");
          if (this.json) {
            this.context.stderr.write(instructions);
          } else {
            this.context.stdout.write(instructions);
          }
          const open = () => (deps.openBrowser ?? defaultOpenBrowser)(verification_uri_complete);
          cancelOpenOnEnter = openOnEnter(this.context.stdin, open);
        },
      });
      cancelOpenOnEnter?.();
      const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
      const credentialScope = await (deps.deriveCredentialScope ?? deriveCredentialScope)(credentialsPath);
      const actionAtMillis = Math.max(
        (deps.now ?? Date.now)(),
        Date.parse(credential.issuedAt),
      );
      const actionAt = new Date(actionAtMillis).toISOString();
      try {
        await (deps.writeCredentials ?? writeCredentials)(credentialsPath, credential, deps.keychainBackend);
      } catch {
        if (this.json) {
          const receipt = createAuthOperationReceipt({
            buildIdentity,
            qualificationNamespaceDigest: credentialScope.qualificationNamespaceDigest,
            credential,
            actionAt,
            operation: {
              action: "login",
              mode: "ordinary",
              outcome: "failed",
              remote: { action: "token_exchange", result: "confirmed", httpClass: "2xx" },
              local: { action: "write", result: "failed", afterConfirmedRemoteRevoke: false },
              reason: "CREDENTIAL_WRITE_FAILED",
            },
          });
          this.context.stdout.write(serializeAuthOperationReceipt(receipt));
        }
        this.context.stderr.write("CREDENTIAL_WRITE_FAILED\n");
        return 1;
      }
      if (this.json) {
        const receipt = createAuthOperationReceipt({
          buildIdentity,
          qualificationNamespaceDigest: credentialScope.qualificationNamespaceDigest,
          credential,
          actionAt,
          operation: {
            action: "login",
            mode: "ordinary",
            outcome: "succeeded",
            remote: { action: "token_exchange", result: "confirmed", httpClass: "2xx" },
            local: { action: "write", result: "confirmed", afterConfirmedRemoteRevoke: false },
            reason: null,
          },
        });
        this.context.stdout.write(serializeAuthOperationReceipt(receipt));
      } else {
        this.context.stdout.write(`Signed in as ${credential.userEmail || "unknown user"}\n`);
      }
      return 0;
    } catch (error) {
      cancelOpenOnEnter?.();
      const diagnostic = this.json
        ? jsonLoginFailureDiagnostic(error)
        : error instanceof Error ? error.message : String(error);
      this.context.stderr.write(`${diagnostic}\n`);
      return 1;
    }
  }
}
