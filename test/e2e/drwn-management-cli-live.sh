#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=test/e2e/lib/assertions.sh
source "$SCRIPT_DIR/lib/assertions.sh"

: "${DRWN_E2E_BIN:?DRWN_E2E_BIN must select the installed candidate shim}"
: "${DRWN_STAGING_IDENTITY_MANIFEST_FILE:?Services must issue the staging identity manifest}"
: "${DRWN_LIVE_RECEIPT_DIR:?A redacted receipt directory is required}"
[[ "${DRWN_CLOUD_PROFILE:-}" == "staging" ]] || fail "DRWN_CLOUD_PROFILE=staging is required"
[[ -f "$DRWN_STAGING_IDENTITY_MANIFEST_FILE" ]] || fail "staging identity manifest is unavailable"
command -v jq >/dev/null || fail "jq is required for the live journey"

LIVE_ROOT_RAW="$(mktemp -d "${TMPDIR:-/tmp}/drwn-management-live.XXXXXX")"
LIVE_ROOT="$(cd "$LIVE_ROOT_RAW" && pwd -P)"
cleanup() {
  local status=$?
  rm -rf -- "$LIVE_ROOT"
  return "$status"
}
trap cleanup EXIT INT TERM

ORGANIZATION_ID="$(jq -er '.organizationId' "$DRWN_STAGING_IDENTITY_MANIFEST_FILE")"
WORKER_NAME="$(jq -er '.workerName' "$DRWN_STAGING_IDENTITY_MANIFEST_FILE")"
CARD_REF="$(jq -er '.cardRef' "$DRWN_STAGING_IDENTITY_MANIFEST_FILE")"
export HOME="$LIVE_ROOT/home"
export AGENTS_DIR="$LIVE_ROOT/agents"
mkdir -p "$HOME" "$AGENTS_DIR" "$LIVE_ROOT/project" "$DRWN_LIVE_RECEIPT_DIR"

run_drwn() { "$DRWN_E2E_BIN" "$@"; }
cd "$LIVE_ROOT/project"
mkdir -p .agents/drwn
cat >.agents/drwn/config.json <<'JSON'
{"schema":"drwn.project-config","schemaVersion":1,"workers":[],"activeWorker":null}
JSON
run_drwn add "$CARD_REF" --write >/dev/null
run_drwn org use "$ORGANIZATION_ID" --json >"$DRWN_LIVE_RECEIPT_DIR/org-use.json"
run_drwn worker register --organization "$ORGANIZATION_ID" --name "$WORKER_NAME" --environment staging --json \
  >"$DRWN_LIVE_RECEIPT_DIR/register.json"
run_drwn worker deploy "$CARD_REF" --json >"$DRWN_LIVE_RECEIPT_DIR/deploy-one.json"
run_drwn worker deploy "$CARD_REF" --json >"$DRWN_LIVE_RECEIPT_DIR/deploy-two.json"
DEPLOYMENT_ID="$(jq -er '.data.deploymentId' "$DRWN_LIVE_RECEIPT_DIR/deploy-one.json")"
run_drwn worker rollback --to "$DEPLOYMENT_ID" --json >"$DRWN_LIVE_RECEIPT_DIR/rollback.json"
printf '%s' "${DRWN_LIVE_SECRET_VALUE:?live secret must come from secret authority}" |
  run_drwn worker secret set DRWN_I336_E2E_SECRET --json >"$DRWN_LIVE_RECEIPT_DIR/secret.json"
run_drwn worker chat --message 'I336 live qualification' --json >"$DRWN_LIVE_RECEIPT_DIR/run.json"
run_drwn worker retire --yes --json >"$DRWN_LIVE_RECEIPT_DIR/retire.json"

for receipt in "$DRWN_LIVE_RECEIPT_DIR"/*.json; do
  jq -e '.outcome == "succeeded"' "$receipt" >/dev/null
  assert_not_contains "$(cat "$receipt")" "${DRWN_LIVE_SECRET_VALUE:-}"
done
printf 'live management receipts written to %s\n' "$DRWN_LIVE_RECEIPT_DIR"
