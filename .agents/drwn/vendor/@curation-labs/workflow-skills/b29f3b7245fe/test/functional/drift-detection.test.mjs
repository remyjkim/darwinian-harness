// ABOUTME: Functional test — exercises the upstream drift detection via `drwn card source sync --check`.
// ABOUTME: Closes gap: drift detection never exercised.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnDrwn, CARD_NAME, CARD_ROOT } from "./helpers.mjs";

describe("upstream drift detection", () => {
  it("sync --check exits successfully and returns JSON", () => {
    const { stdout, exitCode } = spawnDrwn([
      "card", "source", "sync", "--check", "--json", CARD_NAME,
    ]);

    assert.equal(exitCode, 0, `sync --check must exit 0. stderr: ${stdout}`);
  });

  it("returns a result for all 13 skills (synced/stale/moved)", () => {
    const { stdout } = spawnDrwn([
      "card", "source", "sync", "--check", "--json", CARD_NAME,
    ]);

    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      assert.fail(`sync --check must output valid JSON. Got: ${stdout.slice(0, 500)}`);
    }

    // The output shape is { synced: [...], stale: [...], moved: [...] }.
    // Each array contains skill names. Verify all 13 skills are accounted for.
    const synced = data.synced ?? [];
    const stale = data.stale ?? [];
    const moved = data.moved ?? [];
    const allSkills = [...synced, ...stale, ...moved];
    assert.equal(allSkills.length, 13, `expected 13 total skill results, got ${allSkills.length}`);
  });

  it("upstream refs point to the darwinian-worker git remote", () => {
    const cardJson = JSON.parse(readFileSync(join(CARD_ROOT, "card.json"), "utf8"));
    const upstream = JSON.stringify(cardJson.skills?.upstream ?? {});
    assert.ok(
      /darwinian-worker\.git/.test(upstream),
      "card.json upstream refs must reference darwinian-worker.git",
    );
  });
});
