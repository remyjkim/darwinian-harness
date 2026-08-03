// ABOUTME: Verifies checksum-pinned directory snapshots before fresh-project Worker materialization.
// ABOUTME: Covers bundle bijection, canonical tree identity, path confinement, and symlink rejection without network access.

import { afterEach, describe, expect, test } from "bun:test";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeWorkerArtifactGitTreeSha,
  computeWorkerArtifactSnapshotDigest,
  computeWorkerArtifactTreeDigest,
  parseWorkerArtifactSnapshotV1,
  verifyWorkerArtifactSnapshot,
} from "../cli/core/org-worker-artifact-snapshot";
import { computeCardIntegrity } from "../cli/core/card-store";
import {
  computeOrgWorkerBundleDigest,
  parseOrgWorkerBundleV1,
} from "../cli/core/org-worker-bundle-v1";

async function readJson(relativePath: string) {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  );
}

async function goldenBundle() {
  return parseOrgWorkerBundleV1(
    await readJson("./fixtures/org-worker-bundle-v1/gtm.valid.json"),
  );
}

async function validSnapshotCandidate() {
  return await readJson(
    "./fixtures/org-worker-materialization-v1/snapshot.valid.json",
  );
}

async function negativeFixtures() {
  return (await readJson(
    "./fixtures/org-worker-materialization-v1/snapshot.negatives.json",
  )) as {
    wireVersion: string;
    fixtures: Array<{
      id: string;
      mutation: string;
      expectedCode: string;
    }>;
  };
}

const packetRoot = fileURLToPath(
  new URL(
    "./fixtures/org-worker-materialization-v1/packet-root/",
    import.meta.url,
  ),
);

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

async function tempPacket() {
  const root = await mkdtemp(join(tmpdir(), "worker-artifact-snapshot-"));
  tempRoots.push(root);
  const packet = join(root, "packet");
  await cp(packetRoot, packet, { recursive: true });
  return { root, packet };
}

async function packetWithComposedMember(options?: {
  memberKind?: "card" | "blueprint";
}) {
  const { packet } = await tempPacket();
  const rootPath = join(packet, "artifacts", "gtm-worker-root");
  const memberPath = join(packet, "artifacts", "operator-member");
  await writeFile(
    join(rootPath, "card.json"),
    '{"name":"gtm-worker","version":"1.0.0","kind":"blueprint","composedFrom":["operator-member@1.0.0"]}\n',
  );
  await mkdir(memberPath);
  await writeFile(
    join(memberPath, "card.json"),
    `${JSON.stringify({
      name: "operator-member",
      version: "1.0.0",
      ...(options?.memberKind === "blueprint"
        ? { kind: "blueprint" }
        : {}),
    })}\n`,
  );
  const rootIntegrity = (await computeCardIntegrity(rootPath)).replace(
    "sha256-",
    "sha256:",
  );
  const memberIntegrity = (await computeCardIntegrity(memberPath)).replace(
    "sha256-",
    "sha256:",
  );
  const rootTree = await computeWorkerArtifactTreeDigest(rootPath);
  const memberTree = await computeWorkerArtifactTreeDigest(memberPath);
  const rootTreeSha = await computeWorkerArtifactGitTreeSha(rootPath);
  const memberTreeSha = await computeWorkerArtifactGitTreeSha(memberPath);

  const bundleCandidate = await readJson(
    "./fixtures/org-worker-bundle-v1/gtm.valid.json",
  );
  bundleCandidate.artifactPins[0].integrity = rootIntegrity;
  bundleCandidate.artifactPins.push({
    artifactId: "artifact:operator-member",
    kind: "card",
    name: "operator-member",
    version: "1.0.0",
    integrity: memberIntegrity,
    origin: "release:operator-member",
    provenanceRefs: [],
    resolutionSnapshotRef: "resolution:operator-member",
  });
  const bundle = parseOrgWorkerBundleV1(bundleCandidate);
  const snapshotCandidate = await validSnapshotCandidate();
  Object.assign(snapshotCandidate.artifacts[0], {
    integrity: rootIntegrity,
    treeSha: rootTreeSha,
    contentTreeDigest: rootTree.digest,
  });
  snapshotCandidate.artifacts.push({
    artifactPinRef: "artifact:operator-member",
    kind: "card",
    name: "operator-member",
    version: "1.0.0",
    integrity: memberIntegrity,
    treeSha: memberTreeSha,
    gitCommit: "c".repeat(40),
    contentFormat: "darwinian-card-tree-directory@1",
    contentTreeDigest: memberTree.digest,
    contentPath: "artifacts/operator-member",
  });
  snapshotCandidate.sourceBundleDigest =
    computeOrgWorkerBundleDigest(bundle);
  return { bundle, packet, snapshotCandidate };
}

function mutateSnapshot(
  candidate: Record<string, any>,
  mutation: string,
): Record<string, any> {
  const first = candidate.artifacts[0];
  switch (mutation) {
    case "wrong_wire_version":
      candidate.wireVersion = "worker-artifact-snapshot@2";
      break;
    case "wrong_source_bundle_digest":
      candidate.sourceBundleDigest = `sha256:${"0".repeat(64)}`;
      break;
    case "missing_artifact":
      candidate.artifacts = [];
      break;
    case "duplicate_artifact":
      candidate.artifacts.push(structuredClone(first));
      break;
    case "extra_artifact":
      candidate.artifacts.push({
        ...structuredClone(first),
        artifactPinRef: "artifact:extra",
        kind: "card",
        name: "extra",
      });
      break;
    case "wrong_kind":
      first.kind = "card";
      break;
    case "wrong_name":
      first.name = "another-worker";
      break;
    case "wrong_version":
      first.version = "1.0.1";
      break;
    case "wrong_integrity":
      first.integrity = `sha256:${"0".repeat(64)}`;
      break;
    case "uppercase_tree_sha":
      first.treeSha = "A".repeat(40);
      break;
    case "short_tree_sha":
      first.treeSha = "a".repeat(39);
      break;
    case "wrong_tree_sha":
      first.treeSha = "0".repeat(40);
      break;
    case "uppercase_git_commit":
      first.gitCommit = "B".repeat(40);
      break;
    case "short_git_commit":
      first.gitCommit = "b".repeat(39);
      break;
    case "wrong_content_format":
      first.contentFormat = "archive@1";
      break;
    case "absolute_content_path":
      first.contentPath = "/private/foreign-card-tree";
      break;
    case "traversal_content_path":
      first.contentPath = "../foreign-card-tree";
      break;
    case "missing_content_directory":
      first.contentPath = "artifacts/missing";
      break;
    case "wrong_tree_digest":
      first.contentTreeDigest = `sha256:${"0".repeat(64)}`;
      break;
    case "unknown_mutable_source":
      first.sourceUrl = "https://mutable.invalid/latest";
      break;
    default:
      throw new Error(`Unknown fixture mutation: ${mutation}`);
  }
  return candidate;
}

describe("Worker artifact snapshot V1", () => {
  test("parses and verifies the frozen directory snapshot against the bundle", async () => {
    const snapshot = parseWorkerArtifactSnapshotV1(
      await validSnapshotCandidate(),
    );

    const result = await verifyWorkerArtifactSnapshot({
      bundle: await goldenBundle(),
      snapshot,
      packetRoot,
    });

    expect(result).toEqual({
      sourceBundleDigest:
        "sha256:6597b05cdad254375332d56a23f4d052c61bae6c8836b3f24e0f80c8eb4eaa48",
      verifiedArtifacts: [
        {
          artifactPinRef: "artifact:gtm-worker-root",
          kind: "worker_root",
          name: "gtm-worker",
          version: "1.0.0",
          integrity:
            "sha256:dc71165b300a88ab4bafd0bc6a32dc82afe106ac2b40102ac08cd74985edc092",
          requestedRef: "gtm-worker@1.0.0",
          treeSha: "1fb0a826d6fc73bb52c0a22e6e2925e2783701a5",
          gitCommit: "bbd7924d12a1cf8818755ea49c1858875e7bdac7",
          contentTreeDigest:
            "sha256:a06bee250bd14c0e505a8b881c75bdafe1d17711fe5d9b44adaf16c5db590ce0",
          contentPath: "artifacts/gtm-worker-root",
          contentRoot: join(packetRoot, "artifacts", "gtm-worker-root"),
          manifest: {
            name: "gtm-worker",
            version: "1.0.0",
            kind: "blueprint",
            instructions: { path: "instructions.md" },
          },
        },
      ],
    });
  });

  test("requires artifact entries to be uniquely UTF-16 sorted by pin", async () => {
    const { snapshotCandidate } = await packetWithComposedMember();
    snapshotCandidate.artifacts.reverse();

    expect(() =>
      parseWorkerArtifactSnapshotV1(snapshotCandidate),
    ).toThrow(
      expect.objectContaining({
        code: "ORG_WORKER_ARTIFACT_SNAPSHOT_INVALID",
      }),
    );
  });

  test("hashes canonical sorted regular-file entries with the frozen tree domain", async () => {
    const result = await computeWorkerArtifactTreeDigest(
      fileURLToPath(
        new URL(
          "./fixtures/org-worker-materialization-v1/packet-root/artifacts/gtm-worker-root/",
          import.meta.url,
        ),
      ),
    );

    expect(result).toEqual({
      digest:
        "sha256:a06bee250bd14c0e505a8b881c75bdafe1d17711fe5d9b44adaf16c5db590ce0",
      entries: [
        {
          relativePath: "card.json",
          byteLength: 101,
          sha256:
            "sha256:22d31a3963c4d9fbe66d1e82b6fc7b98d802f8ec739e337595ebcaeba7b59000",
        },
        {
          relativePath: "instructions.md",
          byteLength: 22,
          sha256:
            "sha256:5f35dbf8972723a994b65ae1f9b2e93fd9762bfcdd4171a624b80f1620526429",
        },
        {
          relativePath: "skills/operator/SKILL.md",
          byteLength: 11,
          sha256:
            "sha256:19f34ff77987601dcb7a4b7361916c2fd6504d5d2d37fbc9b0a13cc2ac87b9e5",
        },
      ],
    });
  });

  test("independently derives the frozen Git tree identity from directory bytes and modes", async () => {
    expect(
      await computeWorkerArtifactGitTreeSha(
        join(packetRoot, "artifacts", "gtm-worker-root"),
      ),
    ).toBe("1fb0a826d6fc73bb52c0a22e6e2925e2783701a5");
  });

  test("digests the complete corrected snapshot with its frozen domain", async () => {
    expect(
      computeWorkerArtifactSnapshotDigest(
        parseWorkerArtifactSnapshotV1(
          await validSnapshotCandidate(),
        ),
      ),
    ).toBe(
      "sha256:b77d54d032c0b02e42413a720086bca5cb21dc9cf1aa5921cfa3ea699897f086",
    );
  });

  test("rejects the frozen structural, identity, path, and digest negative matrix", async () => {
    const matrix = await negativeFixtures();
    expect(matrix.wireVersion).toBe(
      "worker-artifact-snapshot-negative-fixtures@1",
    );

    for (const fixture of matrix.fixtures) {
      const candidate = mutateSnapshot(
        structuredClone(await validSnapshotCandidate()),
        fixture.mutation,
      );
      let rejection: unknown;
      try {
        await verifyWorkerArtifactSnapshot({
          bundle: await goldenBundle(),
          snapshot: parseWorkerArtifactSnapshotV1(candidate),
          packetRoot,
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection, fixture.id).toMatchObject({
        code: fixture.expectedCode,
      });
      expect((rejection as Error).message, fixture.id).not.toContain(packetRoot);
      expect((rejection as Error).message, fixture.id).not.toContain(
        "mutable.invalid",
      );
    }
  });

  test("rejects file and directory symlinks anywhere in an artifact tree", async () => {
    for (const kind of ["file", "directory"] as const) {
      const { root, packet } = await tempPacket();
      const artifactRoot = join(packet, "artifacts", "gtm-worker-root");
      const foreign =
        kind === "file"
          ? join(root, "foreign.md")
          : join(root, "foreign-directory");
      if (kind === "file") {
        await writeFile(foreign, "private bytes\n");
      } else {
        await mkdir(foreign);
        await writeFile(join(foreign, "private.md"), "private bytes\n");
      }
      await symlink(
        foreign,
        join(artifactRoot, kind === "file" ? "linked.md" : "linked-directory"),
        kind === "file" ? "file" : "dir",
      );

      let rejection: unknown;
      try {
        await verifyWorkerArtifactSnapshot({
          bundle: await goldenBundle(),
          snapshot: parseWorkerArtifactSnapshotV1(
            await validSnapshotCandidate(),
          ),
          packetRoot: packet,
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection, kind).toMatchObject({
        code: "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
      });
      expect((rejection as Error).message, kind).not.toContain(root);
      expect((rejection as Error).message, kind).not.toContain("private bytes");
    }
  });

  test("rejects non-regular filesystem entries in an artifact tree", async () => {
    if (process.platform === "win32") return;
    const { root, packet } = await tempPacket();
    const fifoPath = join(
      packet,
      "artifacts",
      "gtm-worker-root",
      "unsupported.fifo",
    );
    const mkfifo = Bun.spawn(["mkfifo", fifoPath], {
      stdout: "ignore",
      stderr: "pipe",
    });
    const stderr = await new Response(mkfifo.stderr).text();
    expect(await mkfifo.exited, stderr).toBe(0);

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle: await goldenBundle(),
        snapshot: parseWorkerArtifactSnapshotV1(
          await validSnapshotCandidate(),
        ),
        packetRoot: packet,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
    });
    expect((rejection as Error).message).not.toContain(root);
  });

  test("rejects transferred Git metadata and generated integrity state", async () => {
    for (const reservedName of [".git", ".integrity"]) {
      const { root, packet } = await tempPacket();
      const artifactRoot = join(packet, "artifacts", "gtm-worker-root");
      if (reservedName === ".git") {
        await mkdir(join(artifactRoot, reservedName));
        await writeFile(
          join(artifactRoot, reservedName, "config"),
          "private remote metadata\n",
        );
      } else {
        await writeFile(
          join(artifactRoot, reservedName),
          "generated state\n",
        );
      }

      let rejection: unknown;
      try {
        await verifyWorkerArtifactSnapshot({
          bundle: await goldenBundle(),
          snapshot: parseWorkerArtifactSnapshotV1(
            await validSnapshotCandidate(),
          ),
          packetRoot: packet,
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection, reservedName).toMatchObject({
        code: "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
      });
      expect((rejection as Error).message, reservedName).not.toContain(root);
      expect((rejection as Error).message, reservedName).not.toContain(
        "private remote metadata",
      );
    }
  });

  test("rejects symlinked, relative, missing, or non-directory packet roots", async () => {
    const { root, packet } = await tempPacket();
    const packetLink = join(root, "packet-link");
    const packetFile = join(root, "packet-file");
    await symlink(packet, packetLink, "dir");
    await writeFile(packetFile, "not a packet directory\n");

    for (const invalidRoot of [
      packetLink,
      "relative-packet-root",
      join(root, "missing"),
      packetFile,
    ]) {
      let rejection: unknown;
      try {
        await verifyWorkerArtifactSnapshot({
          bundle: await goldenBundle(),
          snapshot: parseWorkerArtifactSnapshotV1(
            await validSnapshotCandidate(),
          ),
          packetRoot: invalidRoot,
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection, invalidRoot).toMatchObject({
        code: "ORG_WORKER_ARTIFACT_PACKET_ROOT_INVALID",
      });
      expect((rejection as Error).message, invalidRoot).not.toContain(
        invalidRoot,
      );
    }
  });

  test("rejects a symlink or regular file used as the declared content directory", async () => {
    const { root, packet } = await tempPacket();
    const artifactRoot = join(packet, "artifacts", "gtm-worker-root");
    const contentLink = join(packet, "artifacts", "content-link");
    await symlink(artifactRoot, contentLink, "dir");

    for (const [contentPath, expectedCode] of [
      [
        "artifacts/content-link",
        "ORG_WORKER_ARTIFACT_SYMLINK_UNSUPPORTED",
      ],
      [
        "artifacts/gtm-worker-root/card.json",
        "ORG_WORKER_ARTIFACT_CONTENT_UNSUPPORTED",
      ],
    ]) {
      const candidate = await validSnapshotCandidate();
      candidate.artifacts[0].contentPath = contentPath;
      let rejection: unknown;
      try {
        await verifyWorkerArtifactSnapshot({
          bundle: await goldenBundle(),
          snapshot: parseWorkerArtifactSnapshotV1(candidate),
          packetRoot: packet,
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection, contentPath).toMatchObject({ code: expectedCode });
      expect((rejection as Error).message, contentPath).not.toContain(root);
    }
  });

  test("rejects control characters in bounded snapshot identifiers without diagnostic injection", async () => {
    const candidate = await validSnapshotCandidate();
    candidate.artifacts.push({
      ...structuredClone(candidate.artifacts[0]),
      artifactPinRef: "artifact:\nforged",
      kind: "card",
      name: "forged",
    });

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle: await goldenBundle(),
        snapshot: parseWorkerArtifactSnapshotV1(candidate),
        packetRoot,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_SNAPSHOT_INVALID",
    });
    expect((rejection as Error).message).not.toContain("\n");
  });

  test("verifies a valid snapshot without invoking network fetch", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = Object.assign(
      () => {
        calls += 1;
        throw new Error("network access is forbidden");
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle: await goldenBundle(),
        snapshot: parseWorkerArtifactSnapshotV1(
          await validSnapshotCandidate(),
        ),
        packetRoot,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toBe(0);
  });

  test("runs the exact compatibility profile before artifact verification", async () => {
    const bundleCandidate = await readJson(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
    );
    bundleCandidate.artifactPins.push({
      artifactId: "artifact:runtime",
      kind: "runtime_package",
      name: "runtime",
      version: "1.0.0",
      integrity: `sha256:${"4".repeat(64)}`,
      origin: "release:runtime",
      provenanceRefs: [],
      resolutionSnapshotRef: "resolution:runtime",
    });
    const bundle = parseOrgWorkerBundleV1(bundleCandidate);
    const snapshotCandidate = await validSnapshotCandidate();
    snapshotCandidate.sourceBundleDigest =
      computeOrgWorkerBundleDigest(bundle);

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle,
        snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
        packetRoot,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_KIND_UNSUPPORTED",
    });
  });

  test("recomputes Worker Card integrity instead of trusting matching declarations", async () => {
    const bundleCandidate = await readJson(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
    );
    bundleCandidate.artifactPins[0].integrity =
      `sha256:${"2".repeat(64)}`;
    const bundle = parseOrgWorkerBundleV1(bundleCandidate);
    const snapshotCandidate = await validSnapshotCandidate();
    snapshotCandidate.sourceBundleDigest =
      computeOrgWorkerBundleDigest(bundle);
    snapshotCandidate.artifacts[0].integrity =
      `sha256:${"2".repeat(64)}`;

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle,
        snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
        packetRoot,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
    });
  });

  test("requires a worker_root directory to contain the exact Blueprint manifest identity", async () => {
    const { packet } = await tempPacket();
    const artifactRoot = join(packet, "artifacts", "gtm-worker-root");
    await writeFile(
      join(artifactRoot, "card.json"),
      '{"name":"gtm-worker","version":"1.0.0"}\n',
    );
    const actualIntegrity = (await computeCardIntegrity(artifactRoot)).replace(
      "sha256-",
      "sha256:",
    );
    const actualTree = await computeWorkerArtifactTreeDigest(artifactRoot);
    const actualTreeSha =
      await computeWorkerArtifactGitTreeSha(artifactRoot);
    const bundleCandidate = await readJson(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
    );
    bundleCandidate.artifactPins[0].integrity = actualIntegrity;
    const bundle = parseOrgWorkerBundleV1(bundleCandidate);
    const snapshotCandidate = await validSnapshotCandidate();
    Object.assign(snapshotCandidate.artifacts[0], {
      integrity: actualIntegrity,
      contentTreeDigest: actualTree.digest,
      treeSha: actualTreeSha,
    });
    snapshotCandidate.sourceBundleDigest =
      computeOrgWorkerBundleDigest(bundle);

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle,
        snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
        packetRoot: packet,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
    });
  });

  test("rejects a bundle Card pin outside the exact root composedFrom closure", async () => {
    const { packet } = await tempPacket();
    const cardRoot = join(packet, "artifacts", "unreferenced-card");
    await mkdir(cardRoot);
    await writeFile(
      join(cardRoot, "card.json"),
      '{"name":"unreferenced-card","version":"1.0.0"}\n',
    );
    const integrity = (await computeCardIntegrity(cardRoot)).replace(
      "sha256-",
      "sha256:",
    );
    const tree = await computeWorkerArtifactTreeDigest(cardRoot);
    const treeSha = await computeWorkerArtifactGitTreeSha(cardRoot);
    const bundleCandidate = await readJson(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
    );
    bundleCandidate.artifactPins.push({
      artifactId: "artifact:unreferenced-card",
      kind: "card",
      name: "unreferenced-card",
      version: "1.0.0",
      integrity,
      origin: "release:unreferenced-card",
      provenanceRefs: [],
      resolutionSnapshotRef: "resolution:unreferenced-card",
    });
    const bundle = parseOrgWorkerBundleV1(bundleCandidate);
    const snapshotCandidate = await validSnapshotCandidate();
    snapshotCandidate.artifacts.push({
      artifactPinRef: "artifact:unreferenced-card",
      kind: "card",
      name: "unreferenced-card",
      version: "1.0.0",
      integrity,
      treeSha,
      gitCommit: "c".repeat(40),
      contentFormat: "darwinian-card-tree-directory@1",
      contentTreeDigest: tree.digest,
      contentPath: "artifacts/unreferenced-card",
    });
    snapshotCandidate.sourceBundleDigest =
      computeOrgWorkerBundleDigest(bundle);

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle,
        snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
        packetRoot: packet,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
    });
  });

  test("accepts the exact complete union of Blueprint composedFrom members", async () => {
    const { bundle, packet, snapshotCandidate } =
      await packetWithComposedMember();

    const result = await verifyWorkerArtifactSnapshot({
      bundle,
      snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
      packetRoot: packet,
    });

    expect(
      result.verifiedArtifacts.map(({ artifactPinRef }) => artifactPinRef),
    ).toEqual([
      "artifact:gtm-worker-root",
      "artifact:operator-member",
    ]);
  });

  test("rejects a root composedFrom member missing from the bundle closure", async () => {
    const { packet } = await packetWithComposedMember();
    const bundleCandidate = await readJson(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
    );
    const rootPath = join(packet, "artifacts", "gtm-worker-root");
    bundleCandidate.artifactPins[0].integrity = (
      await computeCardIntegrity(rootPath)
    ).replace("sha256-", "sha256:");
    const bundle = parseOrgWorkerBundleV1(bundleCandidate);
    const snapshotCandidate = await validSnapshotCandidate();
    Object.assign(snapshotCandidate.artifacts[0], {
      integrity: bundle.artifactPins[0]!.integrity,
      treeSha: await computeWorkerArtifactGitTreeSha(rootPath),
      contentTreeDigest: (
        await computeWorkerArtifactTreeDigest(rootPath)
      ).digest,
    });
    snapshotCandidate.sourceBundleDigest =
      computeOrgWorkerBundleDigest(bundle);

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle,
        snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
        packetRoot: packet,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_CLOSURE_MISMATCH",
    });
  });

  test("rejects a Blueprint supplied for a bundle Card member pin", async () => {
    const { bundle, packet, snapshotCandidate } =
      await packetWithComposedMember({ memberKind: "blueprint" });

    let rejection: unknown;
    try {
      await verifyWorkerArtifactSnapshot({
        bundle,
        snapshot: parseWorkerArtifactSnapshotV1(snapshotCandidate),
        packetRoot: packet,
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: "ORG_WORKER_ARTIFACT_IDENTITY_MISMATCH",
    });
  });
});
