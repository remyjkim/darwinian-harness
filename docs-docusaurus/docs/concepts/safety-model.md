---
sidebar_position: 11
---

# Safety Model

drwn's safety model is intentionally simple. It treats the operator as the final authority and the tool as a careful executor. There are no implicit fixes, no opportunistic mutations, and no "try to be helpful" rewrites of state the operator did not ask for.

## The six rules

- **Preview first with `--dry-run`.** Every mutating command supports it. The dry run reports the same diffs and managed-path changes the real run would apply.
- **Inspect machine state with `status`.** `drwn status` reads only and surfaces strict V2, the active Worker/lock, closure integrity and consent, target state, inventory, and projection health.
- **Diagnose drift with `doctor` — report-only.** `drwn doctor` enumerates problems (drift, stale symlinks, ownership conflicts, missing generated files) and stops. It never auto-fixes. See [Reading doctor output](../troubleshooting/reading-doctor) for the read-out conventions.
- **Select a Worker explicitly before projecting it.** Adding a skill bundle or MCP record to inventory does not enable it. Machine and project Worker selections are separate from write.
- **Treat package-backed bundles as available content, not automatically exposed behavior.** Installing an npm skills package is conceptually "fetched and verified"; making it visible to your agents is a separate, explicit act.
- **Keep cleanup report-only until a command explicitly supports repair or pruning.** When you encounter detritus (a stale link, a leftover write record), the doctor tells you about it. If a remediation command does not yet exist for that specific finding, the right answer is to clean up manually or open a request — not to grow auto-fix surface area.

## Why it looks this way

Agent harnesses are state-heavy and operator-critical. A skill list, an MCP server set, or a downstream config file is the live behavior of an AI agent on your machine. Implicit mutations to that surface are not bugs in the moment they happen — they are bugs in the moment, days or weeks later, when the operator notices that an agent is behaving differently and cannot reconstruct why.

The safety model trades convenience for legibility. It is more typing. It is more deliberate. In exchange, the answer to "why is my agent doing this?" is always at least partly answerable by reading the configuration files at known paths, with confidence that drwn did not silently move them.

## How it shows up in commands

- `drwn write` honors `--dry-run`. Machine projection refuses every foreign destination even with `--force`; force repairs only prior drwn-owned drift.
- `drwn doctor` exits non-zero when it finds issues so it can gate CI, but it never mutates.
- `drwn machine skill install` and `drwn machine mcp add` make inventory available; a published Card closure selected by `drwn apply --root` activates machine capabilities; `drwn write --root` projects them.
- `DRWN_STORE_READONLY=1` is a global escape hatch: when set, every write under `~/.agents/drwn/` is refused at the chokepoint. Use it in environments where the local store must not be modified at all.

## See also

- [Disciplines](./disciplines) — the six load-bearing commitments that the safety model rests on.
- [Reading doctor output](../troubleshooting/reading-doctor) — what each finding means.
- [Ownership and write records](./ownership-and-write-records) — how drwn knows which downstream files it owns and which it has not touched.
