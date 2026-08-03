# Canonical Instructions Projection — Decision Options and I24 Port Analysis

Companion to `.ai/analyses/cl0024_worker-instructions-projection_target_architecture.md`
(referred to as "doc 124" throughout — its pre-CL-grammar sequence number).
Two jobs: (1) lay out the option space with pros/cons for every open decision point in
doc 124; (2) review the internal team discussion on Notion issue
**[I24, DW] "Card instructions field is not consumed by regular card apply"**
(`app.notion.com/p/...39df1fbef8c2813ebc5ceabd396e9040`) and identify which of its
components and insights port into the 124 target architecture.

**Reading order:** doc 100 (gap investigation) → doc 101 (option families) → I24 Notion
page (team framing, criteria, lean) → doc 123 (cross-agent AGENTS.md research) → doc 124
(target architecture) → this doc.

---

## Part A — What I24 adds, and what has changed since it was written

The I24 page (appended 07-14-26) maps the same design space as docs 100/101 and goes
further in three ways that port directly:

### A1. The three-context reframe (ports wholesale)

`instructions` conflates three delivery contexts with different consumers:
**main worker instructions** (I24: "main-agent spine" — the active root governs the
primary conversation), **sub-worker instructions** (I24: "subagent spine" — the card is
invoked as a capability inside someone else's session), **service instructions** (I24:
"service spine" — deployed runtime, works today). Every mechanism is a position on *delivery strength* (system
prompt > injected context > pull), *scope*, and *binding time*.

Doc 124 claims only the main-agent context. That is the correct scoping — but 124 should
say so in I24's vocabulary, because the I24 option families it competes with are
context-specific: 124 **is** I24's Option C, upgraded by the 123 research. Sub-worker
instructions (I24's A+O synthesis) are complementary, not competing (§A4).

### A2. The eight decision criteria (port wholesale)

I24's criteria — delivery guarantee, context commitment, target parity, **trust
posture**, single source of truth, authoring ergonomics, architecture boundary,
reversibility — are the evaluation framework Part B uses. Doc 124 already satisfies
several by construction: single composer (reuses the sync-worker composition), authoring
ergonomics (one text, no synthesis magic), reversibility (a managed block is retirable),
architecture boundary (drwn stays a materializer). Two criteria change 124's answers:
trust posture (B-Q1) and target parity (§A3).

### A3. The headline: both reasons the team deferred Option C have flipped

I24's lean deferred main worker instructions and preferred **D (session-start hook
injection) over C (memory-file managed block)** "unless cross-target push becomes a hard
requirement." The two costs that motivated that lean no longer hold:

| I24's cost of C (07-14) | State now (07-22) |
| --- | --- |
| Cross-target push means a per-target memory-file matrix (CLAUDE.md, .cursor rules, …) | Doc 123: **one** root `AGENTS.md` is natively consumed by codex, opencode, and cursor; claude needs only a one-line `.claude/CLAUDE.md` import. The matrix collapsed to one file + one adapter. |
| "Marker-based ownership inside user-owned Markdown" was an unbuilt, risky pattern | The pattern shipped and is contract-tested this cycle: `opencode.json` per-server merge with foreign-key passthrough, cursor `hooks.json` foreign-file guard, `.gitignore` drwn block, per-field hashing + drift + `--force` + clean removal. C's implementation risk is now a solved, in-repo idiom. |

Meanwhile D's relative position weakened: its injection channel (`additionalContext`)
reaches **claude and codex only** — the new cursor runtime degrades `additionalContext`
with a warning (preToolUse carries no context channel), and opencode plugins have no
context-injection channel at all (design 122 V4 still open). C-via-123 covers all four
targets, deterministically, with no hook-consent friction and no per-session recompute.

**Ported conclusion:** C-via-123 (= doc 124) is now the strongest main-instructions mechanism on
I24's own criteria. D remains a *complement* for claude/codex if injected-strength
per-session delivery is later wanted — not the primary.

### A4. The A+O synthesis (sub-worker instructions) — adjacent, compatible, separate

I24's lean for sub-worker instructions is the **A+O synthesis**: cards ship authored
`agents/<name>.md`; projection copies to `.claude/agents/`; deploy references the same
file via `instructions: {path: "agents/<name>.md"}` — one text, two consumers. Doc 124
neither includes nor conflicts with it:

- **Shared invariant** (ports into 124 as a stated constraint): the composed instructions
  artifact stays the single source; any future `agents/` content type must feed the same
  composer, not add a second one.
- **Compatible seam:** `instructions: {path}` already resolves inside the card content
  root (`sync-worker.ts:106-117`), so A+O's authoring shape needs no manifest change that
  would affect 124.
- **Recommendation:** keep sub-worker instructions as their own issue/architecture doc (I24's
  stated next step, `cl0024_…_target_architecture.md`); 124 proceeds independently. The
  two converge at the composer, not at the surface.

### A5. Smaller ports

- **Trust language** (I24 criterion 4): "a projected system prompt from a third-party
  card is silent prompt injection … 'ungated' is not an answer." This overturns 124's Q1
  recommendation (see B-Q1).
- **Immediate layer** (I24 lean, layer 1): docs + fix the contract line
  (`project-worker-v1.md:108`) + `--instructions` on `drwn card source set`,
  "immediately and regardless" of mechanism choice. This answers 124's Q4 (B-Q4).
- **Framing correction** from the I24 investigation: the artifact is composed for every
  applied root (not deploy-only) — 124 already states this; keep the corrected framing
  when the docs-PR for the contract line is written.
- **Option F (drwn as launcher)** stays the explicit convergence horizon, out of scope,
  and any move toward it is a philosophy change decided as one (criterion 7).
- **Workflow note:** I24's next step predates v0.3 numbering. Docs 124/125 are the
  natural GATE 1 artifact set for that step; whether they are re-labeled `cl0024_*` or
  linked as-is is a bookkeeping call for Remy.

---

## Part B — Option space per open decision point in doc 124

### B-Q1. Activation posture (was 124 §7 Q1: "on-by-default vs opt-in")

I24's trust criterion adds a third axis 124 under-weighted: **who authored the instructions**.

| Option | Pros | Cons |
| --- | --- | --- |
| (a) On-by-default, ungated (124's original rec) | Parity with deploy; zero friction; "expected" behavior; dry-run previews | Violates I24 criterion 4 — a third-party card's instructions land in the committed root `AGENTS.md` of every collaborator silently; prompt-injection channel with repo-wide blast radius; no per-card provenance control |
| (b) Consent-gated per card, hook-precedent (`drwn card trust <card> --instructions`, or fold into a widened `--hooks`-style trust) | Matches the existing consent machinery (`isHookConsentValid`, semver-ranged, `card.lock`-recorded); satisfies criterion 4 exactly; provenance-granular; `--strict` CI mode falls out for free | One more consent concept for authors/consumers; friction on first-party cards where risk is nil |
| (c) Project-config opt-in flag only (`instructions.project: true`) | One-line gate; repo-level decision visible in committed config; simplest implementation | Coarse — no per-card provenance (a trusted closure and an untrusted marketplace card get the same switch); still silent for collaborators inheriting the config |
| (d) Split posture: default-on for first-party/trusted-source closures (existing `trustedSources` policy), consent required for everything else | Best ergonomics-to-safety ratio; reuses two existing mechanisms; no new UX for the common case | Two code paths; "why did my card's instructions not project?" support surface; trust-policy edge cases |

**Recommendation: (b), implemented by widening the existing card-trust surface** —
one consent concept, not two: `drwn card trust <card> --instructions` (or a combined
capability-trust flag), auto-satisfied for cards authored in the local store's own
sources. It is the smallest option that makes "ungated is not an answer" true, and it
keeps CI enforceable via the existing `--strict` pattern. (d) is the fallback if consent
friction proves real in practice; (a) is withdrawn. **Status: decided as recommended — Remy, 072226; folded into doc 124.**

### B-Q2. Foreign `.claude/CLAUDE.md` handling (124 §7 Q2)

| Option | Pros | Cons |
| --- | --- | --- |
| (a) Advisory only — doctor tells the user to add `@../AGENTS.md` (124's rec) | Never edits a foreign file (hard precedent from cursor `hooks.json`); zero clobber risk | Claude users with an existing CLAUDE.md silently miss the instructions until they act; advisory fatigue |
| (b) Interactive prompt at write time ("append the import line? [y/N]") | Consent captured in the moment; one keystroke to correct delivery | Breaks non-interactive/CI writes (needs a flag); one-time consent isn't recorded anywhere durable; nags on every write if declined |
| (c) Auto-append the import line inside a drwn marker block | The managed-block idiom is now proven; delivery guaranteed; removal is clean | Still *mutates* a file drwn does not own on first touch — a weaker precedent than merging into files whose formats define drwn-managed sections; a one-line `@import` inside comment markers at the top of someone's curated CLAUDE.md is visible churn |
| (d) Write `.claude/CLAUDE.md` only when absent; when present, advisory + a `drwn doctor --fix`-style explicit command to apply the append | Foreign-file rule intact; the fix is one deliberate command, recorded as drwn-owned block; CI-friendly | Slightly more machinery (a fix verb) |

**Recommendation: (d)** — it keeps (a)'s safety while giving users a one-command path
out of the advisory, and the applied line lives in a marked block so cleanup stays
honest. Plain (a) is acceptable for phase 1 if the fix verb is deferred. **Status: decided as recommended — Remy, 072226; folded into doc 124.**

### B-Q3. Block content: full text vs pointer (124 §7 Q3)

| Option | Pros | Cons |
| --- | --- | --- |
| (a) Full composed content in the AGENTS.md block (124's rec) | Works for all four targets (only claude resolves `@` imports); committed file is self-contained for collaborators and CI (generated dir is gitignored — a pointer would dangle); human-reviewable in PRs; 123's sentinel/CI checks apply directly | Larger diffs on instruction changes; content duplicated between block and generated artifact (mitigated: same composer, same bytes, hash-verified) |
| (b) Pointer/import line only | Tiny file; no duplication | Breaks codex/opencode/cursor outright; dangles for collaborators; fails 123's "reference-oriented but loadable" bar |
| (c) Hybrid: summary + Instruction-ID in the block, full text only in the generated artifact | Small committed footprint | The instructions themselves never reach the harness — defeats the purpose; two texts to keep coherent |

**Recommendation: (a), unchanged and now reinforced** — I24's single-source criterion is
satisfied by composer-identity + hash, not by file-identity. Revisit only if instruction sizes
in practice blow past 123's "<200 lines" guidance, which is an authoring problem first. **Status: decided as recommended — Remy, 072226; folded into doc 124.**

### B-Q4. Authoring gap timing (124 §7 Q4)

| Option | Pros | Cons |
| --- | --- | --- |
| (a) Fold `--instructions` on `card source set` + contract-line fix + docs into phase 1 | I24's layer-1 consensus ("immediately and regardless"); tiny surface; unblocks card authors the moment projection exists; closes the doc-100 authoring finding in the same release | Slightly widens phase 1 review |
| (b) Projection first, authoring later (124's rec) | Narrowest phase 1 | Ships a projector for a field most authors still cannot set without hand-editing card.json; re-opens I24's footgun half-closed |

**Recommendation: (a) — revised from 124.** The I24 discussion treats this as already
agreed; it is a day-size addition with an existing validation path. **Status: decided as recommended — Remy, 072226; folded into doc 124.**

### B-Q5 (new, from I24 Q1/Q2). Context commitment and target parity for sub-worker instructions

**Constraint update (Remy, 07-22): cross-CLI parity is a hard requirement** — the
mechanism must serve every supported coding agent (Claude Code, OpenCode, Cursor,
Codex), not Claude alone. This answers I24's open question 2 ("is a claude-only v1
surface acceptable?") with **no**, which retires the lean's claude-only A+O shape as
proposed.

It does **not** retire the mechanism class. I24's table marked A/O/A+O as
`targets: claude` — accurate on 07-14, stale now:

| Target | Native sub-worker surface | Instruction strength there |
| --- | --- | --- |
| Claude Code | `.claude/agents/<name>.md` | per-sub-worker system prompt |
| Cursor | `.cursor/agents/` (guide 120; format/strength = verify item) | isolated-context subagent |
| OpenCode | `.opencode/agents/<name>.md`, `mode: subagent` (verified live from the binary's built-in docs) | body **is** the sub-worker's system prompt |
| Codex | `.codex/agents/<name>.toml` (project) / `~/.codex/agents/` — `multi_agent` is a **stable, enabled** flag on codex-cli 0.144.6 (verified locally); spawned via the `spawn_agent` tool, `[agents]` parallelism knobs | `developer_instructions` field — "equivalent to the `developer` role in the Responses API" |

Verify items on the codex row: upstream issues report custom agent TOMLs not honored
on spawn in some versions (openai/codex #26868, #14579) — confirm against the
installed 0.144.6 before relying; `multi_agent_v2`/`use_agent_identity` are still
under development.

**Ported-and-generalized option — "A+O×N", now four-target:** keep A+O's authoring
shape (cards ship `agents/<name>.md`; deploy references the same file via
`instructions: {path}`) and project it per-target through the descriptor table,
exactly the pattern skills (`skillSurfaces`) and hooks (`hookRuntime`) adopted this
cycle — a `subWorkerSurfaces`-style descriptor field mapping to `.claude/agents/`,
`.cursor/agents/`, `.opencode/agents/` (markdown passthrough with frontmatter
mapping) and `.codex/agents/<name>.toml` (format adapter: description →
`description`, body → `developer_instructions`). The md→toml adapter is the same
class of per-target format writer the MCP surface already has (json-merge vs
toml-merge). The instructions-skill floor (Option B) remains the fallback for harness
versions where a sub-worker surface is absent or broken, not a codex-specific concession.

Sub-worker instructions still proceed as their own issue/GATE-1 doc, but its brief changes
from "A+O (claude)" to "A+O×N (all four targets, per-target format adapters)". The
124-side obligations are unchanged: the shared-composer invariant (§A4), plus
compatible `agents/` path semantics in the manifest. **Status: decided as recommended — Remy, 072226; folded into doc 124.**

### B-Q7 (new). Instructions-skill (Option B): role and design considerations

An **instructions-skill** (I24: "spine-skill") is a bundled `SKILL.md` inside a worker
card that carries the worker's instructions — identity, task procedure, operating policy — delivered through the
ordinary skill pipeline instead of the `instructions` field. It is the pattern the
Deep Research panel workers use today (per I24) and the reason the doc-100 footgun was
survivable. Its importance in the layered architecture: it is the **universal floor** —
skills are the one surface every supported harness consumes today, it ships through
existing machinery with zero new code, and it keeps working wherever a push surface is
absent, disabled, or broken. Its ceiling is structural: **pull at user-message
strength** — the model loads it only when the description triggers, and once loaded it
competes with context rather than governing it.

Design considerations for formalizing it:

1. **Trigger engineering is load-bearing.** Name + description decide whether the
   instructions ever load. Conventions: `<worker>-instructions` naming; description front-loads
   trigger keywords and states "use when acting as <worker>"; respect per-harness
   constraints (opencode's `^[a-z0-9]+(-[a-z0-9]+)*$` regex and 1024-char description
   cap — the doctor lint from design 122 D6 already covers the name check).
2. **Single source of truth.** The instructions-skill body must be generated from (or be
   byte-identical to) the composed instructions artifact — the §A4 composer invariant.
   A hand-scaffolded copy (`card new --instructions-skill` alone) drifts; prefer sync-time
   generation or a publish-time equality lint over trusting authors to mirror edits.
3. **Convert pull toward deterministic where possible.** The layers compose: the
   AGENTS.md managed block (doc 124) can explicitly instruct "when acting as
   <worker>, load skill `<worker>-instructions`" — push-delivered pointer, pull-delivered
   body. A slash-command/MCP-prompt trigger (I24 Option H) is the other cheap
   determinism aid.
4. **Scaffold + lint (the actual Option B work).** `card new --instructions-skill` scaffolding, and
   a publish/doctor lint: a worker card with neither `instructions` nor an instructions-skill
   warns — closing the silent no-op that started I24.
5. **Trust posture is not actually new.** A third-party card's skill already injects
   instructions when triggered — skills are consent-free today. Formalizing the instructions-skill
   should surface this honestly: whatever posture B-Q1 lands on for projected
   instructions, note that the skill channel is the uncovered sibling (at minimum a
   docs statement; at most description-visible provenance).
6. **Budget.** The instructions compete for progressive-disclosure context; 123's
   "<200 lines" guidance applies to the skill body as much as to AGENTS.md.
7. **Floor, not primary.** Do not over-invest in making pull do a push job — the
   stack's push layers (AGENTS.md block, sub-worker surfaces) carry the guarantee; the
   instructions-skill carries the reach.

### B-Q6 (new, from I24's lean). Main-instructions mechanism: C-via-123 alone, or C+D

| Option | Pros | Cons |
| --- | --- | --- |
| C only (doc 124 as designed) | One mechanism, four targets, deterministic, committed and reviewable | Memory-file strength, not injected-per-session; a user who deletes the block locally silently loses the instructions until next write/doctor |
| C + D layered (add session-start hook injection for claude/codex) | Belt-and-suspenders on the two targets with a context channel; per-session freshness | Two delivery paths for one text (drift surface); hook-consent friction; covers only half the targets; contradicts "one mechanism per context" cleanliness |
| D only (I24's original lean) | No user files touched; consent built in | Two of four targets unreachable (cursor/opencode have no context channel); weaker than C on I24's own delivery-guarantee criterion now that C is cheap |

**Recommendation: C only for phase 1.** Keep D in the drawer as a claude/codex
enhancement if per-session injection strength is ever demanded; doctor staleness checks
(124 D4) cover the deleted-block case. **Status: decided as recommended — Remy, 072226; folded into doc 124.**

---

## Part C — Consolidated deltas to apply to doc 124 (applied 072226 after approval)

1. **Q1 answer changes:** consent-gated instructions projection via the card-trust surface
   (B-Q1 b), not on-by-default. Adds one item to the implementation sketch (trust flag +
   `collectPolicies`-style gate in the new `sync-instructions` step) and one test family
   (unconsented card → no block + warning; `--strict` fails).
2. **Q4 answer changes:** authoring (`--instructions` on `card source set`) + the
   `project-worker-v1.md:108` contract-line fix join phase 1 (B-Q4 a).
3. **Adopt I24's vocabulary:** state that 124 implements Option C for the main-agent
   context under the I24 criteria, with sub-worker instructions proceeding separately as
   **A+O×N** (per-target sub-worker surfaces: claude + cursor + opencode, codex degraded
   to the instructions-skill floor — see B-Q5) and F as the unmoved horizon. Cross-CLI parity is a
   hard requirement on both workstreams (Remy, 07-22).
4. **Add the shared-composer invariant** (§A4) to 124's D5 "deliberately does not do"
   list as a positive constraint on future `agents/` content-type work.
5. **Q2 optionally upgraded** from advisory-only to advisory + explicit fix verb
   (B-Q2 d) — Remy's call; either is defensible for phase 1.
6. **Unchanged:** Q3 (full content), scope (project-first, root-only, no vendor
   system-prompt replacement), and all of 124's reuse of the managed-block machinery —
   now with the added justification that these were I24's two blocking costs, since
   retired (§A3).
