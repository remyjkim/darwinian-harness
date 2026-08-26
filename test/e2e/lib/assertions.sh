#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'E2E assertion failed: %s\n' "$*" >&2
  return 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "output is missing: $needle"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" != *"$needle"* ]] || fail "output retained forbidden value"
}

assert_file_absent() {
  local path="$1"
  [[ ! -e "$path" ]] || fail "unexpected file exists: $path"
}

assert_tree_absent_value() {
  local root="$1"
  local value="$2"
  if grep -R -F -l --exclude='server.stderr' -- "$value" "$root" >/dev/null 2>&1; then
    fail "isolated state retained a forbidden value"
  fi
}

wait_for_file_contains() {
  local path="$1"
  local needle="$2"
  local attempts="${3:-100}"
  local count=0
  while (( count < attempts )); do
    if [[ -f "$path" ]] && grep -F -q -- "$needle" "$path"; then
      return 0
    fi
    count=$((count + 1))
    sleep 0.1
  done
  fail "timed out waiting for $needle in $path"
}

wait_for_https() {
  local origin="$1"
  local token="$2"
  local attempts="${3:-100}"
  local count=0
  while (( count < attempts )); do
    if curl -k -sS -o /dev/null \
      -H "Authorization: Bearer $token" \
      -H 'X-Drwn-Protocol: deployed-worker.v1' \
      -H 'X-Drwn-Version: 1.4.2' \
      -H 'X-Request-Id: 123e4567-e89b-42d3-a456-4266141740aa' \
      "$origin/api/organizations?limit=1" 2>/dev/null; then
      return 0
    fi
    count=$((count + 1))
    sleep 0.1
  done
  fail "timed out waiting for fixture HTTPS origin"
}
