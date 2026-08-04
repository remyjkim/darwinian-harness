// ABOUTME: Extracts MCP server definitions declared by locked Cards.
// ABOUTME: Keeps card MCP definitions separate from project activation toggles.

import type { CardLockEntry } from "./card-lock";
import type { CanonicalRegistry, RegistryServer } from "./types";

export interface CardServerDefinition {
  cardName: string;
  cardVersion: string;
  serverName: string;
  server: RegistryServer;
}

export function isRegistryServerDefinition(server: unknown): server is RegistryServer {
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    return false;
  }
  const candidate = server as Partial<RegistryServer>;
  return (
    typeof candidate.description === "string" &&
    (candidate.transport === "stdio" ||
      candidate.transport === "http" ||
      candidate.transport === "sse" ||
      candidate.transport === "platform-provided") &&
    typeof candidate.optional === "boolean"
  );
}

export function collectCardServerDefinitions(lockedCards: CardLockEntry[]): CardServerDefinition[] {
  return lockedCards.flatMap((card) =>
    Object.entries(card.manifest.servers ?? {})
      .filter(([, server]) => isRegistryServerDefinition(server))
      .map(([serverName, server]) => ({
        cardName: card.name,
        cardVersion: card.version,
        serverName,
        server: JSON.parse(JSON.stringify(server)) as RegistryServer,
      })),
  );
}

export function collectEffectiveCardServerDefinitions(
  lockedCards: CardLockEntry[],
): CardServerDefinition[] {
  const byServerName = new Map<string, CardServerDefinition>();
  for (const definition of collectCardServerDefinitions(lockedCards)) {
    byServerName.set(definition.serverName, definition);
  }
  return [...byServerName.values()];
}

export function mergeCardServerDefinitionsIntoRegistry(
  registry: CanonicalRegistry,
  definitions: CardServerDefinition[],
): CanonicalRegistry {
  const next: CanonicalRegistry = JSON.parse(JSON.stringify(registry));
  for (const definition of definitions) {
    next.servers[definition.serverName] = JSON.parse(JSON.stringify(definition.server)) as RegistryServer;
  }
  return next;
}
