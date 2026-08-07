// ABOUTME: Configures one deployed Worker secret using stdin-only secret ingestion.
// ABOUTME: Never accepts or renders secret bytes on argv, stdout, stderr, or errors.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";

type SecretKind = "mcp" | "env";

async function readStdin(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

export class WorkerSecretSetCommand extends BaseCommand {
  static override paths = [["worker", "secret", "set"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Set one deployed Worker secret from stdin.",
    details: `
      Reads the secret from non-interactive stdin and sends it to the authenticated
      Worker secret endpoint. Secret bytes are never accepted as an argument or
      rendered in command output. One trailing newline from a pipe is removed.
    `,
    examples: [[
      "Set the Buzz private key",
      "printf '%s' \"$BUZZ_PRIVATE_KEY\" | drwn worker secret set harari buzz-private-key --kind env --env-var BUZZ_PRIVATE_KEY",
    ]],
  });

  slug = Option.String();
  name = Option.String();
  kind = Option.String("--kind", "mcp");
  envVar = Option.String("--env-var", { required: false });

  async execute(): Promise<number> {
    const stdin = this.context.stdin as NodeJS.ReadableStream & { isTTY?: boolean };
    if (stdin.isTTY === true) {
      this.context.stderr.write("Secret input must be piped on stdin; interactive input is disabled.\n");
      return 1;
    }
    if (this.kind !== "mcp" && this.kind !== "env") {
      this.context.stderr.write("--kind must be mcp or env.\n");
      return 1;
    }
    const kind = this.kind as SecretKind;
    if (kind === "env" && !this.envVar) {
      this.context.stderr.write("--env-var is required for --kind env.\n");
      return 1;
    }
    if (kind === "mcp" && this.envVar) {
      this.context.stderr.write("--env-var is only valid for --kind env.\n");
      return 1;
    }
    const token = await readStdin(stdin);
    if (token.trim().length === 0) {
      this.context.stderr.write("Secret input must be non-empty.\n");
      return 1;
    }

    const { apiBaseUrl } = resolveWorkerConfig();
    try {
      const { response } = await fetchJsonWithWorkerAuth<unknown>(
        this.context,
        `${apiBaseUrl}/api/minds/${encodeURIComponent(this.slug)}/secrets/${encodeURIComponent(this.name)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            kind,
            ...(kind === "env" ? { env_var: this.envVar } : {}),
          }),
        },
      );
      if (!response.ok) {
        this.context.stderr.write(`Secret update failed (${response.status}).\n`);
        return 1;
      }
      this.context.stdout.write(
        kind === "env"
          ? `Configured env secret ${this.envVar} for worker ${this.slug}.\n`
          : `Configured MCP secret ${this.name} for worker ${this.slug}.\n`,
      );
      return 0;
    } catch {
      this.context.stderr.write("Secret update failed before the server acknowledged it.\n");
      return 1;
    }
  }
}
