# I105 Buzz delivery rollout runbook

Status: code-level contract only; no release, secret installation, deployment, or live relay proof has been performed.

## Runtime and Card contract

- Install a Darwinian release satisfying the reference Blueprint's `harness.minVersion: 1.2.0`.
- Install the pinned Buzz `desktop-v0.5.5` binary in the mind-runtime image using the separately reviewed Services Dockerfile checksum.
- Use [`registry/cards/buzz-delivery-worker/card.json`](../../registry/cards/buzz-delivery-worker/card.json) as the reference declaration.
- Keep the MCP server key exactly `buzz-tools`.
- Keep the only governed selectors exactly:
  - `mcp:buzz-tools/buzz_messages_send`
  - `mcp:buzz-tools/buzz_messages_thread`
- Do not substitute `buzz-dev-mcp`, add a wildcard, or grant a governance bypass.

## Secret installation

The command reads one secret from non-interactive stdin and removes one trailing newline. It never accepts secret bytes in argv.

```bash
printf '%s' "$BUZZ_RELAY_URL" | drwn worker secret set <worker-slug> buzz-relay-url --kind env --env-var BUZZ_RELAY_URL
printf '%s' "$BUZZ_PRIVATE_KEY" | drwn worker secret set <worker-slug> buzz-private-key --kind env --env-var BUZZ_PRIVATE_KEY
printf '%s' "$BUZZ_AUTH_TAG" | drwn worker secret set <worker-slug> buzz-auth-tag --kind env --env-var BUZZ_AUTH_TAG
```

`BUZZ_AUTH_TAG` is optional. Do not paste any value into an issue, PR, shell command line, or session transcript. Verify only secret metadata through the authenticated control plane.

## Key-custody profiles

### Same-key default

Store the agent's existing Buzz/Nostr private key. Mentions, presence, reactions, and delivered replies keep one visible identity. This duplicates the key into the per-Worker encrypted secret store and therefore uses the same custody model as Buzz's remote-agent deployment.

### Split-key hardened

Create a dedicated, independently rotatable posting identity. Publish its kind:0 profile and grant it membership once per private channel with `buzz channels add-member`. The ACP-facing agent and the posting identity are visibly different: users mention one member and another member signs the answer. Record that attribution split in operator-facing configuration.

## Additive upstream ACP metadata proposal

Buzz may later add the following optional prompt/session metadata. I105 does not depend on it and does not parse prose into routing authority.

```json
{
  "_meta": {
    "com.block.buzz": {
      "profileVersion": 1,
      "channelId": "<channel-uuid>",
      "threadRootEventId": "<64-hex-event-id>",
      "triggeringEventIds": ["<64-hex-event-id>"],
      "replyMode": "thread"
    }
  }
}
```

## Evidence gates

1. Verify the Worker source revision and selectors against `cl0105_buzz_rollout_evidence.json`.
2. Verify the immutable deployment governance row is present and contains the exact selectors; `missing_row` is a blocker.
3. Verify the Buzz binary checksum and `buzz --version` in the candidate image.
4. Install only secret metadata; never record secret bytes.
5. Run one credential-gated ACP two-turn/cancellation proof.
6. Run one live channel delivery and one threaded reply, each requiring a correlated non-error tool result.
7. Fill `candidateDeploymentId` only from the real immutable deployment and preserve sanitized timestamps/run IDs.

Until all seven gates pass, product-surface enablement and live-delivery claims remain prohibited.
