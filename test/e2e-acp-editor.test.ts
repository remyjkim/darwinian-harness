// ABOUTME: Credential-gated real Deploy API lifecycle test for ACP start, restart/load, and continuation.
// ABOUTME: Runs only with DRWN_E2E_DEPLOY=1 and a deployed slug; it never substitutes a fake API.

import { expect, test as baseTest } from "bun:test";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AcpSessionManager } from "../cli/core/acp/session";
import { resolveHomeDir } from "../cli/core/home";
import { resolveAgentsDir } from "../cli/core/paths";
import { fetchJsonWithWorkerAuth } from "../cli/core/worker-http";
import { resolveWorkerConfig } from "../cli/core/worker-config";

const enabled = process.env.DRWN_E2E_DEPLOY === "1";
const test = baseTest.skipIf(!enabled);

function projectedText(updates: SessionNotification[]): string {
  return updates.flatMap(({ update }) => {
    if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
      return [update.content.text];
    }
    return [];
  }).join("");
}

test("real Worker survives adapter restart and continues through the same ACP session", async () => {
  const slug = process.env.DRWN_E2E_DEPLOY_SLUG ?? process.env.DRWN_ACP_SLUG;
  if (!slug) {
    throw new Error("DRWN_E2E_DEPLOY=1 requires DRWN_E2E_DEPLOY_SLUG or DRWN_ACP_SLUG");
  }
  const authContext = { agentsDir: resolveAgentsDir(resolveHomeDir()) };
  const stateDir = await mkdtemp(join(tmpdir(), "drwn-acp-e2e-"));
  const { apiBaseUrl } = resolveWorkerConfig();
  const request = (input: string, init?: RequestInit) =>
    fetchJsonWithWorkerAuth<unknown>(authContext, input, init);
  const options = {
    context: { agentsDir: stateDir },
    slug,
    apiBaseUrl,
    request,
    env: process.env as Record<string, string | undefined>,
  };

  try {
    const firstUpdates: SessionNotification[] = [];
    const firstManager = new AcpSessionManager(options);
    const { sessionId } = await firstManager.newSession({ cwd: process.cwd(), mcpServers: [] });
    await firstManager.prompt(
      { sessionId, prompt: [{ type: "text", text: "Reply briefly to confirm ACP turn one." }] },
      async (notification) => firstUpdates.push(notification),
    );
    expect(projectedText(firstUpdates).trim().length).toBeGreaterThan(0);

    const history: SessionNotification[] = [];
    const secondUpdates: SessionNotification[] = [];
    const restartedManager = new AcpSessionManager(options);
    await restartedManager.loadSession(
      { sessionId, cwd: process.cwd(), mcpServers: [] },
      async (notification) => history.push(notification),
    );
    expect(projectedText(history).trim().length).toBeGreaterThan(0);
    await restartedManager.prompt(
      { sessionId, prompt: [{ type: "text", text: "Reply briefly to confirm ACP turn two." }] },
      async (notification) => secondUpdates.push(notification),
    );
    expect(projectedText(secondUpdates).trim().length).toBeGreaterThan(0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}, 180_000);
