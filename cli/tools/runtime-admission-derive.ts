// ABOUTME: Process entry for the offline Worker v2 runtime-admission derivation adapter.
// ABOUTME: Emits one canonical outcome line on failure and nothing at all on clean success.

import { formatPersistenceOutcome, runRuntimeAdmissionDerive } from "../core/runtime-admission-derive";

const outcome = await runRuntimeAdmissionDerive({
  argv: process.argv.slice(2),
  workingDirectory: process.cwd(),
});

if (outcome !== null) {
  process.stderr.write(formatPersistenceOutcome(outcome));
  process.exit(1);
}
