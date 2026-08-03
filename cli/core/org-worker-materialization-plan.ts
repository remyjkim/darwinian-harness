// ABOUTME: Derives deterministic fresh-project Worker config and lock intent from verified Org artifacts.
// ABOUTME: Produces a pure change plan while retaining organization consent outside local Card consent.

import type { CardManifest } from "./card-manifest";
import {
  serializeCardLock,
  type CardLockEntry,
  type ProjectLockV1,
  type WorkerRootLockEntry,
} from "./card-lock";
import { parseCardRef } from "./card-store";
import { DrwnError } from "./errors";
import type { OrgWorkerBundleInstructionConsentEvidence } from "./instruction-consent-evidence";
import type { VerifiedWorkerArtifactSnapshotV1 } from "./org-worker-artifact-snapshot";
import {
  computeOrgWorkerBundleDigest,
  type OrgWorkerBundleV1,
} from "./org-worker-bundle-v1";
import { validateProjectConfig } from "./project";
import type { ProjectStateSnapshot } from "./project-state-transaction";
import type { ProjectConfig } from "./types";

export interface OrgWorkerMaterializationPlan {
  config: ProjectConfig;
  lock: ProjectLockV1;
  configBytes: string;
  lockBytes: string;
  artifactClosure: Array<{
    artifactPinRef: string;
    name: string;
    version: string;
    requestedRef: string;
    contentRoot: string;
  }>;
  effectiveExternalConsentEvidence:
    OrgWorkerBundleInstructionConsentEvidence[];
  intendedProjectionIdentities: Array<{
    consentId: string;
    artifactPinRef: string;
    contributionKind: "instructions" | "hooks";
    projectionSurface:
      | "worker_instructions"
      | "worker_lifecycle_hooks";
    contentDigest: `sha256-${string}`;
  }>;
  changes: Array<{
    path: ".agents/drwn/config.json" | ".agents/drwn/card.lock";
    operation: "create" | "unchanged";
    bytes: string;
  }>;
}

function localIntegrity(value: `sha256:${string}`): string {
  return value.replace(/^sha256:/, "sha256-");
}

function localContentDigest(value: string): `sha256-${string}` {
  return value.replace(/^sha256:/, "sha256-") as `sha256-${string}`;
}

function exactRequestedRef(name: string, version: string): string {
  return `${name}@${version}`;
}

function membersForRoot(
  manifest: CardManifest,
  cardsByName: ReadonlyMap<string, CardLockEntry>,
): string[] {
  return (manifest.composedFrom ?? []).map((ref) => {
    const parsed = parseCardRef(ref);
    const member = cardsByName.get(parsed.name);
    if (!member) {
      throw new DrwnError(
        "ORG_WORKER_MATERIALIZATION_PLAN_INVALID",
        "Verified Worker artifact closure is incomplete",
      );
    }
    return member.name;
  });
}

export function deriveFreshOrgWorkerMaterializationPlan(input: {
  bundle: OrgWorkerBundleV1;
  verifiedSnapshot: VerifiedWorkerArtifactSnapshotV1;
  existingProject?: ProjectStateSnapshot;
}): OrgWorkerMaterializationPlan {
  const bundleDigest = computeOrgWorkerBundleDigest(input.bundle);
  if (input.verifiedSnapshot.sourceBundleDigest !== bundleDigest) {
    throw new DrwnError(
      "ORG_WORKER_BUNDLE_DIGEST_MISMATCH",
      "Verified artifact snapshot does not match the source bundle",
    );
  }
  const verifiedByPin = new Map(
    input.verifiedSnapshot.verifiedArtifacts.map((artifact) => [
      artifact.artifactPinRef,
      artifact,
    ]),
  );
  if (
    verifiedByPin.size !== input.bundle.artifactPins.length ||
    input.verifiedSnapshot.verifiedArtifacts.length !==
      input.bundle.artifactPins.length
  ) {
    throw new DrwnError(
      "ORG_WORKER_MATERIALIZATION_PLAN_INVALID",
      "Verified Worker artifact closure is incomplete",
    );
  }

  const cards: CardLockEntry[] = input.bundle.artifactPins.map((pin) => {
    const artifact = verifiedByPin.get(pin.artifactId);
    if (!artifact) {
      throw new DrwnError(
        "ORG_WORKER_MATERIALIZATION_PLAN_INVALID",
        "Verified Worker artifact closure is incomplete",
      );
    }
    const expectedRequestedRef = exactRequestedRef(pin.name, pin.version);
    if (artifact.requestedRef !== expectedRequestedRef) {
      throw new DrwnError(
        "ORG_WORKER_FLOATING_INTENT_UNSUPPORTED",
        "Fresh Worker materialization requires exact requested refs",
      );
    }
    const parsed = parseCardRef(artifact.requestedRef);
    if (
      parsed.origin !== "store" ||
      parsed.name !== pin.name ||
      parsed.range !== pin.version
    ) {
      throw new DrwnError(
        "ORG_WORKER_FLOATING_INTENT_UNSUPPORTED",
        "Fresh Worker materialization requires exact requested refs",
      );
    }
    if (
      artifact.name !== pin.name ||
      artifact.version !== pin.version ||
      artifact.integrity !== pin.integrity ||
      artifact.kind !== pin.kind
    ) {
      throw new DrwnError(
        "ORG_WORKER_MATERIALIZATION_PLAN_INVALID",
        "Verified Worker artifact identity does not match the bundle",
      );
    }
    return {
      name: artifact.name,
      requested: artifact.requestedRef,
      version: artifact.version,
      path: artifact.contentRoot,
      integrity: localIntegrity(artifact.integrity),
      treeSha: artifact.treeSha,
      manifest: artifact.manifest,
      skills: artifact.manifest.skills?.include ?? [],
      hooks: artifact.manifest.hooks?.include ?? [],
      ...(artifact.manifest.persona
        ? { persona: artifact.manifest.persona }
        : {}),
      ...(artifact.manifest.beliefs
        ? { beliefs: artifact.manifest.beliefs }
        : {}),
      ...(artifact.manifest.memory
        ? { memory: artifact.manifest.memory }
        : {}),
      registry: null,
      origin: "git",
      git: { commit: artifact.gitCommit },
    };
  });
  const cardsByName = new Map(cards.map((card) => [card.name, card]));
  const workerRoots: WorkerRootLockEntry[] =
    input.bundle.orderedWorkerRoots.map((pinId) => {
      const artifact = verifiedByPin.get(pinId);
      const card = artifact ? cardsByName.get(artifact.name) : undefined;
      if (!artifact || !card || artifact.kind !== "worker_root") {
        throw new DrwnError(
          "ORG_WORKER_MATERIALIZATION_PLAN_INVALID",
          "Verified Worker root mapping is incomplete",
        );
      }
      return {
        name: card.name,
        requested: card.requested,
        kind:
          card.manifest.kind === "blueprint" ? "blueprint" : "card",
        members: membersForRoot(card.manifest, cardsByName),
      };
    });
  const activeWorker =
    input.bundle.activeWorkerRoot === null
      ? null
      : verifiedByPin.get(input.bundle.activeWorkerRoot)?.name;
  if (activeWorker === undefined) {
    throw new DrwnError(
      "ORG_WORKER_MATERIALIZATION_PLAN_INVALID",
      "Verified active Worker mapping is incomplete",
    );
  }
  const config = validateProjectConfig({
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: workerRoots.map((root) => root.requested),
    activeWorker,
  });
  const configBytes = `${JSON.stringify(config, null, 2)}\n`;
  const lockBytes = serializeCardLock({ workerRoots, cards });
  const lock = JSON.parse(lockBytes) as ProjectLockV1;

  const existing = input.existingProject ?? {
    configBytes: null,
    lockBytes: null,
  };
  const isFresh =
    existing.configBytes === null && existing.lockBytes === null;
  const isExact =
    existing.configBytes === configBytes && existing.lockBytes === lockBytes;
  if (!isFresh && !isExact) {
    throw new DrwnError(
      "ORG_WORKER_PROJECT_CONFLICT",
      "Existing project state conflicts with fresh materialization",
    );
  }
  const operation = isFresh ? "create" : "unchanged";

  return {
    config,
    lock,
    configBytes,
    lockBytes,
    artifactClosure: input.bundle.artifactPins.map((pin) => {
      const artifact = verifiedByPin.get(pin.artifactId)!;
      return {
        artifactPinRef: pin.artifactId,
        name: artifact.name,
        version: artifact.version,
        requestedRef: artifact.requestedRef,
        contentRoot: artifact.contentRoot,
      };
    }),
    effectiveExternalConsentEvidence: input.bundle.contributionConsents
      .filter(
        (consent) =>
          consent.contributionKind === "instructions" &&
          consent.projectionSurface === "worker_instructions",
      )
      .map((consent) => ({
        kind: "org_worker_bundle_consent" as const,
        bundleDigest,
        sourceBlueprint: {
          ...input.bundle.sourceBlueprint,
          digest: input.bundle.sourceBlueprint
            .digest as `sha256:${string}`,
        },
        consentId: consent.consentId,
        workerId: consent.workerId,
        artifactPinRef: consent.artifactPinRef,
        consentedRange: consent.consentedVersionRange,
        contentDigest: localContentDigest(consent.contentDigest),
        ratifierRef: consent.ratifierRef,
        evidenceRefs: [...consent.evidenceRefs],
        projectionSurface: "worker_instructions" as const,
      })),
    intendedProjectionIdentities: input.bundle.contributionConsents.map(
      (consent) => ({
        consentId: consent.consentId,
        artifactPinRef: consent.artifactPinRef,
        contributionKind: consent.contributionKind,
        projectionSurface: consent.projectionSurface,
        contentDigest: localContentDigest(consent.contentDigest),
      }),
    ),
    changes: [
      {
        path: ".agents/drwn/config.json",
        operation,
        bytes: configBytes,
      },
      {
        path: ".agents/drwn/card.lock",
        operation,
        bytes: lockBytes,
      },
    ],
  };
}
