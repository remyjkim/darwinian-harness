#!/usr/bin/env bash
# ABOUTME: Qualifies the packed npm CLI against an isolated machine Worker V2 lifecycle.
# ABOUTME: Creates disposable HOME, AGENTS_DIR, project, and Card collection roots.

set -euo pipefail

SOURCE_ROOT="${DRWN_ACCEPT_SOURCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
if [[ -z "${BUN_BIN:-}" ]]; then
  BUN_BIN="$(bunx bun@1.2.21 -e 'console.log(process.execPath)')"
fi
ACCEPT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drwn-i177-package.XXXXXX")"
ACCEPT_HOME="$ACCEPT_ROOT/home"
ACCEPT_AGENTS="$ACCEPT_ROOT/agents"
ACCEPT_PROJECT="$ACCEPT_ROOT/project"
ACCEPT_CARDS="$ACCEPT_ROOT/card-collection"
RECOMMENDED_HOME="$ACCEPT_ROOT/recommended-home"
RECOMMENDED_AGENTS="$ACCEPT_ROOT/recommended-agents"
RECOMMENDED_NEUTRAL="$ACCEPT_ROOT/recommended-neutral"
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
  "$RECOMMENDED_HOME" \
  "$RECOMMENDED_AGENTS" \
  "$RECOMMENDED_NEUTRAL" \
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

run_recommended() {
  env -u AGENTS_REPO_ROOT \
    HOME="$RECOMMENDED_HOME" \
    AGENTS_HOME_DIR="$RECOMMENDED_HOME" \
    AGENTS_DIR="$RECOMMENDED_AGENTS" \
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

if [[ "${DRWN_ACCEPT_RECOMMENDED:-0}" == "1" ]]; then
  DRWN_INIT_MODULE="$INSTALL_DIR/node_modules/darwinian/cli/core/machine-worker-init.ts"
  env -u AGENTS_REPO_ROOT \
    HOME="$RECOMMENDED_HOME" \
    AGENTS_HOME_DIR="$RECOMMENDED_HOME" \
    AGENTS_DIR="$RECOMMENDED_AGENTS" \
    DRWN_INIT_MODULE="$DRWN_INIT_MODULE" \
    DRWN_PACKAGED_REPO="$INSTALL_DIR/node_modules/darwinian" \
    "$BUN_BIN" -e '
      const { initializeMachineWorker } = await import(process.env.DRWN_INIT_MODULE);
      await initializeMachineWorker({
        agentsDir: process.env.AGENTS_DIR,
        repoRoot: process.env.DRWN_PACKAGED_REPO,
        guided: true,
        promptRecommended: async () => true,
      });
    '
  (
    cd "$RECOMMENDED_NEUTRAL"
    run_recommended card trust @curation-labs/workflow-skills --hooks --instructions --scope machine
    run_recommended write --root --json > "$ACCEPT_ROOT/recommended-first-write.json"
    run_recommended write --root --json > "$ACCEPT_ROOT/recommended-second-write.json"
    run_recommended doctor --json > "$ACCEPT_ROOT/recommended-doctor.json"
  )
  node - \
    "$RECOMMENDED_AGENTS/drwn/machine.json" \
    "$ACCEPT_ROOT/recommended-first-write.json" \
    "$ACCEPT_ROOT/recommended-second-write.json" \
    "$ACCEPT_ROOT/recommended-doctor.json" <<'NODE'
const fs = require('fs');
const [machinePath, firstPath, secondPath, doctorPath] = process.argv.slice(2);
const machine = JSON.parse(fs.readFileSync(machinePath, 'utf8'));
const cards = machine.capabilities.workerLock.cards;
const exact = [
  ['@curation-labs/machine-defaults', '2.0.0', 'df811c79b8a576e708833ed0f62d34548e522bb0', '0351baee669aca1ecfd74a630895a5389598937e', 'sha256-6e1db61b9a3005ec4c49fdb17573ee9750f1bc8a1db42cd5606aa33ab49085ac'],
  ['@darwinian/operator', '2.0.2', 'b62965fde417fa1715d98d5c10fd45012c6cc05b', '7340729d0e4de604e51d4f341b299fa4004788a2', 'sha256-51503533bd60943e5ba16873f129bd600f42c2553084e29d1770e43a7e858999'],
  ['@curation-labs/workflow-skills', '1.0.1', '794ba29aef03e66a1532f871d7a83263acf3df9c', 'ce9f230f9222d44640b4123e200128ed6c210829', 'sha256-8f7b935e904cb91d82a5f4d3c2ed1b30f7d70444f5b76930118a5a3ae1fd92c2'],
  ['@remyjkim/knowledge-docs', '1.0.0', '6f3a7cf96c1887d920c00aa61f997d8aa1b46cf0', '61315160ba47c1a5ebfdefc74a4cba267952476c', 'sha256-b4035ef528c60ca21ecdf43caf3b40c5abdbb1f7676495030529bc42d29646a0'],
];
if (machine.capabilities.activeWorker !== exact[0][0]) throw new Error('recommended Worker is not active');
for (const [name, version, commit, treeSha, integrity] of exact) {
  const card = cards.find((candidate) => candidate.name === name);
  if (!card || card.version !== version || card.git?.commit !== commit || card.treeSha !== treeSha || card.integrity !== integrity) {
    throw new Error(`recommended release coordinate mismatch: ${name}`);
  }
}
const first = JSON.parse(fs.readFileSync(firstPath, 'utf8'));
const second = JSON.parse(fs.readFileSync(secondPath, 'utf8'));
if (!Array.isArray(first.changes) || first.changes.length === 0) throw new Error('recommended first write made no changes');
if (!Array.isArray(second.changes) || second.changes.length !== 0) throw new Error('recommended second write is not current');
const doctor = JSON.parse(fs.readFileSync(doctorPath, 'utf8'));
for (const field of ['machineCapabilityIssues', 'machineProjectionConflicts', 'missingGeneratedFiles', 'hookIssues', 'projectConfigIssues']) {
  if (!Array.isArray(doctor[field]) || doctor[field].length !== 0) throw new Error(`recommended doctor field is not empty: ${field}`);
}
console.log(`PASS recommended exact-tag acceptance (${first.changes.length} first-write changes; ${second.changes.length} second-write changes)`);
NODE
fi

printf 'PASS packaged machine Blueprint acceptance\n'
printf 'Tarball: %s\n' "$TARBALL"
printf 'HOME: %s\nAGENTS_DIR: %s\nProject: %s\nCard collection: %s\n' \
  "$ACCEPT_HOME" "$ACCEPT_AGENTS" "$ACCEPT_PROJECT" "$ACCEPT_CARDS"
