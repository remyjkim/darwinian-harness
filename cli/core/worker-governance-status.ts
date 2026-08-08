// ABOUTME: Builds Worker governance status from one exact deployment target and its matching local root.
// ABOUTME: Reports declaration evidence separately from deployment enforcement capability.

import type { DeploymentsResponse } from "../commands/worker/types";
import { loadCardLock } from "./card-lock";
import {
  findProjectConfig,
  loadProjectConfig,
  resolveProjectRootFromConfigPath,
} from "./project";

export type WorkerGovernanceUnavailableReason =
  | "LOCAL_PROJECT_UNAVAILABLE"
  | "LOCAL_TARGET_UNAVAILABLE"
  | "LOCAL_CARD_REF_MISMATCH";

export interface WorkerGovernanceStatusV1 {
  declaration: {
    state: "matched" | "unavailable";
    source: "local_project_lock";
    cardRef: string | null;
    allowCount: number | null;
    denyCount: number | null;
    reason: WorkerGovernanceUnavailableReason | null;
  };
  enforcement: {
    state: "not_applicable" | "unknown";
    source: "deployment_api";
    policyHash: null;
    reason: "NO_ACTIVE_DEPLOYMENT" | "CAPABILITY_NOT_REPORTED";
  };
}

export interface WorkerGovernanceTarget {
  kind: "active" | "latest" | "unavailable";
  cardRef: string | null;
  activeAliasReported: boolean;
}

type WorkerGovernanceDeclaration = WorkerGovernanceStatusV1["declaration"];

export function selectWorkerGovernanceTarget(history: DeploymentsResponse): WorkerGovernanceTarget {
  if (history.active_deployment_id !== null) {
    const active = history.deployments.find((deployment) => deployment.id === history.active_deployment_id);
    return active
      ? { kind: "active", cardRef: active.card_ref, activeAliasReported: true }
      : { kind: "unavailable", cardRef: null, activeAliasReported: true };
  }

  const latest = history.deployments[0];
  return latest
    ? { kind: "latest", cardRef: latest.card_ref, activeAliasReported: false }
    : { kind: "unavailable", cardRef: null, activeAliasReported: false };
}

function unavailableDeclaration(reason: WorkerGovernanceUnavailableReason): WorkerGovernanceDeclaration {
  return {
    state: "unavailable",
    source: "local_project_lock",
    cardRef: null,
    allowCount: null,
    denyCount: null,
    reason,
  };
}

export function createWorkerGovernanceStatus(
  target: WorkerGovernanceTarget,
  declaration: WorkerGovernanceDeclaration,
): WorkerGovernanceStatusV1 {
  return {
    declaration,
    enforcement: target.activeAliasReported
      ? {
        state: "unknown",
        source: "deployment_api",
        policyHash: null,
        reason: "CAPABILITY_NOT_REPORTED",
      }
      : {
        state: "not_applicable",
        source: "deployment_api",
        policyHash: null,
        reason: "NO_ACTIVE_DEPLOYMENT",
      },
  };
}

async function resolveLocalDeclaration(
  target: WorkerGovernanceTarget,
  startDir: string,
): Promise<WorkerGovernanceDeclaration> {
  if (target.cardRef === null) return unavailableDeclaration("LOCAL_TARGET_UNAVAILABLE");

  try {
    const configPath = findProjectConfig(startDir);
    if (configPath === null) return unavailableDeclaration("LOCAL_PROJECT_UNAVAILABLE");
    const config = await loadProjectConfig(configPath);
    if (config.activeWorker === null) return unavailableDeclaration("LOCAL_PROJECT_UNAVAILABLE");

    const lock = await loadCardLock(resolveProjectRootFromConfigPath(configPath));
    if (lock === null) return unavailableDeclaration("LOCAL_PROJECT_UNAVAILABLE");
    const root = lock.workerRoots.find((candidate) => candidate.name === config.activeWorker);
    const rootCard = root ? lock.cards.find((card) => card.name === root.name) : undefined;
    if (!root || !rootCard) return unavailableDeclaration("LOCAL_PROJECT_UNAVAILABLE");

    const canonicalRef = `${rootCard.name}@${rootCard.version}`;
    if (target.cardRef !== root.requested && target.cardRef !== canonicalRef) {
      return unavailableDeclaration("LOCAL_CARD_REF_MISMATCH");
    }

    return {
      state: "matched",
      source: "local_project_lock",
      cardRef: target.cardRef,
      allowCount: rootCard.manifest.tools?.allow?.length ?? 0,
      denyCount: rootCard.manifest.tools?.deny?.length ?? 0,
      reason: null,
    };
  } catch {
    return unavailableDeclaration("LOCAL_PROJECT_UNAVAILABLE");
  }
}

export async function resolveWorkerGovernanceStatus(
  history: DeploymentsResponse,
  startDir: string = process.cwd(),
): Promise<WorkerGovernanceStatusV1> {
  const target = selectWorkerGovernanceTarget(history);
  const declaration = await resolveLocalDeclaration(target, startDir);
  return createWorkerGovernanceStatus(target, declaration);
}

function declarationUnavailableMessage(reason: WorkerGovernanceUnavailableReason | null): string {
  switch (reason) {
    case "LOCAL_TARGET_UNAVAILABLE":
      return "no deployment Card is available for an exact local match";
    case "LOCAL_CARD_REF_MISMATCH":
      return "the active local Worker Card does not match the deployment target";
    case "LOCAL_PROJECT_UNAVAILABLE":
    default:
      return "local project lock evidence is unavailable";
  }
}

export function renderWorkerGovernanceStatus(status: WorkerGovernanceStatusV1): string {
  const lines = ["Governance:"];
  if (status.declaration.state === "matched") {
    const matchContext = status.enforcement.state === "unknown"
      ? "matches active deployment"
      : "matches latest deployment; no active deployment";
    lines.push(`  declaration: local project lock ${status.declaration.cardRef} (${matchContext})`);
    lines.push(`  tools.allow: ${status.declaration.allowCount}`);
    lines.push(`  tools.deny: ${status.declaration.denyCount}`);
  } else {
    lines.push(`  declaration: unavailable — ${declarationUnavailableMessage(status.declaration.reason)}`);
  }
  lines.push(
    status.enforcement.state === "unknown"
      ? "  deployment enforcement: unknown — Deploy API does not report governance capability"
      : "  deployment enforcement: not applicable — no active deployment",
  );
  return `${lines.join("\n")}\n`;
}
