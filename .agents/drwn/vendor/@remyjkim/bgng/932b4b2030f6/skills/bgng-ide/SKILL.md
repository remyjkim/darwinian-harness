---
name: bgng-ide
description: Use when managing the BeginningDB IDE control plane with the bgng CLI — installing the beginningdb-cloudfs VSCode extension, creating/connecting IDE profiles, storing or refreshing auth (direct, manual, managed-session, dispatch-session), launching VSCode, or diagnosing profiles. Trigger on "bgng ide", "connect a profile", "ide login", "open VSCode with my profile", "ide doctor", "refresh the IDE token", or any auth/profile work under ~/.bgng/ide/.
---
<!-- ABOUTME: Operating playbook for the bgng IDE control-plane surface (install/connect/login/open/doctor/auth) -->
<!-- ABOUTME: Points agents at the authoritative usage doc; captures the auth strategies and gotchas -->

# bgng — IDE Control Plane

Wraps three concerns: installing the bundled `beginningdb-cloudfs` VSCode extension, managing IDE **profiles** (direct → a BeginningDB instance, or gateway → a gateway worker), and storing/refreshing **auth** material under `~/.bgng/ide/`. The VSCode extension treats `bgng ide … --json` as its canonical control plane — JSON output is load-bearing.

**Authoritative reference (read before deep work):** `.ai/knowledges/02_cli/01_usage_patterns/03_workflow_ide.md`. Per-flag detail: `.ai/knowledges/02_cli/01_usage_patterns/01_command_reference.md`. Resolved-profile shape: `.ai/knowledges/02_cli/00_design/03_service_topology.md`.

## Lifecycle, condensed
```bash
bgng ide install                                 # one-time per workstation (update = alias; repair = reinstall-if-missing)
bgng ide connect --mode … --id X --label … …     # one-time per profile (--verify probes before saving)
bgng ide login --profile X …                      # establish auth — flag combo selects strategy (see below)
bgng ide open --profile X --workspace "$HOME/work/proj"   # writes runtime.json, launches stock VSCode (macOS)
bgng ide auth refresh --profile X [--verify]      # re-mint tokens (extension calls this as they expire)
bgng ide doctor [--json]                          # per-profile connectivity + auth diagnostics
bgng ide auth clear --profile X                   # delete auth material (profile stays)
bgng ide profiles remove X                        # delete the profile (auth not auto-cleared)
```

## Connect — two profile modes
```bash
# Direct (talks straight to BeginningDB). pathPrefix auto = /.bgdb-vfs/filesystems/<fsid>
bgng ide connect --mode beginningdb.direct --id local-dev --label "Local (direct)" \
  --base-url http://127.0.0.1:8080 --tenant-id 1 --filesystem-id main

# Gateway (talks to a gateway worker). pathPrefix is always /
bgng ide connect --mode iminds.gateway --id staging --label "Staging (gateway)" \
  --gateway-url https://gw.example.com --filesystem-id main
```
Re-connecting with the same `--id` **replaces** the entry (no merge). `--verify` failure means the profile is not saved.

## Login — the flag combo picks the auth strategy
| Flags | Strategy |
|---|---|
| `--token` on a **direct** profile | direct bearer → `secrets.json` |
| `--token` on a **gateway** profile | gateway manual-token (no refresh; re-login to rotate) |
| `--gateway-access-token` + `--gateway-refresh-token` | managed-session (gateway-worker-mediated refresh) |
| `--hub-base-url` + `--dispatch-url` + `--tenant-id` + `--account-id` + `--hub-access-token` + `--hub-refresh-token` | dispatch-session (Hub + dispatch-mediated refresh) |

Default scopes if `--scopes` omitted: `vfs:content:read,vfs:content:write,vfs:metadata:read,vfs:paths:read,vfs:paths:write`.

## Gotchas
- **Three storage strategies, two resolved kinds:** both `dispatch-session` and `managed-session` resolve to `auth.sessionKind: 'managed-session'`. The resolved shape won't tell you which dispatch flavor produced it — read the stored `GatewaySessionRecord` if you need that.
- `bgng ide profiles resolve <id> --json` is the exact contract the VSCode extension parses (`IDE_CONTROL_PLANE_CONTRACT_VERSION = 1`). A version mismatch throws `control-plane-incompatible`.
- macOS-only VSCode path resolution today (`/Applications/...` or `~/Applications/...`; override with `BGNG_IDE_VSCODE_APP`).
- `auth refresh` on a manual-token or direct profile is a **no-op** — those have no refresh material.
- `secrets.json` is **plain text**. Treat `~/.bgng/ide/` as sensitive.
- Env overrides: `BGNG_IDE_VSCODE_EXTENSIONS_DIR`, `BGNG_IDE_VSIX_PATH`, `BGNG_IDE_VSCODE_APP`.

## Exit codes
`0` success, `1` for every typed error. Use `--json` to get structured diagnostics for branching.
