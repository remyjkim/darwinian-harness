---
sidebar_position: 11
---

# Minds

Cards can author provider-independent persona, belief, and memory declarations.
Those local content contracts remain part of Worker composition, but Darwinian
1.4.2 selects no persistence backend for a running Worker Mind.

`drwn worker mind` is therefore a deliberate placeholder. It returns
`MIND_BACKEND_UNSELECTED` and performs no filesystem, network, BeginningDB, R2,
S3, or provider discovery. There are no nested provision, status, sync, diff,
checkpoint, doctor, or pool-retirement verbs.

This separation lets Card authors continue composing persona and belief content
without treating a storage provider as deployment or authorization authority.
A future backend requires its own reviewed architecture and command contract.

## Related

- [Beliefs, Personas, and Memory](./beliefs-memories-personas)
- [Worker Mind CLI](../reference/cli/mind)
