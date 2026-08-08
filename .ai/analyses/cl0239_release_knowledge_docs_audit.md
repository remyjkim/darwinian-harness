# ABOUTME: Audits release-adjacent Worker knowledge and maintainer docs against the I239 implementation.
# ABOUTME: Records the stale token-publication guidance removed before final G3 verification.

# I239 release knowledge-document audit

## Executive summary

The targeted audit covered six release-adjacent knowledge and maintainer
documents against `package.json`, the release/recovery workflows, the release
contract modules, and registered CLI commands. Before correction, one document
was significantly outdated and operationally dangerous: it still prescribed a
local token fallback for publishing the `darwinian` CLI. Two indexes, the
Homebrew checklist, the bundle guide, and the bridge fallback also contained
smaller drift.

After the I239 convergence corrections, five documents are accurate and one is
intentionally deprecated as a clearly labeled historical incident record. No
literal token, password, private key, or hardcoded credential was found.

## Verdicts

| Document | Final verdict | Evidence and disposition |
|---|---|---|
| `.ai/knowledges/README.md` | ACCURATE | The index now labels the npm note historical/superseded and uses the current Darwinian Worker identity. |
| `.ai/knowledges/03_npm-skill-bundles-guide.md` | ACCURATE | Bundle shape, validation, managed-store location, scopes, immutable versions, command paths, and inactive-inventory boundary match `cli/core/skill-packages.ts`, `cli/core/store-paths.ts`, and `cli/commands/machine/skill.ts`. Package naming and the duplicated troubleshooting command were corrected. |
| `.ai/knowledges/04_homebrew-release-checklist.md` | ACCURATE | It now names npm package `darwinian` and sole binary `drwn`, keeps Homebrew future-only, requires the completed exact-artifact release path, and rejects the expiring Actions candidate as a durable formula source. |
| `.ai/knowledges/05_npm-publishing-analysis-and-manual.md` | DEPRECATED | The old executable local-token procedure was removed. The retained note is explicitly a superseded historical incident record that points to the current runbooks and cannot be read as release authority. Keep only for root-cause context; never restore its commands. |
| `docs/maintainers/README.md` | ACCURATE | The publishing description now states the exact-artifact OIDC boundary, and the index names every extant maintainer document. |
| `docs/maintainers/publishing.md` | ACCURATE | The CLI section matches the protected exact-tar workflow and non-publishing recovery. The separately governed bridge fallback now traps temporary files, unsets its symbolic credential, and advances only on a structured exact-version E404; indeterminate registry results stop. |

## Root causes

- The original npm incident response had been promoted from historical evidence
  into standing operator instructions even after trusted publishing replaced it.
- The public npm package and binary identities changed while future-facing and
  internal guides retained the old source-project name and removed binary alias.
- Indexes were not updated as maintainer documents were added.
- Narrative “exact E404” guidance was not encoded in the bridge fallback's
  example commands, leaving its written policy stronger than its executable
  sequence.

These were targeted semantic corrections, not a broad compatibility layer. The
CLI token-publish path is a hard cut.

## Security audit

- No literal credentials or private-key material were present.
- Symbolic environment-variable names and named GitHub/npm policy principals
  are configuration identifiers, not secrets.
- The historical document no longer contains an executable token workflow.
- The bridge-only example removes its temporary npm configuration and captured
  registry output on every shell exit and unsets the bridge credential.
- Nothing in these documents authorizes a release, external-control mutation,
  credential operation, deployment, or I236/I238 live qualification.

## Verification

The corrections are enforced by `test/docs-readiness.test.ts` and
`test/homebrew-readiness.test.ts`, alongside release-readiness documentation
checks. Focused RED evidence showed the stale package/bin identities and missing
hard-cut language; the GREEN gate passed with the updated documents. The full
repository and hosted matrices remain the single consolidated Task 11 gate.
