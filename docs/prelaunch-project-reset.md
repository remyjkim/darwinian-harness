<!-- ABOUTME: Runbook for deliberately resetting prototype project state before the first supported drwn contract. -->
<!-- ABOUTME: Preserves authored Card sources while replacing unsupported intent, lock, and generated projections. -->

# Prelaunch Project Reset

This is a controlled prelaunch reset. There is no automated migration from prototype project config, lock, generated state, commands, or options into the first supported contract.

## Preserve First

Before removing project state:

1. Commit or copy every editable Card source repository.
2. Publish immutable versions of Cards needed by the target Blueprint.
3. Record the non-secret project declaration and resolved Card refs for audit purposes.
4. Confirm credentials are stored outside the project. Never include `.env`, OAuth tokens, API keys, or `credentials.json` in the snapshot.

Do not remove ordinary Card source repositories, configured catalog checkouts,
published Card repositories, or unrelated machine inventory. If a legacy
`~/.agents/drwn/sources/` tree exists, inventory it separately; this project
reset does not authorize deleting it.

## Remove Unsupported Project State

From the project root, remove the old project declaration, lock, generated projection, managed downstream files identified by the old write record, and the old write record itself. Back them up only for investigation; the supported CLI will not read them.

The reset targets are project-local paths such as:

```text
.agents/drwn/config.json
.agents/drwn/config.local.json
.agents/drwn/card.lock
.agents/drwn/card.lock.local
.agents/drwn/generated/
.agents/drwn/write-record.json
```

Review downstream `.claude`, `.codex`, `.cursor`, and `.mcp.json` files before removal. Preserve user-owned fields and remove only prior drwn-managed output.

## Initialize And Apply

```bash
drwn init --non-interactive
drwn apply <published-blueprint-ref>
drwn use <blueprint-name> --no-write
drwn write --dry-run
drwn write
```

For multiple alternative roots, pass `--active <root-name>` or `--none` to `drwn apply`.

## Verify

```bash
drwn status --json
drwn doctor --json
```

Confirm:

- config is `drwn.project-config` V1;
- lock is `drwn.project-lock` V1;
- exactly one intended root is selected, or selection is explicitly `null`;
- the lock contains the root followed by the expected ordered Card closure;
- generated state contains one aggregate bundle per root and no member-only bundles;
- project capabilities are declared separately from ambient user-home capabilities;
- no secrets occur in project state;
- the project remains non-Git when it was intentionally non-Git before the reset.

Rollback means restoring the operator-created prototype snapshot and using its matching prototype CLI only for investigation. Do not add compatibility readers to the supported CLI.
