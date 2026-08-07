// ABOUTME: Captures the ACP client identity and verifies successful Buzz delivery tool calls.
// ABOUTME: Detection is initialize-derived; delivery requires a correlated non-error result.

import type { StreamEntry } from "./project-events";

export interface AcpInitializeMetadata {
  protocolVersion?: unknown;
  clientInfo?: { name?: unknown; version?: unknown };
  [key: string]: unknown;
}

const BUZZ_CLIENT_NAME = "buzz-acp";
const BUZZ_DELIVERY_TOOLS = new Set([
  "buzz_messages_send",
  "buzz_messages_thread",
]);

export interface BuzzClientProfile {
  observeInitialize(params: AcpInitializeMetadata): void;
  isBuzz(): boolean;
}

export function createBuzzClientProfile(): BuzzClientProfile {
  let initialized = false;
  let buzz = false;
  return {
    observeInitialize(params) {
      if (initialized) return;
      initialized = true;
      buzz = params.clientInfo?.name === BUZZ_CLIENT_NAME;
    },
    isBuzz() {
      return buzz;
    },
  };
}

export class BuzzDeliveryTracker {
  private readonly deliveryCalls = new Set<string>();
  private deliveryObserved = false;

  get delivered(): boolean {
    return this.deliveryObserved;
  }

  observe(entry: StreamEntry): void {
    if (entry.v !== 1 || typeof entry.toolCallId !== "string") return;
    if (entry.type === "tool.call") {
      if (typeof entry.toolName === "string" && BUZZ_DELIVERY_TOOLS.has(entry.toolName)) {
        this.deliveryCalls.add(entry.toolCallId);
      }
      return;
    }
    if (entry.type !== "tool.result" || !this.deliveryCalls.delete(entry.toolCallId)) return;
    const result = entry.result && typeof entry.result === "object"
      ? entry.result as Record<string, unknown>
      : null;
    if (result && result.isError !== true) this.deliveryObserved = true;
  }
}
