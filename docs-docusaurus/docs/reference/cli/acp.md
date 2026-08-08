---
sidebar_position: 13
---

# ACP

`drwn acp serve <slug>` exposes one deployed Worker as an Agent Client Protocol
(ACP) agent over stdio.

```bash
drwn acp serve harari
DRWN_ACP_SLUG=harari drwn acp serve
```

The positional slug wins. Without it, the CLI uses `DRWN_ACP_SLUG`, then one
unambiguous deployed binding. Multiple or absent bindings fail with guidance.

The process speaks JSON-RPC 2.0 as newline-delimited JSON on stdin/stdout.
Stdout is reserved for protocol frames; diagnostics and DAH device-flow
instructions go to stderr. An ACP client owns the process lifetime by opening
and closing stdin.

ACP session creation, loading, prompting, streaming, and cancellation are
bridged to the selected deployed Worker. A cancellation HTTP 202 response means
only that cancellation was accepted or already in progress. It is not terminal
cancellation evidence. The CLI keeps polling until it observes
`agent.cancelled`, a `cancelled` run status, or another terminal state. In other
words, acceptance and terminal cancellation are separate observations.

The implementation includes Buzz-client delivery tracking and a bounded
corrective continuation, but source capability is not live delivery proof.
I236/I238 own separate environment and operational qualification. ACP serving
does not remove or replace the Foundry-linked [`drwn analyze sessions`](./analyze)
upload feature.

`drwn acp serve --help` is a safe installed-package smoke. Starting the server
without `--help` may authenticate and contact the Worker API and is not a
release smoke.

## Related

- [Worker](./worker) — deployed Worker operations and governance status
- [Login](./login) — establish DAH credential custody
- [Analyze](./analyze) — upload session archives to Foundry/Analyzer services
