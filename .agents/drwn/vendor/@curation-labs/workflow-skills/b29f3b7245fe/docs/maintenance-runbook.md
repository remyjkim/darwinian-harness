# Maintenance Runbook

How to maintain the workflow-skills card over time.

## Sync upstream changes

When the canonical Superpowers skills in `darwinian-minds/skills/shared/` change:

```bash
cd ~/dev/darwinian-minds

# Check which bundled skills have drifted:
bun run cli/index.ts card source sync @curation-labs/workflow-skills --check

# Output: "synced" (no action) / "stale" (upstream changed) / "moved" (upstream restructured)
```

### For each "stale" skill:

1. Review the upstream diff:
   ```bash
   diff ~/dev/darwinian-cards/cl-workflow-skills/skills/<name>/SKILL.md \
        ~/dev/darwinian-minds/skills/shared/<name>/SKILL.md
   ```

2. Merge relevant upstream improvements (bug fixes, new phases, better examples) into your customized copy. **Preserve the `.ai/rules/` references** — do not let upstream's hardcoded paths overwrite them.

3. Run tests to verify no forbidden patterns crept back:
   ```bash
   cd ~/dev/darwinian-cards/cl-workflow-skills
   node --test test/skill-content.test.mjs
   ```

### For "moved" skills:

The upstream restructured the skill. Re-evaluate the customization against the new structure. You may need to re-customize from scratch.

## Publish a new version

After syncing changes:

```bash
cd ~/dev/darwinian-minds

# Bump the version:
bun run cli/index.ts card source set @curation-labs/workflow-skills --version 1.X.0

# Copy the updated card.json version back to the repo:
cp ~/.agents/drwn/sources/@curation-labs/workflow-skills/card.json \
   ~/dev/darwinian-cards/cl-workflow-skills/card.json

# Also copy any updated skills/hooks/instructions:
cp -R ~/.agents/drwn/sources/@curation-labs/workflow-skills/skills/* \
   ~/dev/darwinian-cards/cl-workflow-skills/skills/
cp ~/.agents/drwn/sources/@curation-labs/workflow-skills/hooks/org-conventions/policy.ts \
   ~/dev/darwinian-cards/cl-workflow-skills/hooks/org-conventions/policy.ts

# Publish:
bun run cli/index.ts card publish @curation-labs/workflow-skills

# Commit in the card repo:
cd ~/dev/darwinian-cards/cl-workflow-skills
git add -A && git commit -m "[chore] sync upstream + bump to vX.Y.Z"
```

## Distribute to the org

```bash
# Push the card to a git remote (set up once with drwn card remote add):
bun run cli/index.ts card push @curation-labs/workflow-skills

# Team members pull updates:
# In their project:
drwn update
drwn write
```

## Adding a new skill to the card

```bash
cd ~/dev/darwinian-minds

# Add from the canonical source:
bun run cli/index.ts card source add-skill @curation-labs/workflow-skills <new-skill-name>

# Customize the copy to reference .ai/rules/:
# (edit ~/dev/darwinian-cards/cl-workflow-skills/skills/<new-skill-name>/SKILL.md)

# Add to the test's EXPECTED_SKILLS list:
# (edit ~/dev/darwinian-cards/cl-workflow-skills/test/helpers.mjs)

# Add upstream ref to card.json skills.upstream:
# (edit ~/dev/darwinian-cards/cl-workflow-skills/card.json)

# Run tests + publish:
cd ~/dev/darwinian-cards/cl-workflow-skills
node --test test/*.test.mjs
```

## When the hook policy changes

Any change to `hooks/org-conventions/policy.ts` invalidates the consent digest. Consumers must re-trust:

```bash
drwn card trust @curation-labs/workflow-skills --hooks
drwn write
```

This is by design — it forces a human to review the new policy text before it goes live.

For the v1.1.0 workflow contract update, do not publish until CL Issue-driven Workflow v0.4 is ratified. The draft PR and test results may exist earlier; release publication is the gated action.

## Blueprint for project use

This card is a plain card (not a blueprint). Projects use it via the `@curation-labs/cl-workflow-blueprint` blueprint, which composes this card. To add the blueprint to a new project:

```bash
cd ~/your-project
drwn init --non-interactive
drwn use @curation-labs/cl-workflow-blueprint
drwn card trust @curation-labs/workflow-skills --hooks
drwn write
```
