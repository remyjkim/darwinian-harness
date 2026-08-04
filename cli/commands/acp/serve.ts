// ABOUTME: drwn acp serve — speaks the Agent Client Protocol over stdio as an ACP agent.
// ABOUTME: Owns stdout exclusively for NDJSON protocol frames; every diagnostic goes to stderr.

import { Readable, Writable } from "node:stream";
import { Option } from "clipanion";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import { BaseCommand } from "../base";
import { createAcpAgent } from "../../core/acp/connection";

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
    const app = createAcpAgent(
      {
        newSession: async () => ({ sessionId: `sess_${crypto.randomUUID()}` }),
        prompt: async () => ({ stopReason: "end_turn" }),
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
