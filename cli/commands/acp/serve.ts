// ABOUTME: drwn acp serve — speaks the Agent Client Protocol over stdio as an ACP agent.
// ABOUTME: Owns stdout exclusively for NDJSON protocol frames; every diagnostic goes to stderr.

import { Readable, Writable } from "node:stream";
import { Option } from "clipanion";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import { BaseCommand } from "../base";
import { authenticateDahDevice } from "../../core/acp/auth";
import { createAcpAgent } from "../../core/acp/connection";
import { AcpSessionManager } from "../../core/acp/session";
import { resolveAcpSlug } from "../../core/acp/worker-binding";
import { resolveWorkerConfig } from "../../core/worker-config";

export class AcpServeCommand extends BaseCommand {
  static override paths = [["acp", "serve"]];

  static override usage = BaseCommand.Usage({
    category: "ACP",
    description: "Serve a deployed Worker as an ACP agent over stdio.",
    details: `
      Speaks Agent Client Protocol (JSON-RPC 2.0, one JSON object per line) on
      stdin/stdout. An ACP client launches this process; stdout carries protocol
      frames only, diagnostics go to stderr, and the process exits when the
      client closes stdin.
    `,
    examples: [
      ["Serve for an editor or buzz-acp", "drwn acp serve harari"],
    ],
  });

  slug = Option.String({ required: false });

  async execute(): Promise<number> {
    let slug: string;
    try {
      slug = await resolveAcpSlug(
        this.context,
        this.slug,
        process.env as Record<string, string | undefined>,
      );
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    const { apiBaseUrl } = resolveWorkerConfig();
    const sessions = new AcpSessionManager({
      context: this.context,
      slug,
      apiBaseUrl,
      env: process.env as Record<string, string | undefined>,
    });
    const app = createAcpAgent(
      {
        authenticate: (params, signal) => authenticateDahDevice(params, {
          agentsDir: this.context.agentsDir,
          env: process.env as Record<string, string | undefined>,
          signal,
          onUserAction: ({ verification_uri_complete, user_code }) => {
            this.context.stderr.write(
              `Darwinian sign-in required. Open ${verification_uri_complete} (code ${user_code}).\n`,
            );
          },
        }),
        newSession: (params) => sessions.newSession(params),
        loadSession: (params, notify, signal) => sessions.loadSession(params, notify, signal),
        prompt: (params, notify, signal) => sessions.prompt(params, notify, signal),
        // I106 owns truthful server-side cancellation. This phase deliberately wires no
        // local fake-cancel behavior; the notification remains a no-op until Phase 4.
        cancel: async () => {},
      },
      { version: this.cli.binaryVersion ?? "0.0.0" },
    );
    const output = Writable.toWeb(this.context.stdout) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(this.context.stdin) as ReadableStream<Uint8Array>;
    const connection = app.connect(ndJsonStream(output, input));
    await connection.closed;
    return 0;
  }
}
