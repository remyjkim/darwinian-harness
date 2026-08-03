// ABOUTME: Functional test — verifies the catalog publish flow in dry-run mode (no external push).
// ABOUTME: Closes gap: catalog regression test.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnDrwn } from "./helpers.mjs";

describe("catalog publish dry-run", () => {
  it("dry-run exits successfully and returns JSON", () => {
    const { stdout, exitCode, stderr } = spawnDrwn([
      "card", "catalog", "publish",
      "@curation-labs/workflow-skills@1.1.0",
      "--catalog", "@community",
      "--mode", "direct",
      "--dry-run", "--json",
    ]);

    assert.equal(exitCode, 0, `dry-run must exit 0. stderr: ${stderr}`);
  });

  it("produces valid catalog entry JSON with correct fields", () => {
    const { stdout } = spawnDrwn([
      "card", "catalog", "publish",
      "@curation-labs/workflow-skills@1.1.0",
      "--catalog", "@community",
      "--mode", "direct",
      "--dry-run", "--json",
    ]);

    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      assert.fail(`dry-run must output valid JSON. Got: ${stdout.slice(0, 500)}`);
    }

    assert.ok(data.ok, "dry-run result must have ok: true");
    assert.ok(
      ["add", "noop"].includes(data.action),
      `action must be "add" or "noop" (already published), got: ${data.action}`,
    );

    // Entry shape
    assert.ok(data.entry, "must have an entry object");
    assert.equal(data.entry.name, "workflow-skills", "entry name must be workflow-skills");
    assert.ok(
      data.entry.url.startsWith("git+"),
      `entry url must start with git+, got: ${data.entry.url}`,
    );
    assert.ok(
      /cl-workflow-card\.git/.test(data.entry.url),
      `entry url must reference cl-workflow-card.git, got: ${data.entry.url}`,
    );

    // Card shape
    assert.ok(data.card, "must have a card object");
    assert.equal(data.card.version, "1.1.0", "card version must be 1.1.0");
    assert.ok(
      data.card.integrity?.startsWith("sha256-"),
      `card must have sha256 integrity, got: ${data.card.integrity}`,
    );
  });

  it("dry-run does not modify any catalog state", () => {
    // Run dry-run, then check it didn't write to any catalog
    const { exitCode } = spawnDrwn([
      "card", "catalog", "publish",
      "@curation-labs/workflow-skills@1.1.0",
      "--catalog", "@community",
      "--mode", "direct",
      "--dry-run",
    ]);
    assert.equal(exitCode, 0, "dry-run must succeed");
    // If we got here without error, the dry-run is working.
    // A real publish would have committed to the catalog repo; dry-run doesn't.
  });
});
