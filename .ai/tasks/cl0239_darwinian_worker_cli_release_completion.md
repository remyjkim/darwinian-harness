# ABOUTME: I239 completion record for the Darwinian Worker CLI 1.2.0 release, its immutable published tuple, and the control actually in force at publication.
# ABOUTME: Supplies the downstream handoff consumed by I256 and I238 and states explicitly what this release does not establish.

# [I239] Darwinian Worker CLI 1.2.0 release and operational ACP/Buzz handoff — completion

**Issue:** [I239]
**Owner:** Remy K
**Reviewer:** Remy K (user-authorized owner/reviewer control)
**Repository:** `remyjkim/darwinian-worker`
**Published:** 2026-08-08
**Parent:** I232
**Consumers:** I256 Services runtime/materializer adoption, then I238 governed staging qualification

---

## 1. Outcome

`darwinian@1.2.0` is published, is the `latest` dist-tag, and is byte-identical to the
artifact that was qualified before publication. The published bytes were produced once by a
`main`-only dry run, uploaded as a retained artifact, downloaded by ID in the protected job,
re-verified by digest, and published without repacking.

## 2. Immutable release tuple

| Field | Value |
|---|---|
| `publishedVersion` | `1.2.0` |
| `tagObjectSha` | `d0c3c68edf83d2e6e9f6b6bf5c32887e0ebfe0f2` |
| `peeledCommitSha` | `4aaaef355ffd7f5d4c28beb8aa25859663626358` |
| `tarballSha256` | `4d1f5e541aeca0614c5dd26c8414f303b2a9feeedf90892e395bb6c8755263f6` |
| `registryIntegrity` | `sha512-u3HhMx7T4UWEx0Tpbxyp2AvKlSwuba6od85CC3Tx0Lnww/K9XZZbg0MPINXzb55tVkDE92PKjTZI/ztdXE4CNw==` |
| `registryShasum` | `2e5dc0d1b1a9b3ebd1898649b3afcd10b4744b25` |

Supporting identities:

- dry run `31275056047` attempt 1 produced artifact `9026987670`, archive digest
  `sha256:fa7ac36e356bfb4923ccfa43c0c2d72bc0dc0015ac34cdc6401b2f91021386a0`;
- publication run `31276008481` completed `Validate authorized tag`, `Publish to npm`,
  `Smoke install (macos)` and `GitHub Release`;
- GitHub Release `v1.2.0` targets `4aaaef35`, is neither draft nor prerelease;
- npm carries both the npm publish attestation and SLSA provenance v1.

## 3. Verification performed after publication

Publication was not accepted on the workflow's own report. Independently:

- the registry tarball was downloaded from `registry.npmjs.org` and hashed locally; its
  sha256 equals `tarballSha256` and its sha1 equals `registryShasum`, so the registry holds
  the exact qualified bytes;
- `darwinian@1.2.0` was installed from the public registry into a clean prefix and every
  command was executed with real exit codes:
  `--version` (exactly `1.2.0`), `acp serve --help`, `worker materialize --help`,
  `worker buzz-tools --help`, `worker secret set --help`, `login --help`, `refresh --help`,
  `logout --help`. All passed with genuine help output.

A verification-harness defect was found and corrected during this step and is recorded
because it is the class of error that silently ships a broken release: the first loop
captured the exit status of `head` rather than the command, and this shell is `zsh`, which
does not word-split an unquoted parameter, so a multi-word command string was passed as a
single argument. That produced both a false pass and a false failure. It was caught because
the captured output contradicted the reported status, and the check was rerun with explicit
arguments. The package was never at fault.

## 4. Approval control actually in force

The protected `darwinian-npm-publish` deployment was approved under **credential
separation**, declared in `scripts/release/release-policy.json`:

```json
{ "requiredReviewers": ["mind001-cl"], "preventSelfReview": true, "canAdminsBypass": false,
  "githubEnvironment": "darwinian-npm-publish" }
```

The annotated tag was created and pushed by `remyjkim`. The deployment was approved by
`mind001-cl`. Before approval GitHub independently reported `current_user_can_approve=true`
for `mind001-cl` and `false` for `remyjkim` on that exact run.

**This was not independent second-person review.** Both identities are held by the same
maintainer. Downstream provenance must describe it as credential separation between
operator-controlled identities. What it establishes is that possession of the `remyjkim`
credential alone was insufficient to both authorize and publish.

## 5. Why the approval contract changed

The original design hard-coded a two-person contract naming a second account as sole
required reviewer with self-review prevented. When that reviewer was unavailable, a fully
qualified release was blocked with no in-band remedy: the receipt validator required the
receipt to assert exactly that configuration, so relaxing the GitHub environment would have
made the truthful receipt fail closed inside the protected job.

For a CLI maintained by one operator that is a single point of failure rather than a
control. The approver identity is therefore declared in a checked-in policy file that
`assertGitHubReceipt` validates against, so changing who may approve is a reviewable pull
request rather than a silent divergence between GitHub settings and the repository.

The policy governs approver identity and self-review only. A fixed floor no policy value can
relax remains: a non-empty list of unique named reviewers, `canAdminsBypass` false, the
environment pinned to `darwinian-npm-publish` so the npm trusted-publisher OIDC binding
holds, and the single exact `v1.2.0` tag deployment policy. A declared two-person policy is
still accepted when the readback matches it, which is how the tests prove the validator is
data-driven rather than re-pinned to one outcome.

Accepted risk, documented rather than enforced: with a single declared reviewer and
`preventSelfReview: true`, publication would deadlock if the reviewer identity ever pushed
the tag. It fails closed rather than publishing wrongly and is recoverable by re-pushing the
tag from the release-operator identity.

## 6. Answers supplied to downstream lanes

- **I256 R3 correction:** assert `drwn acp serve --help`, not `drwn acp --help`. Re-confirmed
  against the published artifact: `drwn acp --help` exits 0 but prints a command-ambiguity
  listing rather than help, so asserting only its exit code is near-vacuous.
- **I256 Q1:** `drwn worker materialize --json` is **not** a stable parsing contract. It is a
  bare `JSON.stringify` of the result with no schema identifier and no output
  `contractVersion`, unlike the inbound payload which is strictly version-gated. Its emitted
  digests are already read-back hashes, so parsing adds no integrity over Services hashing
  the same bytes. Services should continue hashing read-back bytes.
- **I256 Z1:** an empty inline `storeExport.bytesBase64` is supported when `--store-export`
  supplies the bytes, but the field must be present as a string; omitting `storeExport` is
  rejected with `WORKER_MATERIALIZE_PAYLOAD_INVALID`.

## 7. Explicit non-claims

This release does not establish, and must not be cited as evidence for:

- Services adoption of `1.2.0` — I256 owns the runtime pin and in-image proof;
- completion of the I236 canonical identity cut;
- any I238 credential, candidate, lease, secret, staging action, or live ACP/Buzz
  qualification;
- Buzz child-environment isolation, which is outside the Worker lane and owned by I257;
- public multi-user or production readiness;
- independent human review of the publication.

## 8. Lane closure

- Pull requests #102, #103, #104, #105 and #106 are merged.
- The pre-amendment publication run `31270673405` was cancelled; it carried the superseded
  validator and could never have accepted a policy-conformant receipt.
- Candidate `9024506382` and tag object `df0d249f` bound the pre-amendment source `50dec42`
  and were superseded when the amendment moved `main`.
- The reviewed evidence is the coordination log
  `darwinian-services/.ai/coordination/080726_i232_i238_alignment.jsonl`, whose event `106`
  carries this tuple to I238 and I256.
