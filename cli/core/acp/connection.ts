// ABOUTME: Builds the ACP agent app for drwn acp serve: version negotiation, capability
// ABOUTME: declaration, and wiring of session hooks onto @agentclientprotocol/sdk handlers.

import {
  agent,
  type AgentApp,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type CancelNotification,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { DAH_DEVICE_AUTH_METHOD } from "./auth";

export type SendSessionUpdate = (notification: SessionNotification) => Promise<unknown>;

/** Session behavior the connection layer delegates to; nothing below this seam knows ACP. */
export interface AcpAgentHooks {
  authenticate(params: AuthenticateRequest, signal: AbortSignal): Promise<AuthenticateResponse>;
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  loadSession(
    params: LoadSessionRequest,
    notify: SendSessionUpdate,
    signal: AbortSignal,
  ): Promise<LoadSessionResponse>;
  prompt(params: PromptRequest, notify: SendSessionUpdate, signal: AbortSignal): Promise<PromptResponse>;
  cancel(params: CancelNotification): Promise<void>;
}

export interface AcpAgentOptions {
  /** CLI version reported in agentInfo; serve supplies the package.json version. */
  version?: string;
  /** Receives the validated initialize request for client-profile selection. */
  onInitialize?: (params: Record<string, unknown>) => void;
}

// Buzz requests protocolVersion 2 as a private feature flag; answering the stable 1 is
// spec-correct and routes Buzz onto its [Base]-prefix path, which works (cl0105 §2).
const NEGOTIATED_PROTOCOL_VERSION = 1;

export function createAcpAgent(hooks: AcpAgentHooks, options?: AcpAgentOptions): AgentApp {
  return agent()
    .onRequest("initialize", (ctx) => {
      options?.onInitialize?.(ctx.params as unknown as Record<string, unknown>);
      return {
        protocolVersion: NEGOTIATED_PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
        },
        authMethods: [DAH_DEVICE_AUTH_METHOD],
        agentInfo: { name: "drwn-acp", version: options?.version ?? "0.0.0" },
      };
    })
    .onRequest("authenticate", (ctx) => hooks.authenticate(ctx.params, ctx.signal))
    .onRequest("session/new", (ctx) => hooks.newSession(ctx.params))
    .onRequest("session/load", (ctx) =>
      hooks.loadSession(
        ctx.params,
        (notification) => ctx.client.notify("session/update", notification),
        ctx.signal,
      ))
    .onRequest("session/prompt", (ctx) =>
      hooks.prompt(
        ctx.params,
        (notification) => ctx.client.notify("session/update", notification),
        ctx.signal,
      ))
    .onNotification("session/cancel", (ctx) => hooks.cancel(ctx.params));
}
