// ABOUTME: Verifies immutable directory-backed Card trees supplied with an OrgWorkerBundleV1.
// ABOUTME: Binds exact artifact identities and canonical regular-file bytes without network resolution.

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";

import {
  assertValidCardManifest,
  type CardManifest,
} from "./card-manifest";
import { computeCardIntegrity, parseCardRef } from "./card-store";
import { DrwnError } from "./errors";
import { assertOrgWorkerCompatibility } from "./org-worker-compatibility";
import {
  computeOrgWorkerBundleDigest,
  type OrgWorkerBundleV1,
} from "./org-worker-bundle-v1";
import { satisfies } from "./semver-utils";

export const WORKER_ARTIFACT_TREE_DIGEST_DOMAIN =
  "darwinian:worker-artifact-tree:v1\n";
export const WORKER_ARTIFACT_SNAPSHOT_DIGEST_DOMAIN =
  "darwinian:worker-artifact-snapshot:v1\n";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const gitObjectId = z.string().regex(/^[a-f0-9]{40}$/);
const boundedText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .regex(/^[^\u0000-\u001f\u007f]+$/);
const artifact = z
  .object({
    artifactPinRef: boundedText(160),
    kind: z.enum(["worker_root", "card"]),
    name: boundedText(160),
    version: boundedText(80),
    integrity: digest,
    treeSha: gitObjectId,
    gitCommit: gitObjectId,
    contentFormat: z.literal("darwinian-card-tree-directory@1"),
    contentTreeDigest: digest,
    contentPath: boundedText(512),
  })
  .strict();
const snapshotSchema = z
  .object({
    wireVersion: z.literal("worker-artifact-snapshot@1"),
    sourceBundleDigest: digest,
    artifacts: z.array(artifact).max(128),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const pins = snapshot.artifacts.map(
      ({ artifactPinRef }) => artifactPinRef,
    );
    const sorted = [...pins].sort();
    if (
      new Set(pins).size !== pins.length ||
      pins.some((pin, index) => pin !== sorted[index])
    ) {
      context.addIssue({
        code: "custom",
        message:
          "artifact entries must be uniquely UTF-16 sorted by pin",
      });
    }
  });

export type WorkerArtifactSnapshotV1 = z.infer<typeof snapshotSchema>;

export interface WorkerArtifactTreeEntry {
  relativePath: string;
  byteLength: number;
  sha256: `sha256:${string}`;
}

export interface VerifiedWorkerArtifactSnapshotV1 {
  sourceBundleDigest: `sha256:${string}`;
  verifiedArtifacts: Array<{
    artifactPinRef: string;
    kind: "worker_root" | "card";
    name: string;
    version: string;
    integrity: `sha256:${string}`;
    requestedRef: string;
    treeSha: string;
    gitCommit: string;
    contentTreeDigest: `sha256:${string}`;
    contentPath: string;
    contentRoot: string;
    manifest: CardManifest;
  }>;
}

/** Deterministic JSON serialization: keys sorted recursively, stable across
 *  engines and property-insertion order. Shared by the snapshot, bundle, and
 *  materialization-request digest domains so every hash in this boundary is
 *  canonical, not `JSON.stringify`-order-dependent. */
export function canonicalJson(value: unknown): string {
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
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("Worker artifact tree contains a non-canonical value");
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitObjectSha(type: "blob" | "tree", bytes: Uint8Array): Buffer {
  return createHash("sha1")
    .update(`${type} ${bytes.byteLength}\0`)
    .update(bytes)
    .digest();
}

export async function computeWorkerArtifactGitTreeSha(
  contentRoot: string,
): Promise<string> {
  const walk = async (directory: string, isRoot: boolean): Promise<Buffer> => {
    const entries: Array<{
      name: string;
      directory: boolean;
      mode: string;
      objectId: Buffer;
    }> = [];
    for (const name of await readdir(directory)) {
      if (isRoot && (name === ".git" || name === ".integrity")) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
          "Worker artifact tree contains reserved generated state",
        );
      }
      const path = join(directory, name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
          "Worker artifact tree contains a symlink",
        );
      }
      if (stats.isDirectory()) {
        entries.push({
          name,
          directory: true,
          mode: "40000",
          objectId: await walk(path, false),
        });
      } else if (stats.isFile()) {
        const bytes = await readFile(path);
        entries.push({
          name,
          directory: false,
          mode: (stats.mode & 0o111) !== 0 ? "100755" : "100644",
          objectId: gitObjectSha("blob", bytes),
        });
      } else {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
          "Worker artifact tree contains non-regular content",
        );
      }
    }
    entries.sort((left, right) =>
      Buffer.compare(
        Buffer.from(`${left.name}${left.directory ? "/" : ""}`),
        Buffer.from(`${right.name}${right.directory ? "/" : ""}`),
      ),
    );
    const body = Buffer.concat(
      entries.flatMap((entry) => [
        Buffer.from(`${entry.mode} ${entry.name}\0`),
        entry.objectId,
      ]),
    );
    return gitObjectSha("tree", body);
  };

  let rootStats;
  try {
    rootStats = await lstat(contentRoot);
  } catch {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_BYTES_MISSING",
      "Worker artifact tree is missing",
    );
  }
  if (rootStats.isSymbolicLink()) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
      "Worker artifact tree contains a symlink",
    );
  }
  if (!rootStats.isDirectory()) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
      "Worker artifact tree must be a directory",
    );
  }
  return (await walk(contentRoot, true)).toString("hex");
}

function normalizeIntegrity(value: string): string {
  return value.replace(/^sha256-/, "sha256:");
}

export function parseWorkerArtifactSnapshotV1(
  candidate: unknown,
): WorkerArtifactSnapshotV1 {
  const parsed = snapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_SNAPSHOT_INVALID",
      "Worker artifact snapshot is malformed or unsupported",
    );
  }
  return parsed.data;
}

export function computeWorkerArtifactSnapshotDigest(
  snapshot: WorkerArtifactSnapshotV1,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(WORKER_ARTIFACT_SNAPSHOT_DIGEST_DOMAIN)
    .update(canonicalJson(snapshot))
    .digest("hex")}`;
}

export async function computeWorkerArtifactTreeDigest(
  contentRoot: string,
): Promise<{
  digest: `sha256:${string}`;
  entries: WorkerArtifactTreeEntry[];
}> {
  let contentRootStats;
  try {
    contentRootStats = await lstat(contentRoot);
  } catch {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_BYTES_MISSING",
      "Worker artifact tree is missing",
    );
  }
  if (contentRootStats.isSymbolicLink()) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
      "Worker artifact tree contains a symlink",
    );
  }
  if (!contentRootStats.isDirectory()) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
      "Worker artifact tree must be a directory",
    );
  }
  const entries: WorkerArtifactTreeEntry[] = [];
  const walk = async (directory: string, isRoot: boolean) => {
    for (const name of await readdir(directory)) {
      if (isRoot && (name === ".git" || name === ".integrity")) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
          "Worker artifact tree contains reserved generated state",
        );
      }
      const path = join(directory, name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
          "Worker artifact tree contains a symlink",
        );
      }
      if (stats.isDirectory()) {
        await walk(path, false);
      } else if (stats.isFile()) {
        const bytes = await readFile(path);
        entries.push({
          relativePath: relative(contentRoot, path).replace(/\\/g, "/"),
          byteLength: bytes.byteLength,
          sha256: sha256(bytes),
        });
      } else {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
          "Worker artifact tree contains non-regular content",
        );
      }
    }
  };
  await walk(contentRoot, true);
  entries.sort(({ relativePath: left }, { relativePath: right }) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return {
    digest: `sha256:${createHash("sha256")
      .update(WORKER_ARTIFACT_TREE_DIGEST_DOMAIN)
      .update(canonicalJson(entries))
      .digest("hex")}`,
    entries,
  };
}

export async function verifyWorkerArtifactSnapshot(input: {
  bundle: OrgWorkerBundleV1;
  snapshot: WorkerArtifactSnapshotV1;
  packetRoot: string;
}): Promise<VerifiedWorkerArtifactSnapshotV1> {
  assertOrgWorkerCompatibility({ bundle: input.bundle });
  if (!isAbsolute(input.packetRoot)) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_PACKET_ROOT_INVALID",
      "Worker artifact packet root must be an absolute concrete directory",
    );
  }
  let packetRootStats;
  try {
    packetRootStats = await lstat(input.packetRoot);
  } catch {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_PACKET_ROOT_INVALID",
      "Worker artifact packet root must be an absolute concrete directory",
    );
  }
  if (
    packetRootStats.isSymbolicLink() ||
    !packetRootStats.isDirectory()
  ) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_PACKET_ROOT_INVALID",
      "Worker artifact packet root must be an absolute concrete directory",
    );
  }
  const bundleDigest = computeOrgWorkerBundleDigest(input.bundle);
  if (input.snapshot.sourceBundleDigest !== bundleDigest) {
    throw new DrwnError(
      "ORG_WORKER_BUNDLE_DIGEST_MISMATCH",
      "Worker artifact snapshot does not match the source bundle",
    );
  }
  const snapshotsByPin = new Map<
    string,
    WorkerArtifactSnapshotV1["artifacts"][number]
  >();
  for (const item of input.snapshot.artifacts) {
    if (snapshotsByPin.has(item.artifactPinRef)) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        `Duplicate artifact snapshot entry for pin ${item.artifactPinRef}`,
      );
    }
    snapshotsByPin.set(item.artifactPinRef, item);
  }
  const bundlePinIds = new Set(
    input.bundle.artifactPins.map(({ artifactId }) => artifactId),
  );
  for (const item of input.snapshot.artifacts) {
    if (!bundlePinIds.has(item.artifactPinRef)) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        `Artifact snapshot has an unexpected pin ${item.artifactPinRef}`,
      );
    }
  }
  const verifiedArtifacts = [];
  const manifestsByPin = new Map<
    string,
    {
      manifest: CardManifest;
      pin: OrgWorkerBundleV1["artifactPins"][number];
    }
  >();
  for (const pin of input.bundle.artifactPins) {
    const item = snapshotsByPin.get(pin.artifactId);
    if (!item) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_BYTES_MISSING",
        `Artifact bytes are missing for pin ${pin.artifactId}`,
      );
    }
    if (
      item.kind !== pin.kind ||
      item.name !== pin.name ||
      item.version !== pin.version ||
      item.integrity !== pin.integrity
    ) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        `Artifact identity does not match pin ${pin.artifactId}`,
      );
    }
    const normalizedContentPath = item.contentPath.replace(/\\/g, "/");
    if (
      normalizedContentPath !== item.contentPath ||
      isAbsolute(normalizedContentPath) ||
      /^[A-Za-z]:\//.test(normalizedContentPath) ||
      normalizedContentPath
        .split("/")
        .some((segment) => segment.length === 0 || segment === "." || segment === "..")
    ) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_PATH_INVALID",
        `Artifact content path is invalid for pin ${pin.artifactId}`,
      );
    }
    const contentRoot = resolve(input.packetRoot, normalizedContentPath);
    const relativeContentRoot = relative(input.packetRoot, contentRoot);
    if (
      relativeContentRoot === ".." ||
      relativeContentRoot.startsWith(
        `..${process.platform === "win32" ? "\\" : "/"}`,
      ) ||
      isAbsolute(relativeContentRoot)
    ) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_PATH_INVALID",
        `Artifact content path escapes the packet root for pin ${pin.artifactId}`,
      );
    }
    let currentPath = input.packetRoot;
    let rootStats = packetRootStats;
    for (const segment of normalizedContentPath.split("/")) {
      currentPath = join(currentPath, segment);
      try {
        rootStats = await lstat(currentPath);
      } catch {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_BYTES_MISSING",
          `Artifact bytes are missing for pin ${pin.artifactId}`,
        );
      }
      if (rootStats.isSymbolicLink()) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
          `Artifact content path contains a symlink for pin ${pin.artifactId}`,
        );
      }
    }
    if (!rootStats.isDirectory()) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
        `Artifact content is not a directory for pin ${pin.artifactId}`,
      );
    }
    let tree;
    try {
      tree = await computeWorkerArtifactTreeDigest(contentRoot);
    } catch (error) {
      if (error instanceof DrwnError) throw error;
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_BYTES_MISSING",
        `Artifact bytes could not be verified for pin ${pin.artifactId}`,
      );
    }
    if (tree.digest !== item.contentTreeDigest) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_TREE_DIGEST_MISMATCH",
        `Artifact tree digest does not match pin ${pin.artifactId}`,
      );
    }
    const treeSha = await computeWorkerArtifactGitTreeSha(contentRoot);
    if (treeSha !== item.treeSha) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_TREE_SHA_MISMATCH",
        `Artifact Git tree does not match pin ${pin.artifactId}`,
      );
    }
    let manifest: CardManifest;
    let actualIntegrity: string;
    try {
      actualIntegrity = normalizeIntegrity(
        await computeCardIntegrity(contentRoot),
      );
      const candidate = JSON.parse(
        await readFile(join(contentRoot, "card.json"), "utf8"),
      );
      assertValidCardManifest(candidate);
      manifest = candidate;
    } catch {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        `Artifact content identity does not match pin ${pin.artifactId}`,
      );
    }
    if (
      actualIntegrity !== normalizeIntegrity(pin.integrity) ||
      manifest.name !== pin.name ||
      manifest.version !== pin.version ||
      (pin.kind === "worker_root" && manifest.kind !== "blueprint") ||
      (pin.kind === "card" && manifest.kind === "blueprint")
    ) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
        `Artifact content identity does not match pin ${pin.artifactId}`,
      );
    }
    manifestsByPin.set(pin.artifactId, { manifest, pin });
    verifiedArtifacts.push({
      artifactPinRef: item.artifactPinRef,
      kind: item.kind,
      name: item.name,
      version: item.version,
      integrity: item.integrity as `sha256:${string}`,
      requestedRef: `${item.name}@${item.version}`,
      treeSha,
      gitCommit: item.gitCommit,
      contentTreeDigest: tree.digest,
      contentPath: normalizedContentPath,
      contentRoot,
      manifest,
    });
  }

  const cardPinsByName = new Map<
    string,
    OrgWorkerBundleV1["artifactPins"][number]
  >();
  for (const pin of input.bundle.artifactPins) {
    if (pin.kind !== "card") continue;
    if (cardPinsByName.has(pin.name)) {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
        "Worker artifact Card closure is ambiguous",
      );
    }
    cardPinsByName.set(pin.name, pin);
  }
  const referencedCardPinIds = new Set<string>();
  for (const rootPinId of input.bundle.orderedWorkerRoots) {
    const root = manifestsByPin.get(rootPinId);
    if (!root || root.pin.kind !== "worker_root") {
      throw new DrwnError(
        "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
        "Worker artifact root closure is incomplete",
      );
    }
    const rootMembers = new Set<string>();
    for (const memberRef of root.manifest.composedFrom ?? []) {
      let parsed;
      try {
        parsed = parseCardRef(memberRef);
      } catch {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
          "Worker artifact Card closure is invalid",
        );
      }
      const memberPin = cardPinsByName.get(parsed.name);
      if (
        parsed.origin !== "store" ||
        !memberPin ||
        !satisfies(memberPin.version, parsed.range, {
          includePrerelease: true,
        }) ||
        rootMembers.has(memberPin.artifactId)
      ) {
        throw new DrwnError(
          "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
          "Worker artifact Card closure does not match the root manifests",
        );
      }
      rootMembers.add(memberPin.artifactId);
      referencedCardPinIds.add(memberPin.artifactId);
    }
  }
  if (
    referencedCardPinIds.size !== cardPinsByName.size ||
    [...cardPinsByName.values()].some(
      (pin) => !referencedCardPinIds.has(pin.artifactId),
    )
  ) {
    throw new DrwnError(
      "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
      "Worker artifact Card closure does not match the root manifests",
    );
  }
  return {
    sourceBundleDigest: bundleDigest,
    verifiedArtifacts,
  };
}
