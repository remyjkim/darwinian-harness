// ABOUTME: Verifies strict frozen consumption of the Architect/Foundry OrgWorkerBundleV1 boundary.
// ABOUTME: Rejects dangling references, lifecycle overclaim, credentials, and instruction-content mismatch.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import {
  parseOrgWorkerBundleV1,
  verifyFrozenOrgWorkerBundleInstall,
  verifyOrgWorkerBundleInstructions,
} from "../cli/core/org-worker-bundle-v1";
import type { CardLockEntry } from "../cli/core/card-lock";
import { resolveExplicitInstructionContribution } from "../cli/core/instruction-contribution";

async function golden() {
  return JSON.parse(
    await readFile(
      new URL("./fixtures/org-worker-bundle-v1/gtm.valid.json", import.meta.url),
      "utf8",
    ),
  );
}

describe("OrgWorkerBundleV1 consumer", () => {
  test("parses the frozen producer golden without organization authority leakage", async () => {
    const fixtureUrl = new URL(
      "./fixtures/org-worker-bundle-v1/gtm.valid.json",
      import.meta.url,
    );
    const packet = JSON.parse(
      await readFile(
        new URL("./fixtures/org-worker-bundle-v1/packet.json", import.meta.url),
        "utf8",
      ),
    );
    const fixtureBytes = await readFile(fixtureUrl);
    expect(createHash("sha256").update(fixtureBytes).digest("hex")).toBe(
      packet.fixtureSha256,
    );
    const parsed = parseOrgWorkerBundleV1(JSON.parse(fixtureBytes.toString("utf8")));
    expect(parsed.wireVersion).toBe("org-worker-bundle@1");
    expect(parsed.workerId).toBe("worker:gtm-operator");
    expect(JSON.stringify(parsed)).not.toMatch(
      /authorityGrants|protocols|readinessClaim|credentialState/i,
    );
  });

  test("rejects dangling pins, mismatched Worker consent, and lifecycle overclaim", async () => {
    const dangling = await golden();
    dangling.activeWorkerRoot = "artifact:not-real";
    expect(() => parseOrgWorkerBundleV1(dangling)).toThrow(/active worker root/i);

    const wrongWorker = await golden();
    wrongWorker.contributionConsents[0].workerId = "worker:other";
    expect(() => parseOrgWorkerBundleV1(wrongWorker)).toThrow(/worker mismatch/i);

    const overclaim = { ...(await golden()), readiness: "ready" };
    expect(() => parseOrgWorkerBundleV1(overclaim)).toThrow();

    const credential = await golden();
    credential.projectOverlay = { apiKey: "not-a-real-secret" };
    expect(() => parseOrgWorkerBundleV1(credential)).toThrow(/forbidden/i);
  });

  test("verifies resolved explicit Card bytes against exact pin and consent digests", async () => {
    const base: CardLockEntry = {
      name: "gtm-worker",
      requested: "1.0.0",
      version: "1.0.0",
      path: "/unused",
      integrity:
        "sha256-2222222222222222222222222222222222222222222222222222222222222222",
      manifest: {
        name: "gtm-worker",
        version: "1.0.0",
        instructions: { text: "reviewed instructions" },
      },
      skills: [],
      hooks: [],
      registry: null,
      origin: "file",
    };
    const contribution = resolveExplicitInstructionContribution(base, "/unused")!;
    const candidate = await golden();
    candidate.contributionConsents[0].contentDigest =
      contribution.contentDigest.replace("sha256-", "sha256:");

    const verified = verifyOrgWorkerBundleInstructions(
      parseOrgWorkerBundleV1(candidate),
      [{ card: base, contentRoot: "/unused" }],
    );
    expect(verified).toEqual([
      {
        artifactPinRef: "artifact:gtm-worker-root",
        cardName: "gtm-worker",
        contentDigest: contribution.contentDigest,
        consentId: "consent:gtm-instructions",
      },
    ]);

    candidate.contributionConsents[0].contentDigest = `sha256:${"0".repeat(64)}`;
    expect(() =>
      verifyOrgWorkerBundleInstructions(
        parseOrgWorkerBundleV1(candidate),
        [{ card: base, contentRoot: "/unused" }],
      ),
    ).toThrow(/content digest/i);
  });

  test("produces a deterministic frozen-install receipt and rejects local substitution", async () => {
    const card: CardLockEntry = {
      name: "gtm-worker",
      requested: "git:approved/gtm-worker#v1.0.0",
      version: "1.0.0",
      path: "/unused",
      integrity:
        "sha256-2222222222222222222222222222222222222222222222222222222222222222",
      manifest: {
        name: "gtm-worker",
        version: "1.0.0",
        instructions: { text: "reviewed instructions" },
      },
      skills: [],
      hooks: [],
      registry: null,
      origin: "git",
      git: {
        commit: "a".repeat(40),
        url: "https://example.invalid/approved/gtm-worker.git",
      },
    };
    const contribution = resolveExplicitInstructionContribution(
      card,
      "/unused",
    )!;
    const candidate = await golden();
    candidate.contributionConsents[0].contentDigest =
      contribution.contentDigest.replace("sha256-", "sha256:");
    const bundle = parseOrgWorkerBundleV1(candidate);

    const first = verifyFrozenOrgWorkerBundleInstall({
      bundle,
      activeWorker: "gtm-worker",
      resolvedCards: [{ card, contentRoot: "/unused" }],
    });
    const second = verifyFrozenOrgWorkerBundleInstall({
      bundle,
      activeWorker: "gtm-worker",
      resolvedCards: [{ card, contentRoot: "/unused" }],
    });
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      wireVersion: "org-worker-bundle-install-receipt@1",
      workerId: "worker:gtm-operator",
      activeWorker: "gtm-worker",
      verifiedArtifactPins: ["artifact:gtm-worker-root"],
      verifiedInstructionConsents: ["consent:gtm-instructions"],
    });

    expect(() =>
      verifyFrozenOrgWorkerBundleInstall({
        bundle,
        activeWorker: "gtm-worker",
        resolvedCards: [
          { card: { ...card, origin: "file" }, contentRoot: "/unused" },
        ],
      }),
    ).toThrow(/frozen.*origin/i);
  });
});
