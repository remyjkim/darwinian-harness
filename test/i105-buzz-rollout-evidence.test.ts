// ABOUTME: Locks the I105 rollout evidence schema to its versioned Card and source commit.
// ABOUTME: Candidate deployment remains null until an authorized immutable deployment exists.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const evidencePath = new URL("../.ai/tasks/cl0105_buzz_rollout_evidence.json", import.meta.url);
const cardPath = new URL("../registry/cards/buzz-delivery-worker/card.json", import.meta.url);

describe("I105 Buzz rollout evidence", () => {
  test("matches the authored Card without inventing a live deployment", async () => {
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    expect(evidence).toEqual({
      schemaVersion: 1,
      workerSourceRevision: expect.stringMatching(/^[0-9a-f]{40}$/),
      cardSourcePath: "registry/cards/buzz-delivery-worker/card.json",
      cardMcpServerKey: "buzz-tools",
      authoredSelectors: card.tools.allow,
      candidateDeploymentId: null,
    });
    expect(card.servers[evidence.cardMcpServerKey]).toBeDefined();
  });
});
