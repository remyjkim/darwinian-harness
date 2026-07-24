# Contributing

## Cloning

Clone with submodules so the `darwinian-worker-skills/` working tree is populated:

```bash
git clone --recurse-submodules https://github.com/remyjkim/darwinian-worker.git
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

See [`docs/maintainers/skills-repo-submodule.md`](./docs/maintainers/skills-repo-submodule.md) for the submodule reference (bumping the pin, shallow-clone rationale, CI considerations).

## Setup

This repo is **bun-only** (see `engines.bun` and `packageManager` in `package.json`; CI pins `BUN_VERSION`). Do not run `pnpm`, `npm`, or `yarn` — they generate a second lockfile that drifts from `bun.lock`. Alternative lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) are gitignored.

Install dependencies:

```bash
bun install
```

## Verification

Run tests:

```bash
bun test
```

Run typecheck:

```bash
bun run typecheck
```

The current typecheck workflow may exclude the pre-existing `skills/shared/systematic-debugging/condition-based-waiting-example.ts` example errors during hardening work. Do not introduce new TypeScript errors outside that file.

## Development Notes

- Preserve the `ABOUTME` two-line header on every new `.ts` file.
- Keep `sync-mcp.ts` compatible as a wrapper over the shared core modules.
- Use the existing temp-directory fixture pattern in tests. Do not test against the real home directory.
- Prefer adding behavior behind tests first. This repo uses strict TDD expectations.

## Pull Requests

- Keep changes scoped and reviewable.
- Update tests when behavior changes.
- Update docs when command surfaces or safety semantics change.
- Do not make destructive cleanup behavior the default without explicit design approval.

## Documentation

Use the docs by audience:

- `README.md` for public onboarding and normal usage
- `CONTRIBUTING.md` for contributor workflow
- `docs/maintainers/` for release and operational runbooks

If a document is too specialized for the README quickstart, it should usually move into `docs/maintainers/`.
