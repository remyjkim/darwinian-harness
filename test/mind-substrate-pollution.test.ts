// ABOUTME: Preserves provider-independent local persona composition after backend retirement.
// ABOUTME: A capability substrate contributes no voice; only authored content Cards add fences.

import { expect, test } from "bun:test";
import { composePersona, parsePersona } from "../cli/core/mind-content/persona-composer";

interface LocalMindContent {
  name: string;
  persona: Array<{ entry: string; content: string }>;
}

const toolsShaped: LocalMindContent = {
  name: "@darwinian/mind-tools",
  persona: [],
};

const contentShaped: LocalMindContent = {
  name: "@x/figure-mind",
  persona: [{ entry: "voice", content: "# voice\n\nA distinctive, figure-specific voice.\n" }],
};

test("a provider-neutral capability Card contributes no persona fence", () => {
  const document = composePersona([toolsShaped, contentShaped].map((card) => ({ card: card.name, entries: card.persona })))!;
  const parsed = parsePersona(document);
  expect(parsed.sections).toHaveLength(1);
  expect(parsed.sections[0]?.card).toBe("@x/figure-mind");
  expect(parsed.outsideFences).toEqual([]);
  expect(document).not.toContain('card="@darwinian/mind-tools"');
});

test("a capability substrate carrying a persona would pollute local composition", () => {
  const polluted = {
    ...toolsShaped,
    name: "@darwinian/mind-card",
    persona: [{ entry: "voice", content: "# voice\n\nPlain speech.\n" }],
  };
  const document = composePersona([polluted, contentShaped].map((card) => ({ card: card.name, entries: card.persona })))!;
  expect(parsePersona(document).sections.map((section) => section.card))
    .toEqual(["@darwinian/mind-card", "@x/figure-mind"]);
});
