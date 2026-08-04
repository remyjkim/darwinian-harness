// ABOUTME: Builds the ACP agent app for drwn acp serve: version negotiation, capability
// ABOUTME: declaration, and wiring of session hooks onto @agentclientprotocol/sdk handlers.

import {
  agent,
  type AgentApp,
  type CancelNotification,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
} from "@agentclientprotocol/sdk";

/** Session behavior the connection layer delegates to; nothing below this seam knows ACP. */
export interface AcpAgentHooks {
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  prompt(params: PromptRequest): Promise<PromptResponse>;
  cancel(params: CancelNotification): Promise<void>;
}

export interface AcpAgentOptions {
  /** CLI version reported in agentInfo; serve supplies the package.json version. */
  version?: string;
}

// Buzz requests protocolVersion 2 as a private feature flag; answering the stable 1 is
// spec-correct and routes Buzz onto its [Base]-prefix path, which works (cl0105 §2).
const NEGOTIATED_PROTOCOL_VERSION = 1;

export function createAcpAgent(hooks: AcpAgentHooks, options?: AcpAgentOptions): AgentApp {
  return agent()
    .onRequest("initialize", () => ({
      protocolVersion: NEGOTIATED_PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
      },
      authMethods: [],
      agentInfo: { name: "drwn-acp", version: options?.version ?? "0.0.0" },
    }))
    .onRequest("session/new", (ctx) => hooks.newSession(ctx.params))
    .onRequest("session/prompt", (ctx) => hooks.prompt(ctx.params))
    .onNotification("session/cancel", (ctx) => hooks.cancel(ctx.params));
}
