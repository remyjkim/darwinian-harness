// ABOUTME: Pins mergeOpencodeConfigText ownership, drift, and passthrough semantics.
// ABOUTME: opencode.json is a user-owned file; drwn owns only its mcp servers.

import { describe, expect, test } from "bun:test";
import {
  mergeOpencodeConfigText,
  mergeOpencodeSkillsPathsText,
  mcpServerHashKey,
  OPENCODE_SKILLS_PATHS_FIELD,
} from "../cli/core/mcp";
import { OPENCODE_PROJECT_SKILLS_DIR } from "../cli/core/paths";
import { canonicalJsonHash } from "../cli/core/managed-fields";
import type { RegistryServer } from "../cli/core/types";

function servers(): Record<string, RegistryServer> {
  return {
    context7: {
      description: "Docs",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      optional: false,
    },
  };
}

function userConfigText() {
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    plugin: ["opencode-wakatime"],
    tools: { "mymcp*": false },
    mcp: { "user-own": { type: "local", command: ["my-tool"] } },
  });
}

describe("mergeOpencodeConfigText", () => {
  test("merges servers under mcp and preserves every other user key", () => {
    const { text, fieldHashes } = mergeOpencodeConfigText(userConfigText(), servers());
    const parsed = JSON.parse(text);
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.plugin).toEqual(["opencode-wakatime"]);
    expect(parsed.tools).toEqual({ "mymcp*": false });
    expect(parsed.mcp["user-own"]).toEqual({ type: "local", command: ["my-tool"] });
    expect(parsed.mcp.context7).toMatchObject({ type: "local", enabled: true });
    expect(Object.keys(fieldHashes)).toEqual([mcpServerHashKey("context7")]);
  });

  test("owned-server drift throws without force", () => {
    const first = mergeOpencodeConfigText(userConfigText(), servers());
    const tampered = JSON.parse(first.text);
    tampered.mcp.context7.command = ["tampered"];
    expect(() =>
      mergeOpencodeConfigText(JSON.stringify(tampered), servers(), { priorFieldHashes: first.fieldHashes }),
    ).toThrow(/Drift detected in OpenCode managed MCP server/);
  });

  test("force overwrites drifted owned servers", () => {
    const first = mergeOpencodeConfigText(userConfigText(), servers());
    const tampered = JSON.parse(first.text);
    tampered.mcp.context7.command = ["tampered"];
    const merged = mergeOpencodeConfigText(JSON.stringify(tampered), servers(), {
      priorFieldHashes: first.fieldHashes,
      force: true,
    });
    expect(JSON.parse(merged.text).mcp.context7.command).toEqual(["npx", "-y", "@upstash/context7-mcp"]);
  });

  test("owned servers removed from the registry are deleted only when untampered", () => {
    const first = mergeOpencodeConfigText(userConfigText(), servers());
    const clean = mergeOpencodeConfigText(first.text, {}, { priorFieldHashes: first.fieldHashes });
    expect(JSON.parse(clean.text).mcp.context7).toBeUndefined();
    expect(JSON.parse(clean.text).mcp["user-own"]).toBeDefined();

    const tampered = JSON.parse(first.text);
    tampered.mcp.context7.command = ["tampered"];
    const preserved = mergeOpencodeConfigText(JSON.stringify(tampered), {}, { priorFieldHashes: first.fieldHashes });
    expect(JSON.parse(preserved.text).mcp.context7).toEqual({ ...tampered.mcp.context7 });
  });

  test("field hashes reflect the rendered server value", () => {
    const { text, fieldHashes } = mergeOpencodeConfigText("{}", servers());
    const parsed = JSON.parse(text);
    expect(fieldHashes[mcpServerHashKey("context7")]).toBe(canonicalJsonHash(parsed.mcp.context7));
  });
});

describe("mergeOpencodeSkillsPathsText", () => {
  test("appends the dedicated dir to skills.paths preserving user keys and paths", () => {
    const input = JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-wakatime"],
      skills: { paths: ["my-own-skills"], urls: ["https://example.com/skill.md"] },
    });
    const { text, fieldHashes } = mergeOpencodeSkillsPathsText(input);
    const parsed = JSON.parse(text);
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.plugin).toEqual(["opencode-wakatime"]);
    expect(parsed.skills.urls).toEqual(["https://example.com/skill.md"]);
    expect(parsed.skills.paths).toEqual(["my-own-skills", OPENCODE_PROJECT_SKILLS_DIR]);
    expect(fieldHashes).toEqual({
      [OPENCODE_SKILLS_PATHS_FIELD]: canonicalJsonHash(OPENCODE_PROJECT_SKILLS_DIR),
    });
  });

  test("creates skills.paths when absent", () => {
    const { text } = mergeOpencodeSkillsPathsText("{}");
    expect(JSON.parse(text).skills.paths).toEqual([OPENCODE_PROJECT_SKILLS_DIR]);
  });

  test("is byte-idempotent", () => {
    const once = mergeOpencodeSkillsPathsText(JSON.stringify({ skills: { paths: ["mine"] } }));
    const twice = mergeOpencodeSkillsPathsText(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.fieldHashes).toEqual(once.fieldHashes);
  });

  test("composes with the mcp merge without disturbing either key", () => {
    const merged = mergeOpencodeConfigText(userConfigText(), servers());
    const declared = mergeOpencodeSkillsPathsText(merged.text);
    const parsed = JSON.parse(declared.text);
    expect(parsed.mcp.context7).toMatchObject({ type: "local", enabled: true });
    expect(parsed.mcp["user-own"]).toEqual({ type: "local", command: ["my-tool"] });
    expect(parsed.skills.paths).toEqual([OPENCODE_PROJECT_SKILLS_DIR]);
  });
});
