// ABOUTME: Proves managed instruction blocks preserve unrelated user bytes and fail closed on malformed markers.
// ABOUTME: Covers LF/CRLF insertion, replacement, removal, and marker ambiguity.

import { describe, expect, test } from "bun:test";

import {
  parseManagedBlock,
  removeManagedBlock,
  upsertManagedBlock,
} from "../cli/core/managed-block";

const markers = {
  start: "<!-- drwn:instructions:start -->",
  end: "<!-- drwn:instructions:end -->",
};

describe("managed block", () => {
  test("reports absence and preserves newline metadata", () => {
    expect(parseManagedBlock(new TextEncoder().encode("user\r\n"), markers)).toMatchObject({
      state: "absent",
      newline: "\r\n",
      hasFinalNewline: true,
    });
  });

  test("inserts, replaces, and removes without changing surrounding bytes", () => {
    const original = new TextEncoder().encode("before\r\n\0after");
    const inserted = upsertManagedBlock(original, "managed\r\n", markers);
    const parsed = parseManagedBlock(inserted, markers);
    expect(parsed.state).toBe("present");
    if (parsed.state !== "present") throw new Error("expected present");
    expect(new TextDecoder().decode(parsed.before)).toBe("");
    expect(parsed.after).toEqual(original);

    const replaced = upsertManagedBlock(inserted, "replacement\r\n", markers);
    expect(new TextDecoder().decode(replaced)).toContain("replacement\r\n");
    expect(removeManagedBlock(replaced, markers)).toEqual(original);
  });

  test.each([
    ["start only", `user\n${markers.start}\n`],
    ["end only", `user\n${markers.end}\n`],
    [
      "duplicate",
      `${markers.start}\na\n${markers.end}\n${markers.start}\nb\n${markers.end}\n`,
    ],
    ["reversed", `${markers.end}\n${markers.start}\n`],
    [
      "nested",
      `${markers.start}\n${markers.start}\na\n${markers.end}\n${markers.end}\n`,
    ],
  ])("fails closed for %s markers", (_name, input) => {
    expect(parseManagedBlock(new TextEncoder().encode(input), markers)).toMatchObject({
      state: "malformed",
    });
    expect(() =>
      upsertManagedBlock(new TextEncoder().encode(input), "replacement\n", markers),
    ).toThrow(/malformed/i);
  });
});
