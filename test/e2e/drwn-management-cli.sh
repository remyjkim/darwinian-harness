#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
# shellcheck source=test/e2e/lib/assertions.sh
source "$SCRIPT_DIR/lib/assertions.sh"

E2E_ROOT_RAW="$(mktemp -d "${TMPDIR:-/tmp}/drwn-management-e2e.XXXXXX")"
E2E_ROOT="$(cd "$E2E_ROOT_RAW" && pwd -P)"
SERVER_PID=""

cleanup() {
  local status=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ "${DRWN_E2E_KEEP:-0}" == "1" ]]; then
    printf 'preserved E2E root: %s\n' "$E2E_ROOT" >&2
  else
    rm -rf -- "$E2E_ROOT"
  fi
  return "$status"
}
trap cleanup EXIT INT TERM

export HOME="$E2E_ROOT/home"
export AGENTS_DIR="$E2E_ROOT/agents"
export XDG_CONFIG_HOME="$E2E_ROOT/xdg"
export DRWN_CLOUD_PROFILE=local
export DRWN_CLOUD_PROFILE_FILE="$E2E_ROOT/cloud-profile.json"
export NODE_TLS_REJECT_UNAUTHORIZED=0
export RUNNER_TEMP="$E2E_ROOT/runner-temp"
mkdir -p "$HOME" "$AGENTS_DIR" "$XDG_CONFIG_HOME" "$E2E_ROOT/project" "$E2E_ROOT/cards" "$RUNNER_TEMP"

if [[ -z "${DRWN_E2E_BIN:-}" ]]; then
  DRWN_E2E_BIN="$E2E_ROOT/drwn-source"
  {
    printf '%s\n' '#!/usr/bin/env bash' 'set -Eeuo pipefail'
    printf 'exec bun %q "$@"\n' "$REPO_ROOT/cli/index.ts"
  } >"$DRWN_E2E_BIN"
  chmod 700 "$DRWN_E2E_BIN"
  export AGENTS_REPO_ROOT="$REPO_ROOT"
fi
[[ -x "$DRWN_E2E_BIN" ]] || fail "DRWN_E2E_BIN must be an executable installed CLI shim"

DRWN_E2E_PORT="${DRWN_E2E_PORT:-$((20000 + RANDOM % 20000))}"
ORIGIN="https://127.0.0.1:$DRWN_E2E_PORT"
ISSUER="$ORIGIN/api/auth"
# The single-quoted program is JavaScript; Bun expands its own template literal.
# shellcheck disable=SC2016
TOKEN_PAYLOAD="$(ISSUER="$ISSUER" ORIGIN="$ORIGIN" bun -e '
const now = Math.floor(Date.now() / 1000);
const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
console.log(`${enc({ alg: "none", typ: "JWT" })}.${enc({
  iss: process.env.ISSUER,
  aud: process.env.ORIGIN,
  azp: "drwn-cli",
  sub: "user_management_e2e",
  scope: "openid email offline_access dah:management.delegate",
  iat: now - 1,
  exp: now + 3600,
})}.fixture`);
')"
export DRWN_TOKEN="$TOKEN_PAYLOAD"

cat >"$DRWN_CLOUD_PROFILE_FILE" <<JSON
{"profileId":"local","apiOrigin":"$ORIGIN","webOrigin":"$ORIGIN","authHubOrigin":"$ORIGIN","issuer":"$ISSUER","resource":"$ORIGIN","clientId":"drwn-cli","requestedScopes":["openid","email","offline_access","dah:management.delegate"]}
JSON
chmod 600 "$DRWN_CLOUD_PROFILE_FILE"

STATE_FILE="$E2E_ROOT/fixture-state.json"
SERVER_STDERR="$E2E_ROOT/server.stderr"
TLS_CERT="$E2E_ROOT/drwn-e2e-cert.pem"
TLS_KEY="$E2E_ROOT/drwn-e2e-key.pem"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -keyout "$TLS_KEY" -out "$TLS_CERT" -subj '/CN=127.0.0.1' \
  -addext 'subjectAltName=IP:127.0.0.1,DNS:localhost' >/dev/null 2>&1
chmod 600 "$TLS_CERT" "$TLS_KEY"

start_server() {
  local delayed="$1"
  DRWN_E2E_PORT="$DRWN_E2E_PORT" \
  DRWN_E2E_STATE_FILE="$STATE_FILE" \
  DRWN_E2E_TOKEN="$TOKEN_PAYLOAD" \
  DRWN_E2E_TLS_CERT="$TLS_CERT" \
  DRWN_E2E_TLS_KEY="$TLS_KEY" \
  DRWN_E2E_DELAY_FIRST_REGISTER="$delayed" \
    bun "$REPO_ROOT/test/fixtures/drwn-management-e2e-server.ts" \
      >"$E2E_ROOT/server.stdout" 2>"$SERVER_STDERR" &
  SERVER_PID=$!
  wait_for_https "$ORIGIN" "$TOKEN_PAYLOAD"
}

stop_server() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

run_drwn() {
  "$DRWN_E2E_BIN" "$@"
}

cd "$E2E_ROOT/project"
mkdir -p .agents/drwn
cat >.agents/drwn/config.json <<'JSON'
{"schema":"drwn.project-config","schemaVersion":1,"workers":[],"activeWorker":null}
JSON
run_drwn card new @e2e/worker --into "$E2E_ROOT/cards" --no-git >/dev/null
run_drwn card publish --from "$E2E_ROOT/cards/worker" >/dev/null
run_drwn add @e2e/worker@1.0.0 --write >/dev/null

HELP_STATE_BEFORE="$(find "$E2E_ROOT" -type f -print0 | sort -z | xargs -0 shasum -a 256)"
run_drwn org list --help >/dev/null
run_drwn worker register --help >/dev/null
run_drwn worker deploy --help >/dev/null
run_drwn worker retire --help >/dev/null
HELP_STATE_AFTER="$(find "$E2E_ROOT" -type f -print0 | sort -z | xargs -0 shasum -a 256)"
[[ "$HELP_STATE_BEFORE" == "$HELP_STATE_AFTER" ]] || fail "management help mutated isolated state"

QUALIFICATION_READINESS="$RUNNER_TEMP/i321-cli-management-readiness.json"
QUALIFICATION_COMMUNITY="$RUNNER_TEMP/i321-staging-slot-community.json"
QUALIFICATION_NOTICE="$RUNNER_TEMP/i321-device-approval-notice.json"
set +e
QUALIFICATION_STDOUT="$(run_drwn __internal qualify-staging-community \
  --plan-file "$E2E_ROOT/missing-private-plan.json" \
  --approval-notice-file "$QUALIFICATION_NOTICE" \
  --phase-a-adapter-origin "http://127.0.0.1:1" \
  --readiness-output-file "$QUALIFICATION_READINESS" \
  --community-output-file "$QUALIFICATION_COMMUNITY" \
  2>"$E2E_ROOT/qualification.stderr")"
QUALIFICATION_STATUS=$?
set -e
[[ "$QUALIFICATION_STATUS" -ne 0 ]] || fail "missing qualification plan unexpectedly succeeded"
[[ -z "$QUALIFICATION_STDOUT" ]] || fail "qualification refusal wrote stdout"
[[ "$(cat "$E2E_ROOT/qualification.stderr")" == "STAGING_COMMUNITY_QUALIFICATION_FAILED" ]] || fail "qualification refusal was not fixed and redacted"
assert_file_absent "$QUALIFICATION_READINESS"
assert_file_absent "$QUALIFICATION_COMMUNITY"
assert_file_absent "$QUALIFICATION_NOTICE"

start_server 1
ORG_LIST="$(run_drwn org list --json)"
assert_contains "$ORG_LIST" '"organizationId": "org_acme"'
run_drwn org use org_acme --json >/dev/null

set +e
run_drwn worker register --organization org_acme --name worker-alpha --environment staging --json \
  >"$E2E_ROOT/register-first.stdout" 2>"$E2E_ROOT/register-first.stderr" &
REGISTER_PID=$!
set -e
wait_for_file_contains "$STATE_FILE" 'deployed_workers.register'
stop_server
set +e
wait "$REGISTER_PID"
REGISTER_FIRST_STATUS=$?
set -e
[[ "$REGISTER_FIRST_STATUS" -ne 0 ]] || fail "lost registration response unexpectedly succeeded"
assert_contains "$(cat "$E2E_ROOT/register-first.stderr")" '"outcome": "indeterminate"'

start_server 0
REGISTERED="$(run_drwn worker register --organization org_acme --name worker-alpha --environment staging --json)"
assert_contains "$REGISTERED" '"deployedWorkerId": "deployed_worker_alpha"'

DEPLOY_ONE="$(run_drwn worker deploy @e2e/worker@1.0.0 --json)"
DEPLOY_TWO="$(run_drwn worker deploy @e2e/worker@1.0.0 --json)"
assert_contains "$DEPLOY_ONE" '"deploymentId": "deployment_attempt_0001"'
assert_contains "$DEPLOY_TWO" '"deploymentId": "deployment_attempt_0002"'
HISTORY="$(run_drwn worker deployments --json)"
assert_contains "$HISTORY" 'deployment_attempt_0001'
assert_contains "$HISTORY" 'deployment_attempt_0002'
ROLLBACK="$(run_drwn worker rollback --to deployment_attempt_0001 --json)"
assert_contains "$ROLLBACK" '"command": "deployments.rollback"'

SECRET_VALUE='SENTINEL_MANAGEMENT_SECRET_336'
SECRET_RESULT="$(printf '%s' "$SECRET_VALUE" | run_drwn worker secret set PROVIDER_API_KEY --json)"
assert_contains "$SECRET_RESULT" '"secretRevision": 1'
assert_not_contains "$SECRET_RESULT" "$SECRET_VALUE"
assert_not_contains "$(cat "$SERVER_STDERR")" "$SECRET_VALUE"
assert_file_absent "$E2E_ROOT/secret-value"

RUN_RESULT="$(run_drwn worker chat --message 'Summarize the release ledger.' --json)"
assert_contains "$RUN_RESULT" '"status": "succeeded"'
assert_contains "$RUN_RESULT" 'Release ledger summarized.'

set +e
OLD_SYNTAX="$(run_drwn worker status --name retired-slug 2>&1)"
OLD_STATUS=$?
set -e
[[ "$OLD_STATUS" -ne 0 ]] || fail "retired slug syntax unexpectedly succeeded"
assert_contains "$OLD_SYNTAX" 'Unknown Syntax Error'

RETIRE_RESULT="$(run_drwn worker retire --yes --json)"
assert_contains "$RETIRE_RESULT" '"command": "deployed_workers.retire"'
assert_contains "$RETIRE_RESULT" '"retiredAt"'

stop_server
FIXTURE_STATE="$(cat "$STATE_FILE")"
assert_contains "$FIXTURE_STATE" '"headerErrors": []'
assert_contains "$FIXTURE_STATE" '"secretValueObserved": true'
assert_contains "$FIXTURE_STATE" '"deployment_attempt_0002"'
assert_contains "$FIXTURE_STATE" '"retired": true'
REGISTER_ID_COUNT="$(bun -e 'const s=JSON.parse(await Bun.file(process.argv[1]).text()); console.log(new Set(s.registerRequestIds).size)' "$STATE_FILE")"
[[ "$REGISTER_ID_COUNT" == "1" ]] || fail "registration replay did not preserve one request ID"
assert_tree_absent_value "$E2E_ROOT" "$SECRET_VALUE"

printf 'management Bash E2E passed: two deployments, replay, rollback, secret, run, retirement\n'
