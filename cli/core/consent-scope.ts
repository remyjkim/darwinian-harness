// ABOUTME: Defines explicit project and machine scopes for local consent acknowledgements.
// ABOUTME: Prevents machine acknowledgements from masquerading as magic filesystem paths.

import { realpathSync } from "node:fs";

export type ConsentScope =
  | { kind: "project"; projectRoot: string }
  | { kind: "machine"; activeWorker: string };

export function projectConsentScope(
  projectRoot: string,
): Extract<ConsentScope, { kind: "project" }> {
  try {
    return { kind: "project", projectRoot: realpathSync(projectRoot) };
  } catch {
    return { kind: "project", projectRoot };
  }
}

export function machineConsentScope(
  activeWorker: string,
): Extract<ConsentScope, { kind: "machine" }> {
  return { kind: "machine", activeWorker };
}

export function consentScopesEqual(left: ConsentScope, right: ConsentScope) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "machine" && right.kind === "machine") {
    return left.activeWorker === right.activeWorker;
  }
  return (
    left.kind === "project" &&
    right.kind === "project" &&
    projectConsentScope(left.projectRoot).projectRoot ===
      projectConsentScope(right.projectRoot).projectRoot
  );
}
