# ABOUTME: Documentation structure and usage rules for the .ai directory
# ABOUTME: Defines organization, naming, formatting standards for all .ai documentation

# .AI Directory Documentation Standards

This document defines the structure, organization, and formatting standards for all documentation in the `.ai` directory.

---

## Directory Structure

```
backend_v1/.ai/
├── rules/          # Documentation and development rules (this directory)
├── analyses/       # Code analysis, architectural investigations, research, summaries
├── knowledges/     # Reusable knowledge, patterns, decisions, lessons learned
├── tasks/          # Task planning, implementation plans, specifications
└── skills/         # Reusable skills, techniques, scripts organized by domain
    ├── testing/    # Testing skills and scripts
    ├── performance/ # Performance optimization techniques
    ├── debugging/  # Debugging workflows and tools
    └── ...         # Other skill domains as needed
```

**CRITICAL RULE**: Never create files directly under `.ai/` directory. All files MUST be in subdirectories (rules/, analyses/, knowledges/, tasks/, skills/). The only exception is temporary summary/review documents that will be archived.

---

## Terminology

- "Agent" appears only when naming an external harness surface or file (`AGENTS.md`, `.claude/agents/`, `.codex/agents/`, `developer_instructions`). drwn concepts are **workers, cards, instructions, personas** — never "agents". (`~/.agents` is a storage path, not a concept.)
- The composed instruction artifact is the **worker instructions** (inputs: per-card `instructions` fields); its delivery is **instructions projection**; a card-bundled spawnable definition is a **sub-worker**; the pull-strength fallback skill is the **instructions-skill**. "Spine" appears only as an attributed historical citation (I24, analyses 100/101).
- "Ratification" is reserved for org doctrine (CL org program); drwn documents say **approve**.
- Cross-repo glossary and conflict register: Notion "072226 Architect ↔ drwn worker blueprint" page.

---

## 1. RULES Directory (`rules/`)

**Purpose**: Define standards, conventions, and rules for the project.

**Naming Convention**: `NN_topic_name.md`
- `NN`: Two-digit number (01, 02, 03...)
- `topic_name`: Descriptive kebab-case name
- Examples: `01_identity_execution.md`, `02_docs_usage.md`, `03_api_conventions.md`

**Content Structure**:
```markdown
# ABOUTME: Brief description of what this rule covers
# ABOUTME: Second line of description if needed

# [Rule Title]

**Status**: [Active | Draft | Superseded]
**Last Updated**: YYYY-MM-DD
**References**: [List of related document paths]

---

Brief introduction explaining the purpose and scope of this rule.

## Section 1: [Topic]
Content...

## Section 2: [Topic]
Content...

## Examples
Good and bad examples demonstrating the rules.

## Exceptions
When these rules don't apply.
```

**Content Guidelines**:
- **Prescriptive**: Use imperative language (MUST, SHOULD, MAY)
- **Clear Examples**: Provide both good and bad examples
- **Rationale**: Explain *why* a rule exists when not obvious
- **References**: List related documents in frontmatter, not inline
- **Living Documents**: Update as standards evolve

**Typical Rules Topics**:
- Code conventions and style
- API design standards
- Testing requirements
- Documentation standards
- Git workflow
- Security practices

---

## 2. ANALYSES Directory (`analyses/`)

**Purpose**: In-depth investigations, architectural analysis, technical research.

**Naming Convention**: `NN_descriptive_analysis_title.md`
- `NN`: Two-digit number (01, 02, 03...)
- `descriptive_analysis_title`: Clear kebab-case description
- Examples: `01_cosurf_jwt_auth_system.md`, `02_folder_architecture_investigation.md`

**Content Structure**:
```markdown
# [Analysis Title]

**Date**: YYYY-MM-DD
**Author**: [Name or "Claude + Remy"]
**Status**: [Draft | In Review | Final | Superseded]
**References**: [Related analyses, tasks, code files]

---

## Executive Summary
1-3 paragraphs summarizing key findings.

## Context
What prompted this analysis? What questions are we trying to answer?

## Investigation
### [Topic 1]
Detailed investigation...

### [Topic 2]
Detailed investigation...

## Findings
Numbered list of key discoveries.

## Recommendations
Actionable recommendations based on findings.

## Open Questions
Unresolved questions that need further investigation.

## Appendix
Additional data, diagrams, code samples, etc.
```

**Content Guidelines**:
- **Objective**: Present facts and evidence, separate from opinions
- **Thorough**: Include methodology, data sources, assumptions
- **Visual**: Use diagrams, tables, code samples to illustrate
- **Dated**: Analyses can become outdated; date prominently
- **Versioned**: Update status when findings change or are superseded
- **Referenced**: List related documents and code in frontmatter
- **Summaries Included**: Project summaries and completion reports belong in analyses

**Typical Analysis Topics**:
- Architecture investigations
- Performance profiling
- Security assessments
- Third-party library evaluations
- Database schema analysis
- API integration research
- Project summaries and completion reports
- Milestone retrospectives

---

## 3. KNOWLEDGES Directory (`knowledges/`)

**Purpose**: Reusable knowledge, design patterns, architectural decisions, lessons learned.

**Naming Convention**: `NN_descriptive_knowledge_topic.md`
- `descriptive_knowledge_topic`: Clear kebab-case description
- Examples: `postgres_full_text_search_patterns.md`, `fastify_plugin_architecture.md`

**Content Structure**:
```markdown
# [Knowledge Topic]

**Category**: [Pattern | Decision | Lesson | Reference]
**Tags**: tag1, tag2, tag3
**Last Updated**: YYYY-MM-DD
**References**: [Related knowledge docs, external resources]

---

## Overview
Brief description of what this knowledge covers.

## Problem / Context
What problem does this solve? When is it applicable?

## Solution / Approach
The pattern, decision, or technique explained.

## Examples
Concrete examples from this codebase or elsewhere.

## Trade-offs
Advantages and disadvantages.
```

**Content Guidelines**:
- **Evergreen**: Knowledge should be timeless; update rather than create new
- **Self-contained**: Should be understandable without external context
- **Practical**: Include real examples from the codebase
- **Searchable**: Use descriptive titles and tags
- **Referenced**: List related docs in frontmatter References field
- **Curated**: Remove or merge obsolete knowledge

**Typical Knowledge Topics**:
- Architectural patterns used in the project
- Design decisions and rationale
- Best practices and anti-patterns
- Useful libraries and their usage patterns
- Common pitfalls and solutions
- Debugging techniques

---

## 4. TASKS Directory (`tasks/`)

**Purpose**: Task planning, implementation plans, specifications, work breakdown.

**Naming Convention**: `NN_type_description.md`
- `NN`: Two-digit number (01, 02, 03...)
- `type`: One of:
  - `planN` - Planning document (N = plan iteration number: plan1, plan2, etc.)
  - `completion` - Task completion summary/retrospective
  - No type prefix for main implementation documents
- `description`: Brief kebab-case description
- Examples:
  - `05_plan1_crud_api_design.md` - First planning iteration
  - `05_plan2_layered_architecture.md` - Second planning iteration
  - `05_implementation_plan.md` - Final implementation plan
  - `05_route_specifications.md` - Specifications document
  - `04_completion_database_schema.md` - Completion summary

**Content Structure**:
```markdown
# Task N: [Task Title]

**Status**: [Planning | In Progress | Blocked | Completed | Cancelled]
**Created**: YYYY-MM-DD
**Updated**: YYYY-MM-DD
**Assigned**: [Name]
**Priority**: [High | Medium | Low]
**Estimated Effort**: [Hours/Days]
**Dependencies**: [Task numbers or names]
**References**: [Related analyses, specifications, code files, skills]

---

## Objective
Clear statement of what this task aims to achieve.

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Approach
High-level approach or strategy.

## Implementation Plan
### Phase 1: [Description]
- [ ] Subtask 1
- [ ] Subtask 2

### Phase 2: [Description]
- [ ] Subtask 1
- [ ] Subtask 2

## Acceptance Criteria
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Performance benchmarks met

## Testing Strategy
How this will be tested.

## Risks & Mitigation
Identified risks and how to address them.

## Notes
Additional context, decisions made during implementation, etc.
```

**File Organization**:
```
tasks/
├── NN_plan1_initial_exploration.md        # First planning iteration
├── NN_plan2_refined_architecture.md       # Second planning iteration
├── NN_implementation_plan.md              # Final implementation plan (no type prefix)
├── NN_route_specifications.md             # Related specifications
├── NN_service_layer_design.md             # Implementation guide
├── NN_completion_summary.md               # Task completion summary
└── NN_archive/                            # Archive past versions and superseded plans
    ├── plan1_v1_initial.md                # Old version of plan1
    ├── plan2_v1_draft.md                  # Old version of plan2
    └── REVIEW_SUMMARY.md                  # Review of all planning docs
```

**Naming Rules**:
- **Plans**: `NN_planN_description.md` where N is the iteration (plan1, plan2, plan3...)
  - Use when exploring options or refining architecture
  - Each plan iteration represents a stage in decision-making
  - Later plans often supersede earlier ones

- **Main Docs**: `NN_description.md` (no type prefix)
  - Final implementation plans, specifications, designs
  - The "active" documents used during implementation
  - Examples: `05_implementation_plan.md`, `05_route_specifications.md`

- **Completions**: `NN_completion_description.md`
  - Created when task is complete
  - Retrospective, summary, lessons learned
  - Example: `04_completion_database_schema.md`

- **Archive**: `NN_archive/`
  - MUST create for any task with multiple planning iterations
  - Contains superseded versions and historical documents
  - Keeps main directory clean while preserving history

**Content Guidelines**:
- **Actionable**: Tasks should have clear, executable steps
- **Measurable**: Include concrete acceptance criteria
- **Updated**: Keep status current as work progresses
- **Documented**: Record decisions and changes during implementation
- **Archived**: Move superseded plans to archive subdirectory
- **Referenced**: List related docs, skills, and code in frontmatter

**Archive Guidelines**:
- **MUST create** `NN_archive/` for tasks with multiple plan iterations (plan1, plan2, etc.)
- Move superseded planning documents to archive
- Move old versions of documents when significantly rewritten
- Keep archives for historical context and decision trail
- Name archived files descriptively to show what they contain
- **DO NOT delete** old planning documents - they show decision evolution

**Typical Task Documents**:

**Planning Phase**:
- `NN_plan1_initial_exploration.md` - First pass, exploring options
- `NN_plan2_refined_architecture.md` - Second pass, making decisions
- `NN_plan3_final_approach.md` - Third pass if needed

**Implementation Phase**:
- `NN_implementation_plan.md` - Main execution plan
- `NN_route_specifications.md` - API specifications
- `NN_service_layer_design.md` - Implementation guide
- `NN_database_schema.md` - Schema design

**Completion Phase**:
- `NN_completion_summary.md` - What was accomplished, lessons learned

**Archive**:
- `NN_archive/` - Superseded plans, old versions, review documents

---

## 5. SKILLS Directory (`skills/`)

**Purpose**: Reusable skills, techniques, scripts, and patterns organized by domain. A toolbox of proven approaches that can be referenced when planning or executing tasks.

**Directory Structure**:
```
skills/
├── testing/         # Testing skills, scripts, and strategies
├── performance/     # Performance optimization techniques
├── debugging/       # Debugging workflows and tools
├── database/        # Database patterns and utilities
├── api-design/      # API design patterns and tools
└── [domain]/        # Other skill domains as needed
```

**Naming Convention**: Varies by content type
- Scripts: `descriptive-script-name.{sh|ts|js|py}`
- Documentation: `descriptive_skill_name.md`
- Examples:
  - `skills/testing/test-auth-flow.sh`
  - `skills/testing/integration_test_patterns.md`
  - `skills/performance/query_optimization.md`
  - `skills/debugging/postgres_query_analysis.sh`

**Skill Documentation Structure**:
```markdown
# [Skill Name]

**Domain**: [testing | performance | debugging | database | etc.]
**Type**: [Script | Pattern | Workflow | Tool]
**Last Updated**: YYYY-MM-DD
**References**: [Related skills, docs, external resources]

---

## Purpose
What this skill helps you accomplish.

## When to Use
Situations where this skill is applicable.

## Prerequisites
- Required tools or knowledge
- Environment setup needed

## Usage
Step-by-step instructions or workflow.

## Examples
Concrete examples from this codebase.

## Variations
Alternative approaches or configurations.

## Common Pitfalls
What to watch out for.

## Related Skills
Other skills that complement or build on this.
```

**Script Header Requirements**:
```bash
#!/usr/bin/env bash
# ABOUTME: Brief description of what this script does
# ABOUTME: Second line if needed
#
# Domain: testing
# Usage: ./script-name.sh [options]
# Dependencies: tool1, tool2
# References: related-skill.md
```

**Content Guidelines**:
- **Reusable**: Skills should be general enough to apply to multiple tasks
- **Practical**: Include real examples and working code
- **Documented**: Clear usage instructions and prerequisites
- **Domain-Organized**: Group related skills together
- **Referenced**: Can be referenced in task planning and execution
- **Tested**: All scripts verified to work before committing
- **Idempotent**: Scripts safe to run multiple times

**Skill Domains**:
- **testing/**: Test automation, integration patterns, E2E workflows
- **performance/**: Profiling, optimization, benchmarking
- **debugging/**: Troubleshooting workflows, diagnostic tools
- **database/**: Migration patterns, query optimization, backup/restore
- **api-design/**: REST patterns, validation, error handling
- **deployment/**: CI/CD patterns, environment setup
- **security/**: Security audit tools, vulnerability scanning

**Types of Skills**:
1. **Scripts**: Executable automation (bash, TypeScript, Python)
2. **Patterns**: Reusable code patterns and templates
3. **Workflows**: Step-by-step processes
4. **Tools**: Configuration files, utilities
5. **Checklists**: Quality gates, review checklists

---

## General Formatting Standards

### Markdown Conventions

#### Headers
- Use ATX-style headers (`#`, `##`, `###`)
- One H1 per document (the title)
- Logical hierarchy (don't skip levels: H1 → H3)
- Use sentence case for headers

#### Lists
- Use `-` for unordered lists (not `*` or `+`)
- Use `1.` for ordered lists (auto-numbering)
- Indent nested lists with 2 spaces
- Use checkboxes for task lists: `- [ ]` or `- [x]`

#### Code Blocks
````markdown
```typescript
// Always specify language for syntax highlighting
const example = "like this";
```
````

#### Links
- Use descriptive link text: `[See analysis](./analyses/01_auth_system.md)`
- Not: `[click here](./analyses/01_auth_system.md)`
- Use relative paths for internal links
- Verify links aren't broken

#### Tables
```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
```
- Align headers with pipe separators
- Keep tables readable in plain text

#### Emphasis
- Use **bold** for important terms, definitions
- Use *italic* for emphasis
- Use `code` for filenames, variables, commands
- Use > blockquotes for callouts or notes

### Document Metadata

Every document should start with:
```markdown
# [Document Title]

**[Relevant metadata fields]**
**Date**: YYYY-MM-DD
**Status**: [Current status]

---

[Content begins here]
```

### Status Values

Use consistent status terminology:
- **Planning**: Initial planning phase
- **Draft**: Work in progress
- **In Review**: Ready for review
- **In Progress**: Active implementation
- **Blocked**: Waiting on dependencies
- **Completed**: Finished and verified
- **Cancelled**: No longer pursuing
- **Superseded**: Replaced by newer document
- **Archived**: Historical reference only

### File Organization

#### Keep Related Files Together
```
tasks/
├── 05_implementation_plan.md           # Main plan
├── 05_route_specifications.md          # Related specs
├── 05_service_layer_design.md          # Related design
└── 05_archive/                         # Related archive
    └── plan1_initial_exploration.md
```

#### Use Consistent Numbering
- Pad numbers: `01`, `02`, `10` (not `1`, `2`, `10`)
- Allows proper alphabetical sorting
- Makes space for future insertions

#### Archive Old Versions
- Don't delete superseded documents
- Move to `NN_archive/` subdirectory
- Rename descriptively: `plan1_initial_exploration.md`
- Helps track decision evolution

---

## Document Lifecycle

### 1. Creation
- Choose appropriate directory
- Follow naming conventions
- Use standard template
- Add metadata

### 2. Development
- Keep status updated
- Link related documents
- Update "Last Updated" date
- Add notes on major changes

### 3. Review
- Verify links work
- Check formatting
- Ensure completeness
- Update status to "In Review"

### 4. Completion
- Mark status as completed
- Archive superseded versions
- Update cross-references
- Move to archive if historical

### 5. Maintenance
- Review periodically
- Update outdated information
- Archive obsolete docs
- Maintain link integrity

---

## References Frontmatter Field

All documents should list related documents, code, and external resources in the `**References**:` frontmatter field, not inline in the document body.

### Format

```markdown
**References**: [tasks/05_implementation_plan.md, analyses/01_auth_system.md, src/services/auth.ts, https://fastify.io/docs]
```

### What to Include

**Internal Documents**:
- Related tasks, analyses, knowledge docs
- Use relative paths from `.ai/` directory
- Examples: `tasks/05_implementation_plan.md`, `analyses/01_auth_system.md`, `knowledges/postgres_fts.md`

**Code Files**:
- Relevant source files
- Use paths from project root
- Examples: `src/services/auth.ts`, `src/routes/knowledge/items.ts`, `test/integration/auth.test.ts`

**Skills**:
- Applicable skills from skills directory
- Examples: `skills/testing/integration_test_patterns.md`, `skills/performance/query_optimization.md`

**External Resources**:
- Official documentation
- Articles, blog posts
- GitHub repositories, issues, PRs
- Examples: `https://fastify.io/docs`, `https://github.com/org/repo/pull/42`

### Guidelines

- **List format**: Comma-separated list in square brackets
- **No descriptions**: Just paths/URLs, no explanatory text
- **Keep updated**: Add/remove references as doc evolves
- **Be selective**: Only include directly relevant references
- **No duplicates**: Each reference listed once

### Examples

**Task References**:
```markdown
**References**: [analyses/04_schema_complete.md, skills/database/migrations.md, src/db/schema/knowledge.ts]
```

**Analysis References**:
```markdown
**References**: [tasks/02_auth_endpoints.md, src/plugins/auth.ts, https://jwt.io/introduction]
```

**Knowledge References**:
```markdown
**References**: [knowledges/drizzle_patterns.md, https://orm.drizzle.team/docs]
```

**Skill References**:
```markdown
**References**: [skills/testing/integration_patterns.md, test/setup.ts]
```

---

## Templates

### Quick Reference Templates

**Task Template**: See [task structure](#content-structure-3)
**Analysis Template**: See [analysis structure](#content-structure-1)
**Knowledge Template**: See [knowledge structure](#content-structure-2)
**Rule Template**: See [rule structure](#content-structure)

---

## Best Practices

### Do:
✅ Use descriptive, searchable titles
✅ Include creation/update dates
✅ List related docs in References frontmatter
✅ Update status as work progresses
✅ Archive superseded documents in NN_archive/
✅ Use consistent naming: planN for iterations, completion for summaries
✅ Create files ONLY in subdirectories, never directly under .ai/
✅ Use consistent formatting
✅ Include examples and code samples
✅ Add ABOUTME comments at file start
✅ Keep documents focused and single-purpose
✅ Use checkboxes for actionable items

### Don't:
❌ Create files directly under .ai/ directory (always use subdirectories)
❌ Delete planning iterations (archive them in NN_archive/)
❌ Create orphaned documents (always add References)
❌ Use vague titles like "notes.md" or "misc.md"
❌ Delete historical documents (archive instead)
❌ Mix multiple topics in one document
❌ Leave status as "Planning" forever
❌ Add inline cross-reference links (use References frontmatter)
❌ Duplicate information across documents
❌ Skip metadata headers
❌ Skip plan iteration numbers (always use plan1, plan2, not just "plan")
❌ Commit without verifying Markdown renders correctly

---

## Review Checklist

Before committing documentation:

- [ ] File is in subdirectory, NOT directly under .ai/
- [ ] File is in correct subdirectory (rules/analyses/knowledges/tasks/skills)
- [ ] Filename follows naming convention
  - [ ] Tasks: Use planN_ prefix for iterations, completion_ for summaries
  - [ ] NN_archive/ created if multiple plan iterations exist
- [ ] ABOUTME comments present (for all files)
- [ ] Metadata section complete with References field
- [ ] Status field accurate
- [ ] References field populated (no inline cross-reference links)
- [ ] Code blocks have language specified
- [ ] Markdown renders correctly
- [ ] Superseded documents archived in NN_archive/
- [ ] Content is clear and complete

---

## Examples of Well-Organized Documentation

### Example 1: Task with Multiple Planning Iterations
```
tasks/
├── 05_plan1_crud_api_design.md           # First planning iteration (archived)
├── 05_plan2_layered_architecture.md      # Second planning iteration (archived)
├── 05_implementation_plan.md             # Final implementation plan (active)
├── 05_route_specifications.md            # API contract details (active)
├── 05_service_layer_design.md            # Implementation guide (active)
└── 05_archive/                           # Archive for superseded docs
    ├── plan1_initial_exploration.md      # Old version of plan1
    ├── plan2_architecture_evolution.md   # Old version of plan2
    └── REVIEW_SUMMARY.md                 # Planning review document
```

Note: When task is complete, move plan1 and plan2 to archive, leaving only active docs.

### Example 2: Analysis with Follow-up
```
analyses/
├── 01_cosurf_jwt_auth_system.md       # Initial investigation
└── 02_auth_security_improvements.md   # Follow-up recommendations
```

### Example 3: Knowledge Base
```
knowledges/
├── postgres_full_text_search.md       # FTS patterns
├── drizzle_orm_best_practices.md      # ORM usage
└── fastify_testing_patterns.md        # Testing approaches
```

### Example 4: Skills Repository
```
skills/
├── testing/
│   ├── test-auth-flow.sh              # Auth flow test script
│   ├── integration_test_patterns.md   # Integration testing guide
│   └── e2e_workflow.md                # E2E testing workflow
├── performance/
│   ├── query_optimization.md          # Database optimization patterns
│   └── benchmark-api.ts               # API benchmarking script
└── database/
    ├── migration_patterns.md          # Migration best practices
    └── backup-restore.sh              # Backup/restore utility
```

### Example 5: Complete .ai Directory
```
.ai/
├── rules/
│   ├── 01_identity_execution.md
│   └── 02_docs_usage.md
├── analyses/
│   ├── 01_auth_system.md                    # JWT auth analysis
│   ├── 02_auth_endpoints_design.md          # Auth API design
│   ├── 03_database_architecture.md          # DB architecture analysis
│   └── 04_completion_schema.md              # Schema completion summary
├── knowledges/
│   └── postgres_full_text_search.md
├── tasks/
│   ├── 01_postgres_drizzle_init.md
│   ├── 02_plan1_auth_exploration.md         # Auth planning
│   ├── 02_completion_auth.md                # Auth completion
│   ├── 04_completion_database_schema.md     # Schema completion
│   ├── 05_plan1_crud_api_design.md          # CRUD planning iteration 1
│   ├── 05_plan2_layered_architecture.md     # CRUD planning iteration 2
│   ├── 05_implementation_plan.md            # CRUD final plan
│   ├── 05_route_specifications.md           # CRUD API specs
│   ├── 05_service_layer_design.md           # CRUD implementation guide
│   └── 05_archive/                          # CRUD historical docs
│       ├── plan1_v1_initial.md
│       ├── plan2_v1_draft.md
│       └── REVIEW_SUMMARY.md
└── skills/
    ├── testing/
    │   ├── test-auth-flow.sh
    │   └── integration_patterns.md
    ├── performance/
    │   └── query_optimization.md
    └── database/
        └── migration_patterns.md
```

**Note**: No files directly under `.ai/` - all files in subdirectories.

---

**Last Updated**: 2025-12-23
**Version**: 3.0
**Status**: Active
