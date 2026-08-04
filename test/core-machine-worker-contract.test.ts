// ABOUTME: Pins the recommended machine Worker descriptor and immutable Blueprint closure.
// ABOUTME: Rejects floating refs, non-Blueprint roots, coordinate drift, and member substitution.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  MACHINE_WORKER_REGISTRY,
  RECOMMENDED_MACHINE_WORKER,
  assertRecommendedMachineWorkerGraph,
  loadMachineWorkerRegistry,
  parseMachineWorkerRegistry,
} from "../cli/core/machine-worker-contract";

const repoRoot = join(import.meta.dir, "..");

describe("recommended machine Worker contract", () => {
  test("loads one strict versioned descriptor with immutable release refs", async () => {
    const registry = await loadMachineWorkerRegistry(repoRoot);

    expect(registry).toEqual(JSON.parse(JSON.stringify(MACHINE_WORKER_REGISTRY)));
    expect(registry).toEqual({
      schema: "drwn.machine-workers",
      schemaVersion: 1,
      workers: [{
        ...RECOMMENDED_MACHINE_WORKER,
        members: [...RECOMMENDED_MACHINE_WORKER.members],
      }],
    });
    expect(RECOMMENDED_MACHINE_WORKER).toMatchObject({
      id: "machine-defaults",
      displayName: "Recommended Machine Defaults",
      name: "@curation-labs/machine-defaults",
      version: "2.0.0",
      source: "git+https://github.com/curation-labs/machine-defaults.git#v2.0.0",
      minDrwnVersion: "1.1.0",
      members: [
        {
          name: "@darwinian/operator",
          source: "git+https://github.com/curation-labs/darwinian-operator.git#v2.0.2",
          commit: "b62965fde417fa1715d98d5c10fd45012c6cc05b",
          treeSha: "7340729d0e4de604e51d4f341b299fa4004788a2",
          integrity: "sha256-51503533bd60943e5ba16873f129bd600f42c2553084e29d1770e43a7e858999",
        },
        {
          name: "@curation-labs/workflow-skills",
          source: "git+https://github.com/curation-labs/cl-workflow-card.git#v1.0.1",
          commit: "794ba29aef03e66a1532f871d7a83263acf3df9c",
          treeSha: "ce9f230f9222d44640b4123e200128ed6c210829",
          integrity: "sha256-8f7b935e904cb91d82a5f4d3c2ed1b30f7d70444f5b76930118a5a3ae1fd92c2",
        },
        {
          name: "@remyjkim/knowledge-docs",
          source: "git+https://github.com/remyjkim/knowledge-docs-card.git#v1.0.0",
          commit: "6f3a7cf96c1887d920c00aa61f997d8aa1b46cf0",
          treeSha: "61315160ba47c1a5ebfdefc74a4cba267952476c",
          integrity: "sha256-b4035ef528c60ca21ecdf43caf3b40c5abdbb1f7676495030529bc42d29646a0",
        },
      ],
    });
    expect(RECOMMENDED_MACHINE_WORKER.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(RECOMMENDED_MACHINE_WORKER.treeSha).toMatch(/^[a-f0-9]{40}$/);
    expect(RECOMMENDED_MACHINE_WORKER.integrity).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  test("rejects floating refs, identity drift, and a weakened version floor", () => {
    for (const registry of [
      {
        ...MACHINE_WORKER_REGISTRY,
        workers: [{ ...RECOMMENDED_MACHINE_WORKER, source: "git+https://github.com/curation-labs/machine-defaults.git" }],
      },
      {
        ...MACHINE_WORKER_REGISTRY,
        workers: [{ ...RECOMMENDED_MACHINE_WORKER, name: "@curation-labs/substitute" }],
      },
      {
        ...MACHINE_WORKER_REGISTRY,
        workers: [{ ...RECOMMENDED_MACHINE_WORKER, minDrwnVersion: "1.0.0" }],
      },
      {
        ...MACHINE_WORKER_REGISTRY,
        workers: [{
          ...RECOMMENDED_MACHINE_WORKER,
          members: RECOMMENDED_MACHINE_WORKER.members.map((member, index) =>
            index === 0 ? { ...member, source: member.source.replace("#v2.0.2", "#main") } : member),
        }],
      },
    ]) {
      expect(() => parseMachineWorkerRegistry(registry)).toThrow();
    }
  });

  test("accepts only the exact resolved Blueprint closure", () => {
    const descriptor = RECOMMENDED_MACHINE_WORKER;
    const graph = {
      roots: [{
        name: descriptor.name,
        requested: descriptor.source,
        kind: "blueprint" as const,
        members: descriptor.members.map((member) => member.name),
      }],
      cards: [
        {
          name: descriptor.name,
          requested: descriptor.source,
          version: descriptor.version,
          integrity: descriptor.integrity,
          treeSha: descriptor.treeSha,
          manifest: {
            name: descriptor.name,
            version: descriptor.version,
            kind: "blueprint" as const,
            composedFrom: descriptor.members.map((member) => member.source),
            harness: { minVersion: descriptor.minDrwnVersion },
            lastValidatedWith: descriptor.minDrwnVersion,
          },
          git: {
            url: "https://github.com/curation-labs/machine-defaults.git",
            ref: "v2.0.0",
            commit: descriptor.commit,
          },
        },
        ...descriptor.members.map((member) => ({
          name: member.name,
          requested: member.source,
          version: member.source.split("#v")[1]!,
          integrity: member.integrity,
          treeSha: member.treeSha,
          manifest: { name: member.name, version: member.source.split("#v")[1]! },
          git: {
            url: member.source.slice(4).split("#")[0]!,
            ref: member.source.split("#")[1]!,
            commit: member.commit,
          },
        })),
      ],
    };

    expect(() => assertRecommendedMachineWorkerGraph(graph)).not.toThrow();
    expect(() => assertRecommendedMachineWorkerGraph({
      ...graph,
      roots: [{ ...graph.roots[0]!, kind: "card" as const }],
    })).toThrow();
    expect(() => assertRecommendedMachineWorkerGraph({
      ...graph,
      cards: graph.cards.slice(0, -1),
    })).toThrow();
    for (const field of ["integrity", "treeSha"] as const) {
      expect(() => assertRecommendedMachineWorkerGraph({
        ...graph,
        cards: graph.cards.map((card, index) =>
          index === 1 ? { ...card, [field]: field === "integrity" ? `sha256-${"f".repeat(64)}` : "f".repeat(40) } : card),
      })).toThrow();
    }
    expect(() => assertRecommendedMachineWorkerGraph({
      ...graph,
      cards: graph.cards.map((card, index) =>
        index === 1 ? { ...card, git: { ...card.git!, commit: "f".repeat(40) } } : card),
    })).toThrow();
  });
});
