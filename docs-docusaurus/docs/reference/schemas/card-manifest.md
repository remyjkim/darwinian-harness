---
sidebar_position: 3
---

# Card Manifest

On disk: `card.json` at the root of a card source tree (`~/.agents/drwn/sources/<scope>/<name>/card.json`) or a published/consumed card tree.

Purpose: the manifest a card carries. Declares the card's identity, versioned skill and MCP contributions, target defaults, extension intent, and authoring-quality metadata.

## Type

`CardManifest` (`cli/core/card-manifest.ts:7-22`).

## Example

```json
{
  "$schema": "https://drwn.dev/schemas/card-manifest-v1.json",
  "name": "@your-handle/backend",
  "version": "1.2.0",
  "description": "Backend reviewer + release-notes harness for the api team.",
  "license": "MIT",
  "harness": { "minVersion": "0.1.0" },
  "bundles": {
    "@drwn/reviewer": "^2.0.0"
  },
  "skills": {
    "include": ["reviewer", "release-notes"]
  },
  "servers": {
    "context7": { "enabled": true }
  },
  "extensions": {
    "parallel": { "enabled": true, "skills": true }
  },
  "targets": {
    "claude": { "enabled": true },
    "codex":  { "enabled": true }
  },
  "stability": "stable",
  "lastValidatedWith": "0.1.0",
  "testStatusBadge": "https://github.com/me/backend/actions/workflows/test.yml/badge.svg"
}
```

## Fields

All validation lives in `validateCardManifest` (`cli/core/card-manifest.ts:50-109`); the asserting form is `assertValidCardManifest` (`card-manifest.ts:111-116`).

| Field | Type | Required | Meaning | Enforced at |
|---|---|---|---|---|
| `$schema` | `string` | no | Optional JSON-schema URL hint for editors. Not validated by drwn. | `cli/core/card-manifest.ts:8` |
| `name` | `string` | yes | `@scope/name` or unscoped `name`. Matches `@[a-z0-9-]+/[a-z0-9-]+` or `[a-z0-9-]+`. | `card-manifest.ts:56-60` (`isCardScopeName`, `isCardUnscopedName`) |
| `version` | `string` | yes | Strict semver. Pre-release and build metadata follow `isStrictSemver`. | `card-manifest.ts:61-65` |
| `description` | `string` | no | Free-form short description. | `card-manifest.ts:11` |
| `license` | `string` | no | SPDX-style identifier. Free-form; not validated. | `card-manifest.ts:12` |
| `harness.minVersion` | `string` | no | Strict semver. Minimum drwn version this card needs at consume time. | `card-manifest.ts:66-68` |
| `bundles` | `Record<string, string>` | no | Map of bundle package name to semver range. Each range must pass `validRange`. | `card-manifest.ts:98-102` |
| `skills.include` | `string[]` | no | Skill directories shipped in this card to include. Must be an array. | `card-manifest.ts:88-90` |
| `skills.exclude` | `—` | **forbidden** | Rejected: cards do not exclude — they include. | `card-manifest.ts:85-87` |
| `skills.shared` | `string[]` | reserved | Must be omitted or empty. Reserved for Wave 2 registry references. | `card-manifest.ts:91-97` |
| `servers` | `Record<string, ServerOverride>` | no | Same `ServerOverride` shape as project config: toggle or full `RegistryServer`. | Type: `cli/core/types.ts:82-84` |
| `extensions` | `Record<string, ProjectExtensionConfig>` | no | Per-extension intent the card wants to project into consumers. | Type: `cli/core/types.ts:86-93` |
| `targets` | `Partial<Record<TargetName, { enabled: boolean }>>` | no | Per-target enablement default the card prefers. Only `claude`, `codex`, `cursor` accepted. | `card-manifest.ts:103-107` |
| `hooks.include` | `string[]` | no | Hook policy names shipped in this card. Each name refers to a `hooks/<name>/policy.ts` relative to the card source root. Activated when the consumer runs `drwn card trust <name> --hooks`. | `card-manifest.ts:38` |
| `instructions` | `{ text: string }` or `{ path: string }` | no | Explicit Worker guidance. Exactly one inline or Card-relative source; projection requires `drwn card trust <name> --instructions`. | `card-manifest.ts` |
| `persona` | `{ include?: string[]; visibility?: "private" \| "internal" \| "public" }` | no | Persona content declaration. Each entry in `include` refers to a `persona/<entry>/PERSONA.md`. | `card-manifest.ts:20,39` |
| `beliefs` | `{ include?: string[]; visibility?: "private" \| "internal" \| "public" }` | no | Belief content declaration. Each entry in `include` refers to a `beliefs/<entry>/BELIEF.md`. | `card-manifest.ts:21,40` |
| `memory` | `Partial<Record<"l4" \| "l5" \| "l6", { include?: string[]; visibility?: ...; format?: "md" \| "jsonl" \| "mixed" }>>` | no | Memory layer declarations. Each key is a layer (`l4`, `l5`, `l6`); entries refer to directories under `memory/<layer>/<entry>/`. | `card-manifest.ts:23-27,41` |
| `stability` | `"experimental" \| "stable" \| "production"` | no | Authoring quality signal. | `card-manifest.ts:69-74` |
| `lastValidatedWith` | `string` | no | Strict semver of the drwn version the author last validated this card with. | `card-manifest.ts:75-79` |
| `testStatusBadge` | `string` | no | http(s) URL to a CI status badge image. | `card-manifest.ts:80-84` |

### Mind content example

```json
{
  "name": "@your-handle/mind",
  "version": "1.0.0",
  "hooks": { "include": ["audit-tool-calls"] },
  "persona": { "include": ["voice"], "visibility": "internal" },
  "beliefs": { "include": ["engineering"], "visibility": "public" },
  "memory": {
    "l4": { "include": ["context"], "visibility": "private", "format": "md" },
    "l6": { "include": ["raw"], "visibility": "private", "format": "jsonl" }
  }
}
```

## Reserved and Forbidden

- **`skills.exclude`** is rejected outright. Cards contribute additively; consumers exclude via project config.
- **`skills.shared`** is reserved. The validator accepts an empty array but rejects any non-empty value with a Wave 2 reservation message (`card-manifest.ts:91-97`). Today, cards only ship bundled skill directories under `skills.include`.

## Quality Fields (Wave 2)

`stability`, `lastValidatedWith`, and `testStatusBadge` are surfaced by `drwn card show`, `drwn card source show`, and search results. They are advisory: drwn does not gate publication on them. Authoring helpers like `drwn card source set --stability ... --last-validated-with ... --test-status-badge ...` write them in.

## Related

- [Card Spec](../specs/card-spec) — the contract for refs, lockfile entries, and integrity
- [Project Config JSON](./project-config-json) — where consumed card refs live
- [Cards concept](../../concepts/cards) — authoring and consumption flow
