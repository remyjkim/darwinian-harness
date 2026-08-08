// ABOUTME: Implements `drwn login` using DAH's native OAuth device flow.
// ABOUTME: Persists services-audience DAH credentials under ~/.agents/drwn for future commands.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { openBrowser as defaultOpenBrowser } from "../../core/auth/browser";
import { runDeviceFlow } from "../../core/auth/device-flow";
import { writeCredentials } from "../../core/auth/credentials";
import { drwnCliProfile } from "../../core/auth/profile";
import { resolveCredentialsPath } from "../../core/paths";

type LoginDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  randomUUID?: () => string;
  openBrowser?: (url: string) => void;
};

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
      await writeCredentials(credentialsPath, credential);
      if (this.json) {
        this.context.stdout.write(JSON.stringify({ email: credential.userEmail, expires_at: credential.expiresAt }) + "\n");
      } else {
        this.context.stdout.write(`Signed in as ${credential.userEmail || "unknown user"}\n`);
      }
      return 0;
    } catch (error) {
      cancelOpenOnEnter?.();
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
