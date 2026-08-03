// ABOUTME: Strictly parses the immutable OrgWorkerBundleV1 handoff without resolving or applying organization state.
// ABOUTME: Verifies pinned explicit instruction bytes while retaining organization metadata as opaque evidence.

import { z } from "zod";
import { createHash } from "node:crypto";

import type { CardLockEntry } from "./card-lock";
import { DrwnError } from "./errors";
import { resolveExplicitInstructionContribution } from "./instruction-contribution";
import { assertOrgWorkerCompatibility } from "./org-worker-compatibility";
import { satisfies, validRange } from "./semver-utils";

export const ORG_WORKER_BUNDLE_DIGEST_DOMAIN =
  "darwinian:org-worker-bundle:v1\n";

const id = z.string().min(1).max(160);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const artifactPin = z
  .object({
    artifactId: id,
    kind: z.enum([
      "card",
      "worker_root",
      "standalone_skill",
      "mcp_definition",
      "cli_tool",
      "runtime_package",
    ]),
    name: id,
    version: z.string().min(1).max(80),
    integrity: digest,
    origin: z.string().min(1).max(512),
    provenanceRefs: z.array(id).max(32),
    resolutionSnapshotRef: id,
  })
  .strict();
const contributionConsent = z
  .object({
    consentId: id,
    workerId: id,
    artifactPinRef: id,
    contributionKind: z.enum(["instructions", "hooks"]),
    contentDigest: digest,
    consentedVersionRange: z.string().min(1).max(80),
    ratifierRef: id,
    evidenceRefs: z.array(id).max(32),
    projectionSurface: z.enum([
      "worker_instructions",
      "worker_lifecycle_hooks",
    ]),
  })
  .strict();

const bundleSchema = z
  .object({
    wireVersion: z.literal("org-worker-bundle@1"),
    sourceBlueprint: z
      .object({
        id,
        revision: z.int().min(1),
        digest,
      })
      .strict(),
    workerId: id,
    artifactPins: z.array(artifactPin).max(128),
    orderedWorkerRoots: z.array(id).max(32),
    activeWorkerRoot: id.nullable(),
    projectOverlay: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .refine((value) => Object.keys(value).length <= 32, {
        message: "projectOverlay has too many properties",
      }),
    contributionConsents: z.array(contributionConsent).max(128),
    minimumWorkerVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
    logicalEnvironmentClass: z.string().min(1).max(80),
    materializationReceiptVersion: z.string().min(1).max(80),
  })
  .strict();

export type OrgWorkerBundleV1 = z.infer<typeof bundleSchema>;

function semanticError(
  code:
    | "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH"
    | "ORG_WORKER_ROOT_ORDER_INVALID"
    | "ORG_WORKER_ACTIVE_ROOT_INVALID"
    | "ORG_WORKER_CONSENT_INVALID",
  message: string,
): never {
  throw new DrwnError(code, message);
}

function unique(
  values: readonly string[],
  label: string,
  code:
    | "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH"
    | "ORG_WORKER_ROOT_ORDER_INVALID"
    | "ORG_WORKER_CONSENT_INVALID",
): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (result.has(value)) {
      semanticError(code, `Org Worker bundle has duplicate ${label}`);
    }
    result.add(value);
  }
  return result;
}

function rejectForbiddenKeys(value: unknown, path = ""): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenKeys(item, `${path}/${index}`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(?:api[_-]?key|authorization|credential|currentReadiness|harnessFile|password|readiness|receipt|secret|token)$/i.test(
        key,
      )
    ) {
      throw new Error(`Forbidden OrgWorkerBundleV1 field at ${path}/${key}`);
    }
    rejectForbiddenKeys(child, `${path}/${key}`);
  }
}

export function parseOrgWorkerBundleV1(candidate: unknown): OrgWorkerBundleV1 {
  rejectForbiddenKeys(candidate);
  const parsed = bundleSchema.safeParse(candidate);
  if (!parsed.success) {
    const topLevelPaths = new Set(
      parsed.error.issues.map(({ path }) => path[0]),
    );
    if (topLevelPaths.has("orderedWorkerRoots")) {
      semanticError(
        "ORG_WORKER_ROOT_ORDER_INVALID",
        "Org Worker root order is malformed",
      );
    }
    if (topLevelPaths.has("activeWorkerRoot")) {
      semanticError(
        "ORG_WORKER_ACTIVE_ROOT_INVALID",
        "Org Worker active root is malformed",
      );
    }
    if (topLevelPaths.has("contributionConsents")) {
      semanticError(
        "ORG_WORKER_CONSENT_INVALID",
        "Org Worker contribution consent is malformed",
      );
    }
    throw parsed.error;
  }
  const bundle = parsed.data;
  const pinIds = unique(
    bundle.artifactPins.map((pin) => pin.artifactId),
    "artifact pin",
    "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
  );
  unique(
    bundle.contributionConsents.map((item) => item.consentId),
    "consent",
    "ORG_WORKER_CONSENT_INVALID",
  );
  unique(
    bundle.orderedWorkerRoots,
    "ordered Worker root",
    "ORG_WORKER_ROOT_ORDER_INVALID",
  );
  const pinsById = new Map(
    bundle.artifactPins.map((pin) => [pin.artifactId, pin]),
  );
  for (const root of bundle.orderedWorkerRoots) {
    const pin = pinsById.get(root);
    if (!pin || pin.kind !== "worker_root") {
      semanticError(
        "ORG_WORKER_ROOT_ORDER_INVALID",
        "Org Worker root order references a non-root artifact",
      );
    }
  }
  if (
    bundle.activeWorkerRoot !== null &&
    (!pinIds.has(bundle.activeWorkerRoot) ||
      !bundle.orderedWorkerRoots.includes(bundle.activeWorkerRoot))
  ) {
    semanticError(
      "ORG_WORKER_ACTIVE_ROOT_INVALID",
      "Active Worker root is not in the ordered root set",
    );
  }
  for (const consent of bundle.contributionConsents) {
    if (consent.workerId !== bundle.workerId) {
      semanticError(
        "ORG_WORKER_CONSENT_INVALID",
        "Org Worker contribution consent has a Worker mismatch",
      );
    }
    if (!pinIds.has(consent.artifactPinRef)) {
      semanticError(
        "ORG_WORKER_CONSENT_INVALID",
        "Org Worker contribution consent references an unknown artifact",
      );
    }
    if (!validRange(consent.consentedVersionRange)) {
      semanticError(
        "ORG_WORKER_CONSENT_INVALID",
        "Org Worker contribution consent has an invalid version range",
      );
    }
    const expectedSurface =
      consent.contributionKind === "instructions"
        ? "worker_instructions"
        : "worker_lifecycle_hooks";
    if (consent.projectionSurface !== expectedSurface) {
      semanticError(
        "ORG_WORKER_CONSENT_INVALID",
        "Org Worker contribution consent has a surface mismatch",
      );
    }
    if (consent.evidenceRefs.length === 0) {
      semanticError(
        "ORG_WORKER_CONSENT_INVALID",
        "Org Worker contribution consent lacks evidence",
      );
    }
  }
  return bundle;
}

function normalizeDigest(value: string): string {
  return value.replace(/^sha256[:-]/, "");
}

export function verifyOrgWorkerBundleInstructions(
  bundle: OrgWorkerBundleV1,
  resolvedCards: readonly { card: CardLockEntry; contentRoot: string }[],
): Array<{
  artifactPinRef: string;
  cardName: string;
  contentDigest: `sha256-${string}`;
  consentId: string;
}> {
  const pins = new Map(bundle.artifactPins.map((pin) => [pin.artifactId, pin]));
  const cards = new Map(resolvedCards.map((item) => [item.card.name, item]));
  return bundle.contributionConsents
    .filter((consent) => consent.contributionKind === "instructions")
    .map((consent) => {
      const pin = pins.get(consent.artifactPinRef)!;
      const resolved = cards.get(pin.name);
      if (!resolved) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_BYTES_MISSING",
          "Resolved Card bytes are missing for an Org Worker artifact",
        );
      }
      if (
        resolved.card.version !== pin.version ||
        normalizeDigest(resolved.card.integrity) !== normalizeDigest(pin.integrity)
      ) {
        semanticError(
          "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
          "Resolved Card identity does not match its Org Worker pin",
        );
      }
      if (
        !satisfies(resolved.card.version, consent.consentedVersionRange, {
          includePrerelease: true,
        })
      ) {
        semanticError(
          "ORG_WORKER_CONSENT_INVALID",
          "Org Worker instruction consent version does not match",
        );
      }
      const contribution = resolveExplicitInstructionContribution(
        resolved.card,
        resolved.contentRoot,
      );
      if (!contribution) {
        semanticError(
          "ORG_WORKER_CONSENT_INVALID",
          "Org Worker instruction consent lacks explicit instruction bytes",
        );
      }
      if (
        normalizeDigest(contribution.contentDigest) !==
        normalizeDigest(consent.contentDigest)
      ) {
        semanticError(
          "ORG_WORKER_CONSENT_INVALID",
          "Org Worker instruction content digest does not match",
        );
      }
      return {
        artifactPinRef: pin.artifactId,
        cardName: resolved.card.name,
        contentDigest: contribution.contentDigest,
        consentId: consent.consentId,
      };
    });
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${canonicalJson(child)}`,
      )
      .join(",")}}`;
  }
  throw new Error("OrgWorkerBundleV1 contains a non-canonical value");
}

export function computeOrgWorkerBundleDigest(
  bundle: OrgWorkerBundleV1,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(ORG_WORKER_BUNDLE_DIGEST_DOMAIN)
    .update(canonicalJson(bundle))
    .digest("hex")}`;
}

export interface FrozenOrgWorkerBundleInstallReceipt {
  wireVersion: "org-worker-bundle-install-receipt@1";
  bundleDigest: `sha256:${string}`;
  sourceBlueprint: OrgWorkerBundleV1["sourceBlueprint"];
  workerId: string;
  activeWorker: string;
  verifiedArtifactPins: string[];
  verifiedInstructionConsents: string[];
  provenanceRefs: string[];
  evidenceRefs: string[];
}

export function verifyFrozenOrgWorkerBundleInstall(input: {
  bundle: OrgWorkerBundleV1;
  activeWorker: string;
  workerVersion?: string;
  resolvedCards: readonly {
    card: CardLockEntry;
    contentRoot: string;
  }[];
}): FrozenOrgWorkerBundleInstallReceipt {
  assertOrgWorkerCompatibility({
    bundle: input.bundle,
    workerVersion: input.workerVersion,
  });
  const activePin = input.bundle.artifactPins.find(
    (pin) => pin.artifactId === input.bundle.activeWorkerRoot,
  );
  if (
    !activePin ||
    activePin.kind !== "worker_root" ||
    activePin.name !== input.activeWorker
  ) {
    semanticError(
      "ORG_WORKER_ACTIVE_ROOT_INVALID",
      "Frozen Org Worker active root does not match the selected project Worker",
    );
  }
  const cards = new Map(
    input.resolvedCards.map((entry) => [entry.card.name, entry]),
  );
  const verifiedArtifactPins: string[] = [];
  for (const pin of input.bundle.artifactPins) {
    if (pin.kind !== "card" && pin.kind !== "worker_root") continue;
    const resolved = cards.get(pin.name);
    if (!resolved) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_BYTES_MISSING",
        "Frozen Org Worker artifact bytes are missing",
      );
    }
    if (
      resolved.card.origin === "file" ||
      resolved.card.origin === "npm"
    ) {
      semanticError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        "Frozen Org Worker artifact origin forbids local or package substitution",
      );
    }
    if (
      resolved.card.version !== pin.version ||
      normalizeDigest(resolved.card.integrity) !==
        normalizeDigest(pin.integrity)
    ) {
      semanticError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        "Frozen Org Worker artifact identity does not match",
      );
    }
    verifiedArtifactPins.push(pin.artifactId);
  }
  const instructions = verifyOrgWorkerBundleInstructions(
    input.bundle,
    input.resolvedCards,
  );
  return {
    wireVersion: "org-worker-bundle-install-receipt@1",
    bundleDigest: computeOrgWorkerBundleDigest(input.bundle),
    sourceBlueprint: input.bundle.sourceBlueprint,
    workerId: input.bundle.workerId,
    activeWorker: input.activeWorker,
    verifiedArtifactPins: verifiedArtifactPins.sort(),
    verifiedInstructionConsents: instructions
      .map(({ consentId }) => consentId)
      .sort(),
    provenanceRefs: [
      ...new Set(
        input.bundle.artifactPins.flatMap(
          ({ provenanceRefs }) => provenanceRefs,
        ),
      ),
    ].sort(),
    evidenceRefs: [
      ...new Set(
        input.bundle.contributionConsents.flatMap(
          ({ evidenceRefs }) => evidenceRefs,
        ),
      ),
    ].sort(),
  };
}
