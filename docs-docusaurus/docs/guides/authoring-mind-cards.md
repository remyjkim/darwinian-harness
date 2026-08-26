---
sidebar_position: 9
---

# Authoring Mind Cards

A mind card contributes beliefs, personas, memory, and hook policies to the agent's cognitive layer. This guide walks through creating a mind card from scratch and publishing it so other projects can install it.

## Prerequisites

- A registered card scope (`@your-handle`), or an unscoped name
- `drwn` 0.4.0 or later (mind card support requires lockfile v4)
- Git installed and accessible to `drwn`

## 1. Create a card source

```bash
drwn card new @your-handle/mind --into <card-collection> --no-git
```

This scaffolds an independent source repository at
`<card-collection>/mind/` with a minimal `card.json`. Use
`drwn card source show <card-collection>/mind` to inspect the initial state.

## 2. Add a belief

Beliefs are factual assertions the card author wants the agent to treat as given.

```bash
drwn card source add-belief <card-collection>/mind engineering --visibility public
```

Edit the scaffolded file at `<card-collection>/mind/beliefs/engineering/BELIEF.md`:

```markdown
- Prefer functional patterns over mutable state when the trade-off is neutral.
- Tests should exercise behaviour, not implementation details.
- Every public API needs a docstring.
```

Use `--visibility public` for beliefs you want any consumer to receive, `--visibility internal` for org-internal consumers, and `--visibility private` for content that should not be exported.

## 3. Add a persona

The persona shapes the agent's voice and engagement style.

```bash
drwn card source add-persona <card-collection>/mind voice --visibility internal
```

Edit `persona/voice/PERSONA.md`:

```markdown
You are a senior engineer reviewing code for correctness, clarity, and long-term
maintainability. You ask clarifying questions before suggesting large changes.
You default to the existing codebase's idioms rather than importing new patterns.
```

## 4. Add memory layers

Memory accumulates team or project knowledge across sessions.

```bash
# Short-term markdown memory (l4)
drwn card source add-memory <card-collection>/mind context --layer l4 --visibility private --format md

# Long-term structured memory (l6)
drwn card source add-memory <card-collection>/mind team-facts --layer l6 --visibility private --format jsonl
```

Edit the scaffolded files to populate initial content. L4 `md` files are plain markdown; L6 `jsonl` files are newline-delimited JSON objects.

## 5. Add a hook policy (optional)

Hook policies intercept tool calls at runtime.

```bash
drwn card source add-hook <card-collection>/mind audit-tool-calls
```

Edit the generated `hooks/audit-tool-calls/policy.ts`. The scaffold is an observer stub:

```ts
import { defineToolPolicy } from "darwinian/hook-policy";

export default defineToolPolicy({
  policyKind: "observer",
  async afterToolCall(event) {
    // Log or audit tool usage here
  },
});
```

See [Hook Policies](../concepts/hook-policies) for the full interface.

## 6. Set manifest metadata

```bash
drwn card source set @your-handle/mind \
  --description "Engineering mind card for backend teams" \
  --version 0.1.0 \
  --harness-min-version 0.4.0 \
  --stability experimental
```

`--harness-min-version 0.4.0` declares that consumers need `drwn` 0.4.0 or later (required for mind card support).

## 7. Validate

```bash
drwn card source doctor @your-handle/mind
```

`doctor` checks schema validity, missing files, and manifest consistency. Fix any reported issues before publishing.

## 8. Publish

Add a Git remote and push:

```bash
drwn card remote add @your-handle/mind https://github.com/your-handle/mind.git
drwn card push @your-handle/mind
```

If the card contains private or internal content, ensure the remote is private:

```bash
drwn card push @your-handle/mind --remote-visibility private
```

## 9. Activate in a project

```bash
cd ~/your-project
drwn add @your-handle/mind@^0.1.0
drwn install
drwn use @your-handle/mind --no-write
drwn write
```

If the mind card declares hooks, grant trust:

```bash
drwn card trust @your-handle/mind --hooks
drwn write
```

## See also

- [Minds](../concepts/minds) — Mind content in one selected Worker closure
- [Beliefs, Personas, and Memory](../concepts/beliefs-memories-personas) — content types in detail
- [Hook Policies](../concepts/hook-policies) — writing enforcement and observer policies
- [Worker Mind CLI](../reference/cli/mind) — provider-neutral backend placeholder
- [`drwn card source`](../reference/cli/card) — full source subcommand reference
