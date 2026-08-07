// ABOUTME: Drives drwn worker buzz-tools over real stdio and guards MCP-only stdout.
// ABOUTME: Proves the packaged CLI entrypoint exposes only the two delivery tools.

import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

describe("drwn worker buzz-tools", () => {
  test("serves the narrow MCP surface and exits cleanly on stdin EOF", async () => {
    const root = join(import.meta.dir, "..");
    const entrypoint = fileURLToPath(new URL("../cli/index.ts", import.meta.url));
    const bun = Bun.which("bun") ?? process.execPath;
    const proc = Bun.spawn([bun, "run", entrypoint, "worker", "buzz-tools"], {
      cwd: root,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, AGENTS_REPO_ROOT: root },
    });
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    async function frame() {
      while (!buffered.includes("\n")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("buzz-tools stdout closed before response");
        buffered += decoder.decode(value, { stream: true });
      }
      const newline = buffered.indexOf("\n");
      const parsed = JSON.parse(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      return parsed;
    }

    proc.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
      },
    })}\n`);
    await proc.stdin.flush();
    const initialized = await frame();
    expect(initialized.id).toBe(0);
    expect(initialized.result.serverInfo.name).toBe("buzz-tools");

    proc.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    })}\n`);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
    await proc.stdin.flush();
    const tools = await frame();
    expect(tools.id).toBe(1);
    expect(tools.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      "buzz_messages_send",
      "buzz_messages_thread",
    ]);

    await proc.stdin.end();
    expect(await proc.exited).toBe(0);
    expect(buffered).toBe("");
    expect(await new Response(proc.stderr).text()).toBe("");
  });
});
