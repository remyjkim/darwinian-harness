# Docs CI/CD

GitHub Actions pipeline that validates, deploys, and cleans up the docusaurus site (`docs-docusaurus/`) against the Cloudflare Pages project `darwiniantools-docs` at `docs.darwinian.dev`.

Pattern adapted from [analysis 39 — Cloudflare GitHub CI/CD manual](../../.ai/analyses/39_cloudflare-github-cicd-manual.md) (in the sibling `darwinian-harness-services` repo), simplified for a static docs site: no Worker, no Vite-with-API-URL injection, no Playwright E2E, no separate staging tier, no production approval gate.

## Workflows

Three workflows under `.github/workflows/`:

| Workflow | Trigger | Purpose |
|---|---|---|
| `docs-pr-preview.yml` | PR to `main` touching docs paths, fork PRs validate-only | validate (typecheck, docs-readiness tests, docusaurus build, lychee link check) → deploy preview to Pages branch `pr-<N>` → smoke test → PR comment with preview URL |
| `docs-deploy-production.yml` | push to `main` touching docs paths, or `workflow_dispatch` | same validate → deploy to Pages production branch `main` → smoke test both `docs.darwinian.dev` and the per-deployment URL → step summary |
| `docs-pr-cleanup.yml` | PR closed (touching docs paths) | list Pages deployments for the PR alias (non-destructive starter per mentor §13) |

All three skip work for fork PRs (`github.event.pull_request.head.repo.full_name == github.repository`) per mentor §16: Cloudflare tokens are repo secrets and must not be exposed to untrusted forks.

Path filters on `docs-docusaurus/**`, `test/docs-readiness.test.ts`, `test/package-readiness.test.ts`, `.github/workflows/docs-*.yml`, and `lychee.toml` keep CI scoped — pushes that touch only CLI code do not trigger docs workflows.

## Required GitHub secrets and variables

Set these once per repository. The two tokens are separate per mentor §3.4 (production isolation), even though both target the same Pages project.

**Repository secrets** (`gh secret set <NAME>`):

| Name | Value | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN_NONPROD` | Cloudflare API token scoped to `Cloudflare Pages: Edit` for the `darwiniantools-docs` project. Stored locally in `.env`. | `docs-pr-preview.yml`, `docs-pr-cleanup.yml` |
| `CLOUDFLARE_API_TOKEN` | Production-scope Cloudflare API token. Stored locally in `.env`. | `docs-deploy-production.yml` |

**Repository variable** (`gh variable set <NAME>`):

| Name | Value | Used by |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (visible in the dashboard URL, format `https://dash.cloudflare.com/<accountId>/...`). | all three workflows |

Quick setup from a shell with `gh` authenticated:

```bash
# from a checkout with .env populated
set -a; source .env; set +a

gh secret set CLOUDFLARE_API_TOKEN_NONPROD --body "$CLOUDFLARE_API_TOKEN_NONPROD"
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN"
gh variable set CLOUDFLARE_ACCOUNT_ID --body "<your-account-id>"

# verify
gh secret list
gh variable list
```

## Validation steps in detail

The validate job in both `pr-preview` and `deploy-production` runs:

1. `bun install --frozen-lockfile` at repo root (validates lockfile integrity)
2. `bun test test/docs-readiness.test.ts test/package-readiness.test.ts` — enforces docs↔CLI alignment (runs via Bun's runtime, no tsc dependency)
3. `bun install --frozen-lockfile` in `docs-docusaurus/`
4. `bun run typecheck` — docusaurus TypeScript
5. `bun run build` — docusaurus production build
6. `lycheeverse/lychee-action@v2` — internal link check against `docs-docusaurus/build`

Root `tsc --noEmit` on `cli/**` is intentionally **not** in this pipeline — that's the CLI pipeline's responsibility. Keeping CLI-vs-docs CI boundaries clean lets a docs typo fix ship while a CLI refactor is mid-flight.

The PR preview workflow uploads the built site as an artifact and re-downloads it in the deploy job so the deployed artifact is byte-identical to the validated one.

Lychee config lives at `lychee.toml`. It accepts 200-299, 403 (Cloudflare bot challenge), and 999 (LinkedIn challenge), and excludes localhost, GitHub edit URLs, social sign-in walls, and `*.pages.dev` / `*.vercel.app` / `*.workers.dev` preview hosts that rotate too fast to check.

## Deploy mechanics

- `cloudflare/wrangler-action@v3` is the deploy primitive. It returns `deployment-url` (the unique per-deploy URL) and `pages-deployment-alias-url` (the branch-aliased URL like `pr-42.darwiniantools-docs.pages.dev`).
- Preview deploys use `--branch=pr-<N>` so each PR gets a stable alias for review.
- Production deploys use `--branch=main`, which Cloudflare Pages treats as production for the `darwiniantools-docs` project.
- `gitHubToken: ${{ secrets.GITHUB_TOKEN }}` is passed so Cloudflare can associate deployments with GitHub Deployments tab.

## Concurrency, fork PRs, and no production gate

- PR preview: `concurrency.group: docs-pr-preview-<PR>` + `cancel-in-progress: true` — newest PR push wins.
- Production: `concurrency.group: docs-deploy-production` + `cancel-in-progress: false` — serial deploys, no cancellation mid-deploy.
- Fork PRs: validate runs, deploy is skipped via `if: github.event.pull_request.head.repo.full_name == github.repository`. No secret exposure to forks.
- No GitHub environment / required reviewers on production: docs PRs already need code review; a second gate slows typo fixes for no safety benefit. Rollback is `wrangler pages deployment rollback` if a bad deploy ships.

## Branch protection recommendation

Once the pipeline is live, set required status checks on `main`:

```text
docs-pr-preview / validate
docs-pr-preview / deploy preview
```

(Add via `Settings → Branches → Branch protection rules → Require status checks before merging`.)

The mentor manual §15 also recommends "PR approved" and "PR branch up to date" — apply per team policy.

## Local validation parity

The same five-step gate can be run locally before opening a PR:

```bash
bun install
bun run typecheck
bun test test/docs-readiness.test.ts test/package-readiness.test.ts
cd docs-docusaurus
bun install
bun run typecheck
bun run build
```

For lychee parity locally, install lychee (`brew install lychee` or `cargo install lychee`) and run:

```bash
lychee --config lychee.toml --no-progress docs-docusaurus/build
```

## Rollback

Production-only:

```bash
# Identify the previous successful production deploy
bunx wrangler pages deployment list --project-name=darwiniantools-docs

# Roll back (Cloudflare Pages CLI)
bunx wrangler pages deployment rollback <deployment-id> --project-name=darwiniantools-docs
```

Or re-run the previous successful `docs-deploy-production` workflow run from the GitHub Actions UI.

## Operational notes

- The validation checkouts in CLI CI, docs preview, docs production, and release fetch `darwinian-worker-skills/` with `submodules: true`, because readiness tests validate the pinned bundle. Deploy/cleanup jobs that consume an already-built artifact use `submodules: false`.
- Bun version is pinned in workflow `env.BUN_VERSION` for reproducibility. Bump in lockstep with local toolchain.
- Cloudflare Pages project name is centralized in workflow `env.CF_PAGES_PROJECT = darwiniantools-docs`. Single-source for the project identifier.

## Acceptance checklist (adapted from mentor §20)

A docs PR preview is correctly wired when:

```text
Opening a docs PR triggers docs-pr-preview.yml.
validate job runs typecheck + docs-readiness + docusaurus build + lychee.
deploy_preview job deploys to Pages branch pr-<N>.
PR comment shows the preview URL and the branch alias URL.
Smoke test on the preview URL returns 200.
Fork PRs run validate but do not deploy.
Pushing to main runs docs-deploy-production.yml.
Production deploy publishes to docs.darwinian.dev.
Smoke test on docs.darwinian.dev returns 200.
PR cleanup workflow lists Pages deployments for the PR alias on PR close.
CLOUDFLARE_API_TOKEN_NONPROD is unavailable to docs-deploy-production.yml.
CLOUDFLARE_API_TOKEN is unavailable to docs-pr-preview.yml and docs-pr-cleanup.yml.
```

## References

- `.ai/analyses/39_cloudflare-github-cicd-manual.md` (sibling repo) — the mentor manual this adapts from
- `docs-docusaurus/wrangler.toml` — Pages project config (`name = "darwiniantools-docs"`, `pages_build_output_dir = "./build"`)
- `cloudflare/wrangler-action` — https://github.com/cloudflare/wrangler-action
- `lycheeverse/lychee-action` — https://github.com/lycheeverse/lychee-action
