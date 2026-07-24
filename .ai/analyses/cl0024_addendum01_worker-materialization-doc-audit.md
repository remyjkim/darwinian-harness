<!-- ABOUTME: Audits Worker materialization documentation against the implemented CL0024 addendum code. -->
<!-- ABOUTME: Records corrected drift, evidence files, security findings, and remaining external gates. -->

# CL0024 Addendum 01 — Worker Materialization Documentation Audit

**Date:** 2026-07-24
**Code base:** `fbcd4089fe4cbea8c4db8cd93c91f1e6262aed7d` plus scoped, uncommitted addendum work

## Executive summary

Twelve Worker documentation surfaces were checked against
`cli/commands/install.ts`, `cli/core/org-worker-{bundle-v1,compatibility,artifact-snapshot,materializer}.ts`,
`cli/core/worker-materialization-receipt.ts`, and
`cli/core/diagnostics.ts`.

The audit initially found nine partially outdated, two significantly outdated,
and one accurate surface. Targeted updates now align the supported profile,
artifact and consent boundaries, planning semantics, receipts, diagnostics,
repair/removal ownership, rollback, and CI exit behavior. No document was
obsolete or deprecated.

## Verdicts and actions

| Document | Initial verdict | Severity | Action |
|---|---|---:|---|
| `docs/contracts/project-worker-v1.md` | Partially outdated | High | Updated |
| `docs/cli-quickref.md` | Partially outdated | Medium | Updated |
| `docs-docusaurus/docs/reference/cli/install.md` | Partially outdated | High | Updated |
| `docs-docusaurus/docs/reference/cli/status.md` | Partially outdated | Medium | Updated |
| `docs-docusaurus/docs/reference/cli/doctor.md` | Partially outdated | Low | Updated |
| `docs-docusaurus/docs/concepts/diagnostics-model.md` | Partially outdated | Medium | Updated |
| `docs-docusaurus/docs/concepts/worker-instructions.md` | Accurate; missing new limitation | Low | Updated |
| `docs-docusaurus/docs/troubleshooting/reading-doctor.md` | Significantly outdated | High | Updated |
| `docs-docusaurus/docs/guides/doctor-in-ci.md` | Significantly outdated | High | Updated |
| `docs-docusaurus/docs/troubleshooting/common-drift.md` | Partially outdated | Medium | Updated |
| `docs-docusaurus/docs/troubleshooting/ownership-conflicts.md` | Accurate; targeted addition useful | Low | Updated |
| `CHANGELOG.md` | Missing addendum features | Medium | Updated |

## Root causes corrected

- The earlier docs described only validation of an already initialized project;
  the implementation now supports fresh immutable materialization.
- Ordinary `install --frozen` and organization-handoff `--frozen` have
  different lock semantics.
- Planning modes validate/derive a plan but do not prove reconcile/remove
  ownership feasibility.
- The supported snapshot contains both Worker-root and Card artifacts with
  exact content/integrity/Git identities.
- Bundle hook consent is intentionally unsupported in V1.
- Removal is conditional: bytes required by unrelated retained state survive.
- `compatible` is reserved in the status type but not emitted by V1.
- Doctor's exit code is narrower than “any report item is unhealthy.”
- Outer packet identity is a release-manifest concern, not a fabricated Worker
  CLI result.

## Security scan

No hardcoded credentials, access tokens, private keys, passwords, or instruction
content were added to diagnostics or receipts. Documentation examples use only
placeholder identities. Materialization output remains bounded and excludes
local evidence paths, secrets, and readiness claims.

## Remaining external gates

The frozen Org packet `organization-provisioning-v1@1.0.1` and its Node contract
suite are reported green by the Task 48 owner. Live deployment, paid provider
calls, authorization rollout, and organization readiness remain separately
governed and are not implied by this documentation audit.
