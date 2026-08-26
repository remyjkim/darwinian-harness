---
sidebar_position: 1
---

# Environment Variables

`drwn` reads the following environment variables. All are optional; documented defaults apply when unset.

## Store and paths

### `AGENTS_HOME_DIR`

Overrides the directory used as the home root for the local store. When unset, `drwn` uses `HOME`, `USERPROFILE`, or `os.homedir()` in that order.

The store lives at `$AGENTS_HOME_DIR/.agents/drwn/` (or `~/.agents/drwn/` by default).

```bash
export AGENTS_HOME_DIR=/mnt/shared-home
drwn status
```

### `AGENTS_REPO_ROOT`

Points `drwn` at a local checkout of `darwinian-worker` as the harness source, instead of the bundled package defaults. Used when developing the CLI or maintaining a fork.

```bash
export AGENTS_REPO_ROOT=/path/to/darwinian-worker
drwn status
```

### `DRWN_STORE_READONLY`

Set to `"1"` or `"true"` to refuse any store mutation. Inspection and dry-run commands (`drwn doctor`, `drwn status`, `drwn write --dry-run`) still work; write operations that would mutate the store exit with an error.

Intended for CI environments where the store should be pre-seeded and not modified:

```bash
export DRWN_STORE_READONLY=1
drwn doctor --json
```

### `DRWN_STORE_SEED_PATH`

Path to a pre-seeded credential archive. When set, `drwn` initializes the credential store from this file before any store operations. Useful for supply-chain-safe CI setups where credentials are injected as a secret file.

## Network and concurrency

### `DRWN_CLOUD_PROFILE`

Selects one complete cloud tuple. The accepted selectors are `production` (the
default), `staging`, and `local`. A tuple contains the API, web and Auth Hub origins,
issuer, audience, OAuth client and requested scope set.

Use the admitted staging tuple without independent endpoint overrides:

```bash
DRWN_CLOUD_PROFILE=staging drwn login
```

### `DRWN_CLOUD_PROFILE_FILE`

Required only when `DRWN_CLOUD_PROFILE=local`. It must be an absolute path to a
bounded, regular, non-symlink JSON file matching the exact local profile schema. All
origins must use HTTPS, and the issuer must match the Auth Hub origin.

The file is rejected for production and staging. Unknown fields, partial tuples and
relative paths fail with `CLOUD_PROFILE_INVALID` before credential access.

```bash
DRWN_CLOUD_PROFILE=local \
DRWN_CLOUD_PROFILE_FILE=/absolute/path/to/drwn-cloud-profile.json \
drwn login
```

Independent endpoint overrides are not compatibility aliases. Select the bundled
production/staging tuple or one reviewed strict local profile instead.

### `DRWN_TOKEN`

Provides a services-audience JWT for headless execution. The CLI validates it against
the selected whole profile before sending it. Deployed Worker management additionally
requires the exact delegation-ready issuer, audience, authorized party, subject, expiry,
and scope claims. The token is never persisted or refreshed.

### `DRWN_POLL_MS`

Overrides the polling interval for worker deployment and run-status operations.

### `DRWN_CHAT_TIMEOUT_MS`

Overrides how long `drwn worker chat` waits for a terminal run state before returning
the run URL and status command.

### `DRWN_FETCH_CONCURRENCY`

Maximum number of concurrent card fetch operations. Defaults to `4`. Values that are not positive integers are ignored and the default applies.

```bash
export DRWN_FETCH_CONCURRENCY=8
drwn install
```

### `DRWN_GIT_TIMEOUT_MS`

Timeout in milliseconds for individual Git operations (clone, fetch, push). Defaults to `30000` (30 seconds). Increase for slow networks or large repositories.

```bash
export DRWN_GIT_TIMEOUT_MS=120000
drwn install
```

## Trust and security

### `DRWN_TRUSTED_SOURCES_STRICT`

Set to `"1"` or `"true"` to activate strict trusted-sources enforcement, regardless of the `trustedSources.strict` value in project or machine config. Any card ref that does not satisfy the allowlist fields will be rejected.

```bash
export DRWN_TRUSTED_SOURCES_STRICT=1
drwn install
```

See [Trusted Sources](../concepts/trusted-sources) for the full policy model.

## See also

- [Trusted Sources](../concepts/trusted-sources) — `DRWN_TRUSTED_SOURCES_STRICT` policy model
- [Run drwn doctor in CI](../guides/doctor-in-ci) — `DRWN_STORE_READONLY` in CI
- [Project Config JSON](../reference/schemas/project-config-json) — project-level config
