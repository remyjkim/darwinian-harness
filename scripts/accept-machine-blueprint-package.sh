#!/usr/bin/env bash
# ABOUTME: Qualifies the packed npm CLI against an isolated machine Worker V2 lifecycle.
# ABOUTME: Creates disposable HOME, AGENTS_DIR, project, and Card collection roots.

set -euo pipefail

SOURCE_ROOT="${DRWN_ACCEPT_SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BUN_BIN="${BUN_BIN:-$(command -v bun)}"
ACCEPT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drwn-i177-package.XXXXXX")"
ACCEPT_HOME="$ACCEPT_ROOT/home"
ACCEPT_AGENTS="$ACCEPT_ROOT/agents"
ACCEPT_PROJECT="$ACCEPT_ROOT/project"
ACCEPT_CARDS="$ACCEPT_ROOT/card-collection"
PACK_DIR="$ACCEPT_ROOT/pack"
INSTALL_DIR="$ACCEPT_ROOT/install"
SKILL_SOURCE="$ACCEPT_ROOT/skill-source"

cleanup() {
  if [[ "${DRWN_ACCEPT_KEEP:-0}" == "1" ]]; then
    printf 'Retained acceptance sandbox: %s\n' "$ACCEPT_ROOT"
  else
    rm -rf "$ACCEPT_ROOT"
  fi
}
trap cleanup EXIT HUP INT TERM

mkdir -p \
  "$ACCEPT_HOME" \
  "$ACCEPT_AGENTS" \
  "$ACCEPT_PROJECT" \
  "$ACCEPT_CARDS" \
  "$PACK_DIR" \
  "$INSTALL_DIR" \
  "$SKILL_SOURCE"

(
  cd "$SOURCE_ROOT"
  npm pack --ignore-scripts --loglevel error --pack-destination "$PACK_DIR" >/dev/null
)
TARBALL="$(find "$PACK_DIR" -maxdepth 1 -type f -name '*.tgz' -print -quit)"
if [[ -z "$TARBALL" ]]; then
  printf 'npm pack did not produce a tarball\n' >&2
  exit 1
fi
npm install --ignore-scripts --no-audit --no-fund --prefix "$INSTALL_DIR" "$TARBALL" >/dev/null
DRWN_ENTRYPOINT="$INSTALL_DIR/node_modules/darwinian/cli/index.ts"
if [[ ! -f "$DRWN_ENTRYPOINT" ]]; then
  printf 'Packed CLI entrypoint is missing: %s\n' "$DRWN_ENTRYPOINT" >&2
  exit 1
fi

run_drwn() {
  env -u AGENTS_REPO_ROOT \
    HOME="$ACCEPT_HOME" \
    AGENTS_HOME_DIR="$ACCEPT_HOME" \
    AGENTS_DIR="$ACCEPT_AGENTS" \
    "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}

printf '%s\n' \
  '---' \
  'name: packaged-acceptance' \
  'description: Packaged I177 acceptance fixture.' \
  '---' \
  '' \
  '# Packaged Acceptance' > "$SKILL_SOURCE/SKILL.md"

run_drwn card new @accept/capability --into "$ACCEPT_CARDS" --no-git
run_drwn card source add-skill "$ACCEPT_CARDS/capability" packaged-acceptance --from "$SKILL_SOURCE"
run_drwn card source doctor "$ACCEPT_CARDS/capability" --json > "$ACCEPT_ROOT/card-doctor.json"
run_drwn card publish --from "$ACCEPT_CARDS/capability" --json > "$ACCEPT_ROOT/card-publish.json"

run_drwn worker new @accept/machine-defaults --into "$ACCEPT_CARDS" --no-git
run_drwn worker compose "$ACCEPT_CARDS/machine-defaults" --add @accept/capability@1.0.0
run_drwn card source doctor "$ACCEPT_CARDS/machine-defaults" --json > "$ACCEPT_ROOT/worker-doctor.json"
run_drwn worker publish --from "$ACCEPT_CARDS/machine-defaults"
run_drwn apply --root @accept/machine-defaults@1.0.0

MACHINE_PATH="$ACCEPT_AGENTS/drwn/machine.json"
node - "$MACHINE_PATH" <<'NODE'
const fs = require('fs');
const machine = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (machine.schema !== 'drwn.machine' || machine.schemaVersion !== 2) throw new Error('machine V2 missing');
if (machine.capabilities.activeWorker !== '@accept/machine-defaults') throw new Error('wrong active Worker');
if (machine.capabilities.workerLock.workerRoots[0].requested !== '@accept/machine-defaults@1.0.0') {
  throw new Error('machine root is not immutably requested');
}
for (const stale of ['profile', 'skills', 'mcpServers']) {
  if (stale in machine.capabilities) throw new Error(`legacy machine field survived: ${stale}`);
}
NODE

run_drwn write --root --dry-run --json > "$ACCEPT_ROOT/root-preview.json"
run_drwn write --root --json > "$ACCEPT_ROOT/root-write.json"
run_drwn write --root --dry-run --json > "$ACCEPT_ROOT/root-current.json"
test -d "$ACCEPT_HOME/.claude/skills/packaged-acceptance"
test -d "$ACCEPT_HOME/.codex/skills/packaged-acceptance"
test -d "$ACCEPT_AGENTS/drwn/generated/workers/@accept/machine-defaults"
test ! -e "$ACCEPT_HOME/AGENTS.md"

shasum -a 256 "$MACHINE_PATH" > "$ACCEPT_ROOT/machine-before.sha256"
if run_drwn machine skill enable packaged-acceptance > "$ACCEPT_ROOT/retired.out" 2> "$ACCEPT_ROOT/retired.err"; then
  printf 'retired direct activation unexpectedly succeeded\n' >&2
  exit 1
fi
grep -q 'drwn apply --root' "$ACCEPT_ROOT/retired.out" "$ACCEPT_ROOT/retired.err"
shasum -a 256 -c "$ACCEPT_ROOT/machine-before.sha256" >/dev/null

(
  cd "$ACCEPT_PROJECT"
  run_drwn init --non-interactive --no-default-catalogs
  run_drwn write --dry-run > "$ACCEPT_ROOT/project-preview.txt"
)
node - "$ACCEPT_PROJECT/.agents/drwn/config.json" "$ACCEPT_ROOT/project-preview.txt" <<'NODE'
const fs = require('fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (config.schema !== 'drwn.project-config' || config.activeWorker !== null) throw new Error('project intent is not isolated');
const preview = fs.readFileSync(process.argv[3], 'utf8');
if (preview.includes('/skills/packaged-acceptance')) throw new Error('machine closure leaked into project intent');
NODE

node - "$ACCEPT_ROOT/root-current.json" <<'NODE'
const fs = require('fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(result.changes) || result.changes.length !== 0) throw new Error('second machine preview is not current');
NODE

printf 'PASS packaged machine Blueprint acceptance\n'
printf 'Tarball: %s\n' "$TARBALL"
printf 'HOME: %s\nAGENTS_DIR: %s\nProject: %s\nCard collection: %s\n' \
  "$ACCEPT_HOME" "$ACCEPT_AGENTS" "$ACCEPT_PROJECT" "$ACCEPT_CARDS"
