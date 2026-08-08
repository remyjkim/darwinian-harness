---
sidebar_position: 18
---

# Analyze

`drwn analyze sessions` is the retained Foundry/Analyzer-linked feature for
uploading a session-log archive and printing where to watch the job. It is not
implemented by the ACP serving path, and the auth hard cut did not remove it.

Preview without auth or network:

```bash
drwn analyze sessions --dry-run
```

Upload the newest local archive, or build one inline if none exists:

```bash
drwn analyze sessions
```

Build a fresh archive first:

```bash
drwn analyze sessions --fresh
```

Use an explicit upload artifact:

```bash
drwn analyze sessions --archive /tmp/sessions.tar.gz
```

Wait for the final report and open it:

```bash
drwn analyze sessions --wait --open
```

Emit machine-readable output:

```bash
drwn analyze sessions --wait --json
```

## Configuration

`drwn analyze sessions` requires DAH auth from either `drwn login` or a validated,
non-persistent `DRWN_TOKEN`, plus an explicit `DRWN_ANALYZER_URL` transport.

The analyzer API URL comes from `DRWN_ANALYZER_URL` or `analyzer.apiUrl` in
project/user configuration. The optional frontend URL comes from
`DRWN_ANALYZER_WEB_URL` or `analyzer.webBaseUrl` and is used to compose
`/processing/<jobId>` and `/report/<reportId>` URLs. DAH credentials do not
carry or select the Foundry transport.

```json
{
  "version": 1,
  "analyzer": {
    "apiUrl": "http://localhost:8787",
    "webBaseUrl": "https://foundry.example.com",
    "maxArchiveBytes": 104857600
  },
  "optional": {}
}
```

## Input resolution

The command resolves input in this order:

1. `--archive <path>` uses the explicit `.tar`, `.tar.gz`, or `.tgz` path.
2. `--fresh` builds a new `.tar.gz` with the same discovery rules as `drwn export sessions`.
3. The newest archive under `.agents/drwn/session-log-exports/` is reused when present.
4. If no archive exists, a new inline `.tar.gz` is built and uploaded.

`--dry-run` is non-mutating: it validates an existing archive when selected, or reports that an inline export would be built without creating it.

Source availability and an installed-package help smoke do not prove the
configured Foundry service is reachable or that an upload completed. That live
evidence is recorded by the owning operational issue, not inferred from the
Worker release.

## Related

- [Export](./export) — build upload-ready archives manually
- [Login](./login) — authenticate before uploading
