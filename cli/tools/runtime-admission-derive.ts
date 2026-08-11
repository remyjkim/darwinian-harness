// ABOUTME: Process entry for the offline Worker v2 runtime-admission derivation adapter.
// ABOUTME: Emits one canonical outcome line on failure and nothing at all on clean success.

import {
  PERSISTENCE_OUTCOME_SCHEMA,
  RUNTIME_ADMISSION_COMMIT_STATES,
  formatPersistenceOutcome,
  runRuntimeAdmissionDerive,
  type PersistenceOutcome,
} from "../core/runtime-admission-derive";

/**
 * Every step that can commit the namespace entry is individually classified inside
 * the adapter, and the calls that sit outside a handler all precede the link, so an
 * escaping throw is pre-commit by construction. Reporting it as the closed pre-commit
 * code keeps the one-line contract that a stack trace would break.
 */
const UNCLASSIFIED_PRE_COMMIT: PersistenceOutcome = {
  schema: PERSISTENCE_OUTCOME_SCHEMA,
  code: "WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED",
  commitState: RUNTIME_ADMISSION_COMMIT_STATES.WORKER_RUNTIME_ADMISSION_OUTPUT_PERSIST_FAILED,
  retry: "forbidden",
  artifactIdentity: null,
};

let outcome: PersistenceOutcome | null;
try {
  outcome = await runRuntimeAdmissionDerive({
    argv: process.argv.slice(2),
    workingDirectory: process.cwd(),
  });
} catch {
  outcome = UNCLASSIFIED_PRE_COMMIT;
}

if (outcome !== null) {
  process.stderr.write(formatPersistenceOutcome(outcome));
  process.exit(1);
}
