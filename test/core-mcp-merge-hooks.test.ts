// ABOUTME: Verifies Claude settings merge manages hook configuration safely.
// ABOUTME: Protects hook drift detection and cleanup alongside MCP servers.

import { describe, expect, test } from "bun:test";
import { mergeClaudeSettingsText, removeOwnedClaudeHookFields } from "../cli/core/mcp";
import type { RegistryServer } from "../cli/core/types";

const server: RegistryServer = {
  description: "Docs",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@upstash/context7-mcp"],
  optional: false,
};

const hooks = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [{ type: "command" as const, command: "node", args: [".agents/drwn/generated/hooks/claude/composer.mjs"], timeout: 30 }],
    },
  ],
  PostToolUse: [
    {
      matcher: "Bash",
      hooks: [{ type: "command" as const, command: "node", args: [".agents/drwn/generated/hooks/claude/composer.mjs"], timeout: 30 }],
    },
  ],
};

describe("mergeClaudeSettingsText hooks", () => {
  test("adds hooks and records per-entry hook ownership", () => {
    const merged = mergeClaudeSettingsText(
      JSON.stringify({ model: "sonnet", mcpServers: { old: { command: "old" } } }, null, 2),
      { context7: server },
      { hooks },
    );
    const parsed = JSON.parse(merged.text);

    expect(parsed.model).toBe("sonnet");
    expect(parsed.mcpServers.context7.command).toBe("npx");
    expect(parsed.hooks).toEqual(hooks);
    expect(parsed._drwn.managedKeys).toEqual(["mcpServers"]);
    expect(parsed._drwn.fieldHashes.mcpServers).toStartWith("sha256-");
    expect(parsed._drwn.fieldHashes.hooks).toBeUndefined();
    expect(parsed._drwn.ownedHooks.PreToolUse["m:Bash"]).toStartWith("sha256-");
    expect(parsed._drwn.ownedHooks.PostToolUse["m:Bash"]).toStartWith("sha256-");
  });

  test("does not touch hooks when hooks option is omitted", () => {
    const withHooks = mergeClaudeSettingsText("{}", { context7: server }, { hooks });
    const withoutHooks = mergeClaudeSettingsText(withHooks.text, { context7: server });
    const parsed = JSON.parse(withoutHooks.text);

    expect(parsed.hooks).toEqual(hooks);
    expect(parsed._drwn.managedKeys).toEqual(["mcpServers"]);
    expect(parsed._drwn.ownedHooks.PreToolUse["m:Bash"]).toStartWith("sha256-");
  });

  test("cleans previously owned hooks when an empty hooks config is desired", () => {
    const withHooks = mergeClaudeSettingsText(
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Skill", hooks: [{ type: "command", command: "foreign" }] }] } }, null, 2),
      { context7: server },
      { hooks },
    );
    const withoutOwnedHooks = mergeClaudeSettingsText(withHooks.text, { context7: server }, { hooks: {} });
    const parsed = JSON.parse(withoutOwnedHooks.text);

    expect(parsed.hooks).toEqual({ PreToolUse: [{ matcher: "Skill", hooks: [{ type: "command", command: "foreign" }] }] });
    expect(parsed._drwn.managedKeys).toEqual(["mcpServers"]);
    expect(parsed._drwn.ownedHooks).toBeUndefined();
  });

  test("removes only named owned hook fields and preserves retained plus foreign entries", () => {
    const foreign = { matcher: "Bash", hooks: [{ type: "command" as const, command: "foreign" }] };
    const retained = { matcher: "Skill", hooks: [{ type: "command" as const, command: "signal" }] };
    const removed = { matcher: ".*", hooks: [{ type: "command" as const, command: "composer" }] };
    const withHooks = mergeClaudeSettingsText(
      JSON.stringify({ hooks: { PreToolUse: [foreign] } }),
      {},
      { hooks: { PreToolUse: [removed, retained], PostToolUse: [removed, retained] } },
    );

    const cleaned = removeOwnedClaudeHookFields(withHooks.text, [
      "hooks:PreToolUse:m:.*",
      "hooks:PostToolUse:m:.*",
    ]);
    const parsed = JSON.parse(cleaned);

    expect(parsed.hooks.PreToolUse).toEqual([foreign, retained]);
    expect(parsed.hooks.PostToolUse).toEqual([retained]);
    expect(parsed._drwn.ownedHooks.PreToolUse["m:.*"]).toBeUndefined();
    expect(parsed._drwn.ownedHooks.PreToolUse["m:Skill"]).toStartWith("sha256-");
    expect(parsed._drwn.ownedHooks.PostToolUse["m:Skill"]).toStartWith("sha256-");
  });

  test("refuses managed hook drift unless forced", () => {
    const merged = mergeClaudeSettingsText("{}", { context7: server }, { hooks });
    const edited = JSON.parse(merged.text);
    edited.hooks.PreToolUse[0].matcher = ".*";
    const editedText = `${JSON.stringify(edited, null, 2)}\n`;

    expect(() => mergeClaudeSettingsText(editedText, { context7: server }, { hooks })).toThrow("drwn-owned Claude hook entries");
    expect(() => mergeClaudeSettingsText(editedText, { context7: server }, { force: true, hooks })).not.toThrow();
  });
});
