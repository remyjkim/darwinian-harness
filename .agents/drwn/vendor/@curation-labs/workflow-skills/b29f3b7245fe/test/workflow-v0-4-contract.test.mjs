// ABOUTME: Contract tests for the CL Issue-driven Workflow v0.4 state model.
// ABOUTME: Prevents regression to legacy Turn/Handoff behavior while preserving the Owner Received inbox.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_ROOT } from "./helpers.mjs";

const instructions = readFileSync(join(CARD_ROOT, "instructions.md"), "utf8");
const policy = readFileSync(
  join(CARD_ROOT, "hooks", "org-conventions", "policy.ts"),
  "utf8",
);
const contractSurface = `${instructions}\n${policy}`;

describe("workflow v0.4 minimum contract", () => {
  it("derives the issue title from the generated ID", () => {
    assert.match(contractSurface, /Create the issue row/);
    assert.match(contractSurface, /Read its generated \*\*ID\*\* property/);
    assert.match(contractSurface, /\[I<N>\] <title>/);
    assert.match(contractSurface, /Do not guess or preallocate an issue number/);
  });

  it("separates Owner Status from Reviewer Status", () => {
    assert.match(contractSurface, /Owner Status and Reviewer Status (?:move|advance) independently/);
    assert.match(contractSurface, /Owner (?:may|work may) advance/);
  });

  it("keeps only the earliest ready gate actionable", () => {
    assert.match(contractSurface, /earliest ready, unapproved gate/);
    assert.match(contractSurface, /G1 (?:→|->) G2 (?:→|->) G3/);
  });

  it("defines pass and changes-requested outcomes", () => {
    assert.match(contractSurface, /reviewer records either Passed or Changes requested[\s\S]*Owner Status = Received/i);
    assert.match(contractSurface, /pass surfaces the next ready, unapproved gate/i);
    assert.match(contractSurface, /changes requested[\s\S]*remove the gate from the reviewer queue/i);
    assert.match(contractSurface, /Owner acknowledges Received into Planning after a G1 pass/i);
    assert.match(contractSurface, /Architecting \/ Planning \/ Building after G1 \/ G2 \/ G3 changes/i);
  });

  it("uses Received only as the Owner review-result inbox", () => {
    assert.match(contractSurface, /Owner Status = Received/);
    assert.match(contractSurface, /Received is not a work phase/);
    assert.match(contractSurface, /does not restore Turn or Handoff/);
    assert.match(contractSurface, /not as the v0\.3 cross-person handoff status/);
  });

  it("requires the complete Notion state-change transaction", () => {
    for (const required of [
      "Issue Tracker property",
      "Issue Status",
      "Issue Thread",
    ]) {
      assert.ok(contractSurface.includes(required), `missing ${required}`);
    }
  });

  it("stacks Issue Thread entries below the conventions toggle", () => {
    assert.match(contractSurface, /📖 Issue Thread conventions/);
    assert.match(contractSurface, /stack (?:every )?(?:entry|entries) immediately below/i);
  });

  it("requires actual Notion user mentions for cross-person thread endpoints", () => {
    assert.match(contractSurface, /cross-person Issue Thread header/i);
    assert.match(contractSurface, /actual Notion user mentions/i);
    assert.match(contractSurface, /Owner and Reviewer properties/i);
    assert.match(contractSurface, /plain role labels, display names, and unlinked @name text are invalid/i);
  });

  it("records decisions without tagging a reviewer", () => {
    assert.match(contractSurface, /📝 Decision/);
    assert.match(contractSurface, /do not tag a reviewer/i);
    assert.match(contractSurface, /do not tag a reviewer or imply a handoff/i);
  });

  it("treats Slack as an alert rather than workflow state", () => {
    assert.match(contractSurface, /Slack (?:may alert|is an alert channel)/);
    assert.match(contractSurface, /not workflow state/);
  });

  it("rejects legacy Turn and Handoff mutation instructions", () => {
    assert.doesNotMatch(contractSurface, /Set (?:the )?Turn/);
    assert.doesNotMatch(contractSurface, /Set Status = Received/);
    assert.doesNotMatch(contractSurface, /Handoff = Received/);
  });
});
