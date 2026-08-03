// ABOUTME: Strictly parses the immutable OrgWorkerBundleV1 handoff without resolving or applying organization state.
// ABOUTME: Verifies pinned explicit instruction bytes while retaining organization metadata as opaque evidence.

import { z } from "zod";
import { createHash } from "node:crypto";

import type { CardLockEntry } from "./card-lock";
import { resolveExplicitInstructionContribution } from "./instruction-contribution";
import { satisfies, validRange } from "./semver-utils";

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
    materializationReceiptVersion: z.literal(
      "worker-materialization-receipt@1",
    ),
  })
  .strict();

export type OrgWorkerBundleV1 = z.infer<typeof bundleSchema>;

function unique(values: readonly string[], label: string): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (result.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
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
  const bundle = bundleSchema.parse(candidate);
  const pinIds = unique(
    bundle.artifactPins.map((pin) => pin.artifactId),
    "artifact pin",
  );
  unique(bundle.contributionConsents.map((item) => item.consentId), "consent");
  unique(bundle.orderedWorkerRoots, "ordered Worker root");
  const pinsById = new Map(
    bundle.artifactPins.map((pin) => [pin.artifactId, pin]),
  );
  for (const root of bundle.orderedWorkerRoots) {
    const pin = pinsById.get(root);
    if (!pin || pin.kind !== "worker_root") {
      throw new Error(`Ordered Worker root is not a pinned worker_root: ${root}`);
    }
  }
  if (
    bundle.activeWorkerRoot !== null &&
    (!pinIds.has(bundle.activeWorkerRoot) ||
      !bundle.orderedWorkerRoots.includes(bundle.activeWorkerRoot))
  ) {
    throw new Error(
      `Active Worker root is not in ordered pinned roots: ${bundle.activeWorkerRoot}`,
    );
  }
  for (const consent of bundle.contributionConsents) {
    if (consent.workerId !== bundle.workerId) {
      throw new Error(`Contribution consent Worker mismatch: ${consent.consentId}`);
    }
    if (!pinIds.has(consent.artifactPinRef)) {
      throw new Error(
        `Contribution consent has dangling artifact pin: ${consent.consentId}`,
      );
    }
    if (!validRange(consent.consentedVersionRange)) {
      throw new Error(`Invalid consented version range: ${consent.consentId}`);
    }
    const expectedSurface =
      consent.contributionKind === "instructions"
        ? "worker_instructions"
        : "worker_lifecycle_hooks";
    if (consent.projectionSurface !== expectedSurface) {
      throw new Error(
        `Contribution consent surface mismatch: ${consent.consentId}`,
      );
    }
    if (consent.evidenceRefs.length === 0) {
      throw new Error(`Contribution consent lacks evidence: ${consent.consentId}`);
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
      if (!resolved) throw new Error(`Resolved Card missing for pin ${pin.artifactId}`);
      if (
        resolved.card.version !== pin.version ||
        normalizeDigest(resolved.card.integrity) !== normalizeDigest(pin.integrity)
      ) {
        throw new Error(`Resolved Card identity mismatch for pin ${pin.artifactId}`);
      }
      if (
        !satisfies(resolved.card.version, consent.consentedVersionRange, {
          includePrerelease: true,
        })
      ) {
        throw new Error(`Instruction consent version mismatch: ${consent.consentId}`);
      }
      const contribution = resolveExplicitInstructionContribution(
        resolved.card,
        resolved.contentRoot,
      );
      if (!contribution) {
        throw new Error(`Explicit instructions missing for pin ${pin.artifactId}`);
      }
      if (
        normalizeDigest(contribution.contentDigest) !==
        normalizeDigest(consent.contentDigest)
      ) {
        throw new Error(`Instruction content digest mismatch: ${consent.consentId}`);
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
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${canonicalJson(child)}`,
      )
      .join(",")}}`;
  }
  throw new Error("OrgWorkerBundleV1 contains a non-canonical value");
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
  resolvedCards: readonly {
    card: CardLockEntry;
    contentRoot: string;
  }[];
}): FrozenOrgWorkerBundleInstallReceipt {
  const activePin = input.bundle.artifactPins.find(
    (pin) => pin.artifactId === input.bundle.activeWorkerRoot,
  );
  if (
    !activePin ||
    activePin.kind !== "worker_root" ||
    activePin.name !== input.activeWorker
  ) {
    throw new Error(
      "Frozen OrgWorkerBundleV1 active Worker does not match the selected project Worker",
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
      throw new Error(`Frozen artifact pin is unresolved: ${pin.artifactId}`);
    }
    if (
      resolved.card.origin === "file" ||
      resolved.card.origin === "npm"
    ) {
      throw new Error(
        `Frozen install forbids local or package substitution origin for ${pin.artifactId}`,
      );
    }
    if (
      resolved.card.version !== pin.version ||
      normalizeDigest(resolved.card.integrity) !==
        normalizeDigest(pin.integrity)
    ) {
      throw new Error(
        `Frozen artifact identity mismatch for ${pin.artifactId}`,
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
    bundleDigest: `sha256:${createHash("sha256")
      .update(canonicalJson(input.bundle))
      .digest("hex")}`,
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
