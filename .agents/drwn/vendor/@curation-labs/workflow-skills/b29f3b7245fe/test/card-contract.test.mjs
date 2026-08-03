// ABOUTME: Contract tests for card.json manifest shape and skill enumeration.
// ABOUTME: Asserts the card declares exactly the expected 13 skills, upstream refs, hooks, and instructions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCardJson, EXPECTED_SKILLS, CARD_ROOT, skillDir, readSkillMd } from "./helpers.mjs";

describe("card.json manifest", () => {
  it("has the correct name", () => {
    const card = loadCardJson();
    assert.equal(card.name, "@curation-labs/workflow-skills");
  });

  it("has version 1.1.0", () => {
    const card = loadCardJson();
    assert.equal(card.version, "1.1.0");
  });

  it("has a non-empty description", () => {
    const card = loadCardJson();
    assert.ok(card.description && card.description.length > 10, "description must be non-trivial");
  });

  it("declares exactly the 13 expected skills", () => {
    const card = loadCardJson();
    const include = card.skills?.include ?? [];
    assert.deepEqual(include.sort(), [...EXPECTED_SKILLS].sort());
  });

  it("does not use skills.exclude", () => {
    const card = loadCardJson();
    assert.equal(card.skills?.exclude, undefined, "skills.exclude should not be set");
  });

  it("does not use skills.shared", () => {
    const card = loadCardJson();
    assert.equal(card.skills?.shared, undefined, "skills.shared is reserved for Wave 2");
  });
});

describe("card.json upstream provenance", () => {
  it("has an upstream ref for every skill", () => {
    const card = loadCardJson();
    const upstream = card.skills?.upstream ?? {};
    for (const skillName of EXPECTED_SKILLS) {
      assert.ok(
        upstream[skillName],
        `skills.upstream must have an entry for "${skillName}"`,
      );
    }
  });

  it("upstream refs are git URLs (not local paths)", () => {
    const card = loadCardJson();
    const upstream = card.skills?.upstream ?? {};
    for (const [skillName, ref] of Object.entries(upstream)) {
      assert.ok(
        ref.startsWith("git+"),
        `upstream ref for "${skillName}" must be a git+ URL (got: ${ref})`,
      );
    }
  });
});

describe("card.json hooks", () => {
  it("declares the org-conventions hook", () => {
    const card = loadCardJson();
    const hooks = card.hooks?.include ?? [];
    assert.ok(
      hooks.includes("org-conventions"),
      'hooks.include must contain "org-conventions"',
    );
  });

  it("does not use hooks.exclude", () => {
    const card = loadCardJson();
    assert.equal(card.hooks?.exclude, undefined, "hooks.exclude should not be set");
  });
});

describe("card.json instructions", () => {
  it("points instructions.path to instructions.md", () => {
    const card = loadCardJson();
    assert.equal(card.instructions?.path, "instructions.md");
  });

  it("instructions.md file exists", () => {
    const path = join(CARD_ROOT, "instructions.md");
    assert.ok(existsSync(path), "instructions.md must exist at card root");
  });
});

describe("harness version", () => {
  it("declares a harness minVersion", () => {
    const card = loadCardJson();
    assert.ok(card.harness?.minVersion, "harness.minVersion must be set");
  });
});

describe("skill files exist", () => {
  for (const skillName of EXPECTED_SKILLS) {
    it(`"${skillName}" has a SKILL.md`, () => {
      const md = readSkillMd(skillName);
      assert.ok(md, `SKILL.md for "${skillName}" must exist`);
    });

    it(`"${skillName}" SKILL.md has YAML frontmatter with name`, () => {
      const md = readSkillMd(skillName);
      if (!md) return; // skip if missing — the previous test covers existence
      assert.ok(md.startsWith("---"), `"${skillName}" SKILL.md must start with YAML frontmatter`);
      const end = md.indexOf("\n---", 3);
      assert.ok(end !== -1, `"${skillName}" SKILL.md frontmatter must be closed`);
      const frontmatter = md.slice(4, end);
      assert.ok(
        /^name:\s*/m.test(frontmatter),
        `"${skillName}" SKILL.md frontmatter must have a name field`,
      );
    });
  }
});

describe("hook policy file exists", () => {
  it("hooks/org-conventions/policy.ts exists", () => {
    const path = join(CARD_ROOT, "hooks", "org-conventions", "policy.ts");
    assert.ok(existsSync(path), "hooks/org-conventions/policy.ts must exist");
  });
});
