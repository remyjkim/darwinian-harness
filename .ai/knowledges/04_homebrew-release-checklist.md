# ABOUTME: Future-facing checklist for Homebrew formula distribution of the drwn CLI.
# ABOUTME: Covers naming, formula structure, tap setup, and post-publish verification steps.

# Homebrew Release Checklist

This checklist is future-facing. Homebrew distribution is not implemented yet, but the release path should be defined before starting formula work.

## Naming

- package name finalization
- current npm package: `darwinian`
- current CLI binary: `drwn`; there is no secondary binary alias
- finalize the future formula and tap names without changing the npm identity
- ensure there is no naming collision with existing formulae or packages

## Release Artifact

- consume only a completed, annotated tagged release whose npm bytes have
  passed the exact-artifact I239 verification sequence
- define the canonical source tarball/archive format
- source tarball expectations
- ensure the archive contains the expected runnable CLI entrypoint
- confirm release asset stability and checksums
- do not use the 14-day release-candidate Actions artifact as a durable
  Homebrew source

## Installation Strategy

- decide whether Homebrew installs:
  - source-only via Bun (requires Bun as a dependency)
  - bundled script/runtime wrapper
  - prebuilt release artifact
  - npm-installed global package (currently requires Bun 1.2+ and npm)
- binary install strategy
- document runtime dependency expectations for end users (Bun for both the current published package and development)

## Formula Hosting

- decide where the formula lives:
  - core tap not expected
  - custom tap likely
- formula location and hosting decision
- decide repository ownership for the tap
- document tap installation instructions

## macOS Architecture

- macOS architecture considerations
- confirm support expectations for Apple Silicon
- confirm support expectations for Intel macOS if desired
- ensure no architecture-specific path assumptions remain

## Post-Install Validation

post-install smoke tests:

After a future Homebrew install, verify in an isolated disposable home/project:

- `drwn --help`
- `drwn status --json`
- `drwn doctor --json`
- `drwn init --force`
- `drwn write --dry-run`
- `drwn scan --json` (currently a planned-surface placeholder; confirms the binary is reachable and JSON output renders)
- `drwn machine skill list --json`
- `drwn machine mcp list --json`
- `drwn machine inventory gc --json` (dry-run)
- `drwn status --machine --json`
- `drwn card list --json`
- `drwn status --explain`

## User Environment Assumptions

- confirm behavior with no pre-existing `~/.agents`
- confirm behavior with existing `~/.agents`
- confirm safe behavior when optional local tools like `markdownify` are absent

## Publish-Adjacent Requirements

- npm package metadata is finalized as `darwinian`
- the candidate version has completed the exact-tar OIDC publication and
  registry-byte verification path in `docs/release-process.md`
- repository metadata finalized
- license finalized
- docs updated to include Homebrew usage once implementation exists

## Explicit Non-Goals For Now

- implementing the formula
- publishing a tap
- claiming Homebrew support in README before the path is actually tested
