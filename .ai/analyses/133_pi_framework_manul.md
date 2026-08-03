# Pi Agent Harness: Comprehensive Overview and Usage Manual

## 1. What Pi is

**Pi is a minimal, extensible harness for running coding-oriented AI agents.** It supplies the essential machinery needed to connect a language model to a working environment:

* Model and provider access
* A tool-calling agent loop
* File and shell tools
* Conversation and session state
* Context-window management
* A terminal user interface
* Programmatic APIs
* Extension and package loading

Pi deliberately keeps the built-in product surface small. Instead of hard-coding elaborate workflows, it expects users to add capabilities through **extensions, skills, prompt templates, themes, and packages**. The official project provides interactive, print, JSON-streaming, RPC, and SDK-based operating modes.

Pi is best understood as an **agent runtime and integration layer**, not as a prescriptive autonomous-development methodology. It does not require a particular planning framework, task format, subagent hierarchy, or project-management system.

### 1.1 What Pi intentionally does not build in

The upstream harness intentionally omits several features commonly bundled into larger coding-agent products:

* Built-in subagents
* A mandatory plan mode
* Built-in MCP support
* Permission pop-ups for every operation
* Built-in task or to-do management
* Background shell-command orchestration

These can be implemented through extensions or external isolation, but they are not part of the default core.

### 1.2 The central design philosophy

Pi’s design can be summarized as:

> Keep the agent loop and interfaces small, observable, scriptable, and replaceable; move opinionated behavior into user-controlled modules.

This has several consequences:

1. The default workflow is easy to understand.
2. Advanced behavior is not hidden behind a large orchestration layer.
3. Organizations can implement their own policies and tools.
4. Security must be handled deliberately rather than assumed.
5. The experience depends heavily on the selected model, instructions, tools, and extensions.

---

# 2. Project architecture

The official repository is organized as a monorepo with four principal packages:

| Package                           | Role                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `@earendil-works/pi-coding-agent` | End-user CLI, interactive coding agent, sessions, resource discovery, and terminal experience |
| `@earendil-works/pi-agent-core`   | Agent runtime, conversation state, tool calls, and agent-loop behavior                        |
| `@earendil-works/pi-ai`           | Unified model-provider abstraction, streaming, authentication, usage, and cost metadata       |
| `@earendil-works/pi-tui`          | Terminal UI components and differential rendering                                             |

A simplified architecture looks like this:

```text
┌──────────────────────────────────────────────────────────────┐
│ User interface                                               │
│ Interactive TUI │ Print mode │ JSON mode │ RPC │ Your app   │
└───────────────────────────────┬──────────────────────────────┘
                                │
                    Pi Coding Agent / SDK
                                │
          ┌─────────────────────┴─────────────────────┐
          │                                           │
   Agent/session runtime                       Resource system
   - message state                             - extensions
   - tool-call loop                            - skills
   - event stream                              - prompts
   - compaction                                - themes
   - branching                                 - packages
          │
          ├───────────────┬───────────────────────────┐
          │               │                           │
     Model layer      Built-in tools             Custom tools
     pi-ai            read/write/edit/bash       extensions
          │
   OpenAI, Anthropic, Google,
   Bedrock, Azure, OpenRouter,
   local and custom providers
```

## 2.1 The agent loop

At a conceptual level, Pi repeatedly performs the following cycle:

```text
User input
   ↓
Input processing and prompt expansion
   ↓
Context construction
   ↓
Request to selected model
   ↓
Assistant text and/or tool calls
   ↓
Tool execution
   ↓
Tool results added to context
   ↓
Another model turn, if needed
   ↓
Agent settles
```

Extensions can observe or modify many stages of this lifecycle, including input handling, context construction, model requests, tool calls, tool results, compaction, branch changes, model selection, and session shutdown.

---

# 3. Installation

## 3.1 Install with npm

The current official package can be installed globally with:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Then launch it:

```bash
pi
```

The official documentation also provides a shell installer:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

The `--ignore-scripts` npm option reduces exposure to package lifecycle scripts during installation. It does not sandbox Pi after installation.

## 3.2 Authenticate

Start Pi and run:

```text
/login
```

This opens the configured provider-authentication workflow. Alternatively, set an API-key environment variable before starting Pi:

```bash
export ANTHROPIC_API_KEY="..."
pi
```

or:

```bash
export OPENAI_API_KEY="..."
pi
```

Pi supports both subscription-based sign-in flows and ordinary provider API credentials.

## 3.3 First project

A safe initial workflow is:

```bash
cd /path/to/project
git status
pi
```

Then ask:

```text
Explain the architecture of this repository. Do not modify files yet.
```

After reviewing the response:

```text
Implement the smallest reasonable version of the change. Run the relevant tests
and show me the final diff.
```

Pi’s default tools can modify files and execute commands, so working in a clean Git branch is strongly recommended. The official project explicitly warns that the harness does not provide an internal permission sandbox.

---

# 4. Operating modes

Pi provides several interfaces over the same general runtime.

## 4.1 Interactive mode

Run:

```bash
pi
```

This launches the full-screen or terminal-oriented interactive interface. It is the normal mode for exploratory development, iterative coding, debugging, and long-running sessions.

## 4.2 Print mode

Run a single prompt and print the result:

```bash
pi -p "Summarize this repository"
```

Print mode is useful in shell scripts, command substitutions, lightweight automation, and one-shot analyses.

## 4.3 JSON event-stream mode

```bash
pi --mode json "Analyze the failing tests"
```

Pi writes newline-delimited JSON events representing the session and agent activity. This is appropriate when another program needs structured streaming output rather than formatted terminal text.

## 4.4 RPC mode

```bash
pi --mode rpc
```

RPC mode communicates over standard input and standard output using a JSON-lines protocol. A supervising process can submit prompts, steer a running task, add follow-up messages, abort execution, create sessions, or switch models.

Use RPC primarily from non-Node applications or when Pi must run as a separate managed process. For a TypeScript or Node application, the SDK usually gives better typing and lifecycle control.

## 4.5 SDK mode

The SDK embeds Pi directly in a JavaScript or TypeScript process. This is the preferred mode for:

* Custom developer tools
* IDE or editor integrations
* Internal agent services
* Automated evaluation systems
* Domain-specific coding assistants
* Applications with custom UI and persistence

---

# 5. Interactive interface

## 5.1 Screen layout

The standard interface has four broad areas:

1. A startup header
2. Conversation and tool activity
3. The input editor
4. A status footer

The footer can expose information such as the current directory, session state, token usage, cache usage, estimated cost, context consumption, model, and thinking level.

## 5.2 Essential slash commands

| Command    | Purpose                                          |
| ---------- | ------------------------------------------------ |
| `/login`   | Authenticate with a provider                     |
| `/model`   | Select or change the model                       |
| `/new`     | Start a new session                              |
| `/resume`  | Select a previous session                        |
| `/tree`    | Inspect or navigate conversation branches        |
| `/fork`    | Create a new session from a branch               |
| `/clone`   | Clone the current session                        |
| `/compact` | Summarize older context                          |
| `/reload`  | Reload instructions and discoverable resources   |
| `/export`  | Export a session                                 |
| `/share`   | Share a session using the supported sharing flow |
| `/help`    | Show available commands                          |

Extensions may register additional slash commands, so the exact list can vary.

## 5.3 Message steering and follow-ups

Pi distinguishes between messages that should affect the currently executing agent and messages that should wait until it finishes.

* **Enter** submits a normal or steering message.
* **Alt+Enter** queues a follow-up.
* **Escape** aborts current execution and restores queued input where applicable.
* **Alt+Up** retrieves a queued message for editing.

The default steering and follow-up behavior can be adjusted in settings.

### When to steer

Steer when the agent is actively pursuing the wrong path:

```text
Stop changing the database layer. The bug is in request validation.
```

### When to queue a follow-up

Queue a message when the current work should finish first:

```text
After the tests pass, update the changelog.
```

---

# 6. Default tools

Pi’s primary built-in tools are:

| Tool    | Function                       |
| ------- | ------------------------------ |
| `read`  | Read file contents             |
| `write` | Create or replace files        |
| `edit`  | Apply focused changes to files |
| `bash`  | Execute shell commands         |
| `grep`  | Search file contents           |
| `find`  | Locate files                   |
| `ls`    | List directories               |

The standard default set centers on `read`, `write`, `edit`, and `bash`; the search and listing tools can be enabled as needed. Tool availability can be controlled using CLI flags.

## 6.1 Select an explicit tool set

For a read-only review:

```bash
pi --tools read,grep,find,ls
```

For file inspection without shell access:

```bash
pi --tools read,grep,find,ls --no-session
```

Exclude a specific tool:

```bash
pi --exclude-tools bash
```

Disable all built-in tools:

```bash
pi --no-builtin-tools
```

Disable every tool, including extension tools:

```bash
pi --no-tools
```

## 6.2 Shell shortcuts

Inside the interactive interface:

```text
!git status
```

executes a shell command and makes its output available to the model.

```text
!!git status
```

executes the command without placing its output in the model context.

Use `!!` for purely personal inspection, sensitive command output, or terminal housekeeping that the model does not need.

## 6.3 File references

Use `@` references to explicitly add files or paths to the input:

```text
Review @src/auth.ts and @test/auth.test.ts for inconsistent assumptions.
```

This is usually more reliable than assuming the model will discover the relevant files itself.

---

# 7. Models and providers

## 7.1 Provider layer

The `pi-ai` package supplies a unified interface over numerous model providers. It normalizes streaming, tool calls, authentication, model metadata, token usage, cost information, and serializable conversation context. The framework is oriented toward models that support tool use.

Officially documented provider paths include major hosted APIs, routing providers, cloud-platform offerings, subscription sign-ins, local servers, and custom provider definitions. Examples include OpenAI, Anthropic, Google, OpenRouter, Amazon Bedrock, Azure-hosted models, Google Vertex AI, Cloudflare, and llama.cpp-compatible local deployments.

## 7.2 Select a model interactively

Run:

```text
/model
```

A keyboard shortcut is also available:

```text
Ctrl+L
```

Model cycling is available through the configured model shortcuts, including `Ctrl+P` and its reverse-cycle variant.

## 7.3 Select a model from the CLI

```bash
pi --provider <provider> --model <model-id>
```

Example structure:

```bash
pi --provider anthropic --model <current-model-id>
```

List available models:

```bash
pi --list-models
```

Limit which models appear:

```bash
pi --models <pattern-or-list>
```

Exact model IDs change over time; use `/model` or `--list-models` rather than relying on an old configuration copied from a blog post.

## 7.4 Thinking level

Pi exposes a thinking or reasoning-level control for models that support it:

```bash
pi --thinking low
pi --thinking medium
pi --thinking high
```

In interactive mode, `Shift+Tab` cycles the thinking level. The available behavior ultimately depends on the selected provider and model.

### Practical selection guidance

* Use a fast, economical model for code search, formatting, simple tests, and routine edits.
* Use a stronger reasoning model for unfamiliar architecture, complex debugging, migrations, or multi-file refactoring.
* Use direct provider credentials when you need explicit billing and provider controls.
* Use OpenRouter-like routing when model breadth matters.
* Use Bedrock, Azure, or Vertex when required by an organization’s cloud architecture.
* Use a local server when data residency or offline operation is the priority, while recognizing that tool-use quality varies substantially across models.

These are operational recommendations rather than framework requirements.

---

# 8. Authentication and credential resolution

## 8.1 Authentication file

Pi stores configured credentials in:

```text
~/.pi/agent/auth.json
```

The file is created with restrictive permissions where the platform supports them. Authentication-file entries take precedence over ordinary environment-variable discovery.

Credential values can be represented as:

* A literal credential
* An environment-variable reference
* A command whose output returns the credential

For example, an organization can retrieve a short-lived token through an external credential helper instead of storing a permanent token directly.

## 8.2 Resolution order

The documented credential-resolution order is broadly:

1. Explicit CLI `--api-key`
2. Credential information in `auth.json`
3. Provider-specific environment variables
4. Relevant custom-model or provider configuration

## 8.3 Credential hygiene

Do not place secrets in:

* `AGENTS.md`
* Prompt templates
* Skills
* Project settings committed to source control
* Session prompts
* Extension source intended for publication

Prefer environment variables, an operating-system secret store, a cloud credential chain, or a command-backed credential helper.

---

# 9. Project instructions and context

Pi can automatically load repository-specific guidance.

## 9.1 `AGENTS.md` and `CLAUDE.md`

Pi searches for instruction files such as:

```text
AGENTS.md
CLAUDE.md
```

It can combine global instructions with files found while walking from parent directories toward the current working directory. This lets an organization establish broad conventions while individual repositories add narrower rules. Run `/reload` after changing instruction files.

A useful `AGENTS.md` might contain:

```markdown
# Repository instructions

- Use Node 22 and pnpm.
- Run `pnpm lint` and `pnpm test` before considering a task complete.
- Do not modify generated files under `src/generated`.
- Database migrations must be backward compatible.
- Prefer existing internal libraries over new dependencies.
- Summarize security-sensitive changes explicitly.
```

Keep instructions concrete and testable. Long essays consume context and make priorities less clear.

## 9.2 System-prompt files

Pi supports system-level prompt customization through `SYSTEM.md` and `APPEND_SYSTEM.md` locations.

Conceptually:

* `SYSTEM.md` replaces the normal system prompt.
* `APPEND_SYSTEM.md` adds material without discarding the default system prompt.

Global and project-scoped variants can be used. Project-level system prompt material is subject to project-trust controls.

Use replacement system prompts only when you understand which default instructions are being removed. Appending focused policy is generally safer.

## 9.3 Disable automatic context files

For a controlled or externally constructed context:

```bash
pi --no-context-files
```

This is useful in testing, evaluation, CI, and embedding scenarios where the caller must know exactly which instructions entered the model context.

---

# 10. Project trust

Project trust determines whether Pi may activate certain resources located in a repository.

Protected project resources can include:

* Project settings
* Project extensions
* Project packages
* Project skills or prompt resources
* Project-level system-prompt customizations

The default trust mode is normally to ask. In noninteractive execution, trust must already have been recorded or resolved using an explicit approval or rejection flag.

Useful flags include:

```bash
pi --approve
```

and:

```bash
pi --no-approve
```

The exact interpretation is project-resource approval, not a universal authorization mechanism for every tool call.

## 10.1 Trust is not a sandbox

Trust controls whether repository-provided Pi configuration and executable extensions are loaded. It does **not** make the built-in shell and file tools safe.

Even in a trusted project:

* `bash` executes with the Pi process’s permissions.
* `write` and `edit` can alter reachable files.
* Extensions can execute arbitrary code.
* Model-generated commands may be destructive.
* Tool output may expose local information to the selected provider.

---

# 11. Sessions and conversation history

## 11.1 Session persistence

Interactive sessions are automatically stored as JSONL records under a Pi session directory, commonly:

```text
~/.pi/agent/sessions/
```

Sessions are organized in relation to the working directory. Entries carry identifiers and parent relationships, allowing the conversation history to form a tree rather than only a linear transcript.

## 11.2 Resume a session

Continue the latest relevant session:

```bash
pi -c
```

Select from recent sessions:

```bash
pi -r
```

Open a specific session:

```bash
pi --session <session-reference>
```

Inside the UI:

```text
/resume
```

## 11.3 Branching

Use:

```text
/tree
```

to inspect the conversation tree and move to an earlier point.

Use:

```text
/fork
```

to turn a branch into a separate session.

Use:

```text
/clone
```

to create a duplicate for an alternate approach.

Branching is valuable when:

* Two implementation strategies should be compared.
* A conversation has accumulated misleading assumptions.
* You want to preserve an analysis branch before making edits.
* You need a clean deliverable session from a long exploratory session.

Pi can summarize the abandoned branch when switching, preserving relevant information without replaying the entire branch.

## 11.4 Disable persistence

For ephemeral use:

```bash
pi --no-session
```

This is useful for CI jobs, disposable analyses, privacy-sensitive one-off runs, and deterministic test harnesses.

## 11.5 Session names and directories

You can assign a human-readable name:

```bash
pi --name "auth-refactor"
```

and override the storage directory:

```bash
pi --session-dir /controlled/path
```

Session-directory configuration can also be supplied through environment or settings, with command-line selection taking precedence.

---

# 12. Context windows and compaction

Long-running sessions eventually approach the selected model’s context limit. Pi addresses this through **compaction**.

## 12.1 Automatic compaction

Automatic compaction is triggered when the estimated context crosses a threshold based on:

```text
context window - reserved tokens
```

The default configuration reserves approximately 16,384 tokens and attempts to retain roughly 20,000 recent tokens while summarizing older material.

A compaction operation generally:

1. Identifies older conversation material.
2. Produces a summary.
3. Preserves more recent messages verbatim.
4. Adds a compaction entry to the session.
5. Reloads a smaller effective context.

Compaction changes what the model sees, but it does not simply delete the underlying session record.

## 12.2 Manual compaction

Run:

```text
/compact
```

Use manual compaction when:

* The status footer shows high context consumption.
* The conversation has completed a major phase.
* Old tool logs are no longer useful.
* The model begins revisiting obsolete assumptions.
* You want to establish a clean transition from analysis to implementation.

## 12.3 Tune compaction

A settings fragment can resemble:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

Increase retained recent context when the current task depends on many exact details. Increase reserved capacity when the agent frequently needs long tool results or a large final answer.

---

# 13. Configuration

## 13.1 Settings locations

Global settings:

```text
~/.pi/agent/settings.json
```

Project settings:

```text
.pi/settings.json
```

Project settings override global settings, and nested objects are merged rather than requiring the entire global object to be duplicated. Project settings are protected by project trust.

## 13.2 Representative settings

A practical baseline might be:

```json
{
  "theme": "dark",
  "defaultProjectTrust": "ask",
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxAttempts": 3,
    "baseDelayMs": 2000
  },
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "images": {
    "autoResize": true,
    "showInTerminal": true
  },
  "packages": [],
  "extensions": [],
  "skills": [],
  "prompts": [],
  "themes": []
}
```

Field availability and accepted values should be checked against the installed version before distributing a shared configuration. The official defaults include enabled compaction, enabled retry behavior, one-at-a-time message handling, and automatic image resizing.

## 13.3 Offline and startup-network behavior

Use:

```bash
pi --offline
```

to disable supported startup network operations.

The corresponding environment control is:

```bash
export PI_OFFLINE=1
```

Version checks can be disabled with:

```bash
export PI_SKIP_VERSION_CHECK=1
```

Offline mode does not make a cloud model work without network access. It is most useful with already installed resources and a local provider.

## 13.4 Telemetry

The settings documentation distinguishes installation-related telemetry from optional analytics behavior. Review and explicitly set these controls in managed environments rather than depending indefinitely on defaults.

---

# 14. Keyboard customization

Global keybindings can be customized in:

```text
~/.pi/agent/keybindings.json
```

Run `/reload` after making changes.

Common defaults include:

| Key                       | Action                              |
| ------------------------- | ----------------------------------- |
| `Enter`                   | Submit                              |
| `Shift+Enter` or `Ctrl+J` | Insert newline                      |
| `Esc`                     | Interrupt current execution         |
| `Ctrl+C`                  | Clear editor or interrupt           |
| `Ctrl+D`                  | Exit when the editor is empty       |
| `Ctrl+G`                  | Open an external editor             |
| `Ctrl+L`                  | Open model selector                 |
| `Ctrl+P`                  | Cycle models                        |
| `Shift+Tab`               | Cycle thinking level                |
| `Ctrl+T`                  | Collapse or expand thinking content |
| `Ctrl+O`                  | Collapse or expand tool output      |
| `Ctrl+X`                  | Copy the last response              |
| `Alt+Enter`               | Queue follow-up                     |
| `Alt+Up`                  | Retrieve queued input               |

Terminal emulators and multiplexers may intercept some combinations. Customize either the terminal or Pi mapping when a shortcut does not arrive intact.

---

# 15. Extensions

Extensions are the most powerful Pi customization mechanism. They are TypeScript modules that run inside the Pi process and can:

* Register tools
* Register slash commands
* Intercept lifecycle events
* Block or transform tool calls
* Change active tools
* Select models
* Add providers
* Add session entries
* Customize rendering
* Execute external programs
* Display interactive UI
* Modify context before model requests

## 15.1 Extension locations

Typical automatic discovery locations are:

```text
~/.pi/agent/extensions/*.ts
.pi/extensions/*.ts
```

Project extensions require project trust. Automatically discovered extensions can be reloaded with:

```text
/reload
```

For rapid testing, load a specific extension:

```bash
pi -e ./my-extension.ts
```

## 15.2 Minimal extension

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function register(pi: ExtensionAPI): void {
  pi.registerCommand("project-health", {
    description: "Inspect repository health",
    handler: async (_args, ctx) => {
      const result = await pi.exec("git", ["status", "--short"]);
      ctx.ui.notify(result.stdout || "Working tree is clean");
    }
  });

  pi.registerTool({
    name: "count_lines",
    label: "Count Lines",
    description: "Count the lines in a text file",
    parameters: Type.Object({
      path: Type.String()
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const result = await pi.exec("wc", ["-l", params.path]);

      return {
        content: [
          {
            type: "text",
            text: result.stdout.trim()
          }
        ],
        details: {}
      };
    }
  });
}
```

This illustrates the two common starting points: a user-invoked command and a model-callable tool. The exact API should be taken from the installed package’s current types.

## 15.3 Tool-call policy extension

A common organizational pattern is to intercept risky operations:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function register(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") {
      return;
    }

    const command = String(event.input?.command ?? "");

    const risky =
      /\brm\s+-rf\b/.test(command) ||
      /\bgit\s+push\b/.test(command) ||
      /\bkubectl\s+delete\b/.test(command);

    if (!risky) {
      return;
    }

    const approved = await ctx.ui.confirm(
      "Potentially destructive command",
      command
    );

    if (!approved) {
      return {
        block: true,
        reason: "The user rejected the command."
      };
    }
  });
}
```

This improves interactive safety, but it is not a security boundary: extension code itself is fully trusted, pattern matching can miss dangerous commands, and non-shell tools may still alter data.

## 15.4 Important lifecycle hooks

The extension event system covers phases such as:

```text
project_trust
session_start
resources_discover
input
before_agent_start
agent_start
turn_start
context
model_select
tool_call
tool_result
turn_end
agent_end
agent_settled
session_before_compact
session_before_tree
session_shutdown
```

There are also provider-level request and response hooks. Exact event payloads are defined by the TypeScript API.

## 15.5 Extension security

Extensions execute as ordinary code with the permissions of the Pi process. An extension can read local files, access environment variables, run commands, use the network, or alter prompts and tool results.

Therefore:

* Review extension source.
* Pin package versions.
* Treat project extensions as executable dependencies.
* Do not load extensions from an untrusted repository.
* Run Pi inside isolation when reviewing unknown code.

---

# 16. Skills

A **skill** is an on-demand bundle of procedural instructions and supporting material. Skills follow the Agent Skills pattern and are designed for progressive disclosure: Pi initially exposes each skill’s name and description, while the model reads its full `SKILL.md` only when the capability is relevant.

## 16.1 Skill locations

Pi can discover skills from locations such as:

```text
~/.pi/agent/skills/
~/.agents/skills/
.pi/skills/
.agents/skills/
```

Skills can also come from packages, settings, or explicit CLI arguments. Project-local skills are subject to trust controls.

## 16.2 Typical skill structure

```text
test-failure-audit/
├── SKILL.md
├── scripts/
│   └── collect-failures.sh
└── references/
    └── test-layout.md
```

A representative `SKILL.md`:

```markdown
---
name: test-failure-audit
description: Diagnose failing tests while separating product defects,
  flaky tests, environment problems, and outdated assertions.
---

# Test Failure Audit

1. Identify the smallest reproducible test command.
2. Capture the complete failure output.
3. Check whether the failure reproduces in isolation.
4. Inspect recent changes to affected files.
5. Classify the failure before modifying code.
6. Prefer fixing the root cause over weakening the test.
7. Run the narrow test, then the relevant suite.
```

The skill should explain a reusable procedure, not merely restate a one-time request.

## 16.3 Invoke a skill explicitly

Skills can be invoked through the skill command form:

```text
/skill:test-failure-audit
```

The model may also select a skill based on its description.

## 16.4 Skills versus extensions

Use a **skill** when the capability is primarily knowledge or procedure:

* Review checklist
* Migration playbook
* Incident-analysis workflow
* Organization-specific coding standard
* Release procedure

Use an **extension** when code execution or runtime integration is required:

* New tool
* API integration
* Command interception
* Custom UI
* Model routing
* Policy enforcement
* Session event processing

---

# 17. Prompt templates

Prompt templates are reusable Markdown prompts exposed as slash commands. They are useful for consistent, parameterized requests without writing an extension.

## 17.1 Example template

File:

```text
~/.pi/agent/prompts/review.md
```

Content:

```markdown
---
description: Review a file for correctness and maintainability
argument-hint: <file> [focus]
---

Review `$1`.

Primary focus: `$2`

Check:
- correctness
- error handling
- security implications
- test coverage
- maintainability

Do not edit the file. Return findings ordered by severity.
```

Invoke it:

```text
/review src/auth.ts security
```

## 17.2 Template arguments

The template system supports positional and aggregate argument substitutions, including constructs such as:

```text
$1
$2
$@
```

It also supports argument defaults and slicing forms documented by the framework.

## 17.3 Best uses

Prompt templates work particularly well for:

* Code review
* Commit-message drafting
* Test planning
* Incident summaries
* Architecture explanations
* Change-risk assessment
* Pull-request descriptions
* Release notes

Use a template when the prompt is stable and human-invoked. Use a skill when the model should discover and follow a richer procedure.

---

# 18. Themes

Themes control the terminal presentation. They can be loaded from global configuration, project configuration, packages, or explicit CLI selection:

```bash
pi --theme <theme-name>
```

Theme discovery can be disabled:

```bash
pi --no-themes
```

Because themes can be packaged alongside other executable resources, inspect the whole package rather than assuming that a package containing a theme is presentation-only. Resource loading and theme selection are documented as part of Pi’s package and settings systems.

---

# 19. Packages

Pi packages bundle one or more resource types:

* Extensions
* Skills
* Prompt templates
* Themes

Packages can come from npm, Git repositories, or local paths.

## 19.1 Package management

Install:

```bash
pi install <package-reference>
```

List installed packages:

```bash
pi list
```

Update packages:

```bash
pi update
```

Remove a package:

```bash
pi remove <package-reference>
```

A project-local installation or configuration can be selected with the documented local flag, allowing a repository to declare its own Pi resources rather than changing global configuration.

## 19.2 Package manifest

A package can declare Pi resources in `package.json` using a `pi` manifest, or it can follow recognized directory conventions.

A conceptual manifest:

```json
{
  "name": "@example/pi-team-tools",
  "version": "1.0.0",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

Consult the current package schema before publication, especially for filters, dependency handling, and resource paths.

## 19.3 Package security

Installing a Pi package is potentially equivalent to installing and executing a development tool. Packages may include extensions with unrestricted process access.

For organizational use:

1. Maintain an approved package list.
2. Pin versions or immutable Git revisions.
3. Review dependency changes.
4. Mirror critical packages internally.
5. Test upgrades in an isolated environment.
6. Separate aesthetic resources from executable resources where practical.

---

# 20. Programmatic SDK usage

## 20.1 Basic session

A minimal TypeScript integration follows this shape:

```ts
import {
  createAgentSession,
  ModelRuntime,
  SessionManager
} from "@earendil-works/pi-coding-agent";

async function main(): Promise<void> {
  const runtime = await ModelRuntime.create();

  const { session } = await createAgentSession({
    runtime,
    sessionManager: SessionManager.inMemory()
  });

  const unsubscribe = session.subscribe((event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  });

  try {
    await session.prompt(
      "Inspect the current project and summarize its architecture."
    );
  } finally {
    unsubscribe();
    session.dispose();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

The official SDK centers on `createAgentSession`, a model runtime, and a session manager. Sessions expose event subscriptions and prompt submission.

## 20.2 Session operations

The SDK exposes operations for:

* Sending a prompt
* Steering an active run
* Queueing a follow-up
* Subscribing to events
* Selecting a model
* Adjusting thinking level
* Navigating the session tree
* Triggering compaction
* Aborting execution
* Disposing the session

A production integration should always:

* Handle cancellation.
* Unsubscribe event listeners.
* Dispose sessions.
* Record errors separately from assistant output.
* Bound tool execution.
* Decide explicitly whether sessions are persistent.
* Sanitize logs containing prompts or tool output.

## 20.3 Custom SDK tools

The SDK supports custom tool definitions with typed parameter schemas. A conceptual example:

```ts
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

export const lookupBuild = defineTool({
  name: "lookup_build",
  description: "Retrieve the status of a CI build",
  parameters: Type.Object({
    buildId: Type.String()
  }),
  execute: async (_id, params) => {
    const status = await getBuildStatus(params.buildId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status)
        }
      ],
      details: status
    };
  }
});
```

Custom tools should return concise model-readable content and, when useful, separate structured details for the host application.

## 20.4 Runtime replacement

The SDK permits replacing or reconfiguring runtime state when creating, switching, forking, or importing sessions. This allows a host application to control persistence, provider selection, tool availability, and user isolation.

---

# 21. JSON event mode

Run:

```bash
pi --mode json "Find the cause of the failing build"
```

The output is JSONL: one JSON object per line. The stream begins with session or runtime information and continues with agent-session events, including assistant content, tool activity, and lifecycle updates.

A shell pipeline might be:

```bash
pi --mode json "Summarize the codebase" |
  jq -c 'select(.type == "message_end")'
```

The exact event names and shapes should be treated as versioned API data, not parsed from assumptions.

## 21.1 Appropriate use cases

JSON mode is a good fit for:

* CI log processing
* Capturing tool traces
* Evaluation harnesses
* Converting agent output into another event system
* Observability pipelines
* Simple noninteractive integrations

Use the SDK instead when the host needs to invoke methods during execution or hold an in-process session object.

---

# 22. RPC mode

Start the server process:

```bash
pi --mode rpc
```

Then send newline-delimited JSON requests through standard input and read newline-delimited responses from standard output.

The protocol supports operations such as:

* `prompt`
* `steer`
* `follow_up`
* `abort`
* Creating a new session
* Session navigation
* Model selection

Request identifiers allow the caller to correlate responses with commands.

A conceptual request:

```json
{"id":"req-1","type":"prompt","message":"Analyze the repository"}
```

A later steering request:

```json
{"id":"req-2","type":"steer","message":"Focus on the API package"}
```

## 22.1 Framing requirements

RPC uses line-feed-delimited JSON. The official documentation warns that some convenient line-reading abstractions—particularly Node’s standard `readline` behavior around Unicode line separators—do not exactly implement the protocol’s framing requirements. A protocol client should split only on the specified line-feed framing or use the official SDK from Node.

## 22.2 Process-management requirements

A robust RPC supervisor should:

* Keep stdout exclusively for protocol messages.
* Capture stderr independently.
* Detect process termination.
* Enforce request and tool timeouts.
* Support cancellation.
* Limit input size.
* Restart only with an explicit session-recovery strategy.
* Avoid logging secrets from prompts or events.

---

# 23. Security model

## 23.1 Default authority

Pi does not contain an internal general-purpose sandbox. By default, it operates with the permissions of the user or process that launched it.

That means the agent may potentially:

* Read files accessible to the process.
* Modify or delete files.
* Run programs.
* Access local credentials.
* Reach network services.
* Invoke cloud CLIs using ambient credentials.
* Modify repositories.
* Install dependencies.
* Send data to a configured model provider.

## 23.2 Prompt injection

When Pi reads untrusted repositories, issue trackers, webpages, generated files, or command output, those materials may contain instructions intended to manipulate the agent.

Project trust prevents some repository-provided Pi resources from loading automatically, but ordinary file content can still influence model behavior once read.

Treat the following as untrusted input:

* Repository documentation from unknown sources
* Comments and test fixtures
* Generated logs
* Web content
* Dependency source
* Issue and pull-request text
* Tool output
* Pasted terminal output

## 23.3 Recommended isolation

For untrusted work, run Pi in:

* A disposable container
* A virtual machine
* A microVM
* A restricted development environment
* A separate operating-system account

The official security guidance recommends external isolation, restricted credentials, and network controls rather than relying on the harness to police itself.

A conservative container profile should provide:

* A copy of the repository rather than the host’s entire home directory
* No SSH-agent socket
* No cloud-credential directories
* No Docker socket
* No production kubeconfig
* A restricted or disabled network
* A non-root user
* CPU, memory, process, and disk limits
* Explicitly mounted output directories

## 23.4 Git is recovery, not containment

A clean branch and frequent commits make accidental code changes easier to inspect or revert, but Git does not protect:

* Untracked files outside the repository
* Credentials
* Databases
* Cloud resources
* Network services
* Shell-history data
* Files excluded by `.gitignore`

Use both version control and process isolation.

---

# 24. Recommended operating profiles

## 24.1 Trusted local development

Use when the repository and extensions are controlled by you:

```bash
git switch -c agent/task-name
pi
```

Recommended workflow:

1. Ask for analysis before edits.
2. Request a proposed file list.
3. Let the agent implement.
4. Run focused tests.
5. Inspect `git diff`.
6. Run the broader validation suite.
7. Commit a checkpoint.

## 24.2 Read-only audit

```bash
pi \
  --tools read,grep,find,ls \
  --no-session \
  -p "Audit this repository for security and correctness risks."
```

This removes Pi’s normal file-writing and shell tools. It does not prevent an extension tool from having side effects unless extensions are also disabled.

For a cleaner audit:

```bash
pi \
  --tools read,grep,find,ls \
  --no-extensions \
  --no-skills \
  --no-prompt-templates \
  --no-session \
  -p "Review the repository without making changes."
```

## 24.3 Untrusted repository review

Recommended pattern:

```text
Host
  └── disposable isolated environment
        ├── repository copy
        ├── restricted network
        ├── temporary credentials only
        └── Pi
```

Reject project resources unless they have been reviewed:

```bash
pi --no-approve
```

Project trust is only one layer; also remove ambient host access.

## 24.4 CI or batch processing

```bash
pi \
  --mode json \
  --no-session \
  --no-extensions \
  --provider <provider> \
  --model <model-id> \
  "Analyze the changed files and report likely defects."
```

For deterministic CI behavior:

* Pin the Pi version.
* Pin package versions.
* Select the model explicitly.
* Select tools explicitly.
* Disable automatic project resources unless required.
* Set a timeout outside Pi.
* Store the raw event stream.
* Treat model output as advisory unless independently validated.

## 24.5 Embedded application

Use the SDK when:

* Node or TypeScript is the host environment.
* The application needs event-level control.
* Custom tools are supplied programmatically.
* Sessions belong to application users.
* The UI is not Pi’s terminal UI.

Use RPC when language or process boundaries make direct SDK embedding unsuitable.

---

# 25. Effective prompting patterns

## 25.1 Repository orientation

```text
Map this repository before editing anything.

Identify:
1. Major packages and entry points
2. The request/data flow
3. Build and test commands
4. Important conventions
5. Areas relevant to <task>

Cite the files supporting each conclusion.
```

## 25.2 Constrained implementation

```text
Implement <change>.

Constraints:
- Do not change the public API.
- Do not add dependencies.
- Follow existing patterns.
- Modify only files required for the change.
- Add or update tests.
- Run the narrowest relevant validation first.

Before editing, state the likely root cause and planned files.
After editing, summarize the diff and test results.
```

## 25.3 Debugging

```text
Diagnose this failure before attempting a fix.

Separate:
- observed facts
- hypotheses
- evidence for each hypothesis
- the smallest experiment that distinguishes them

Do not weaken tests merely to make them pass.
```

## 25.4 Review

```text
Review the current diff as a senior maintainer.

Prioritize:
1. correctness
2. security
3. data-loss or compatibility risk
4. missing tests
5. maintainability

Report only actionable findings. Include file and line references.
Do not edit files.
```

## 25.5 Refactoring

```text
Refactor <area> without changing observable behavior.

First identify existing invariants and tests.
Make changes in small steps.
Run tests after each meaningful step.
Avoid unrelated formatting or renaming.
```

The most reliable prompts define the expected outcome, constraints, validation commands, and stopping condition.

---

# 26. Workflow practices

## 26.1 Separate discovery from execution

A productive sequence is:

```text
1. Explain the system.
2. Identify the likely cause.
3. Propose the smallest change.
4. Implement.
5. Validate.
6. Review the diff.
```

This makes it easier to detect a wrong model assumption before it becomes a large patch.

## 26.2 Keep tool results focused

Instead of asking:

```text
Run all tests.
```

start with:

```text
Run the single test file associated with this component.
```

Large logs consume context and may trigger unnecessary compaction.

## 26.3 Use conversation branches

Create a branch when comparing materially different strategies rather than repeatedly reversing direction in one linear context.

## 26.4 Compact at phase boundaries

Good compaction boundaries include:

* After repository orientation
* After root-cause identification
* Before implementation
* Before producing final documentation
* After a large failed approach is abandoned

## 26.5 Preserve external evidence

The model’s summary is not a substitute for:

* Test output
* Compiler output
* Static-analysis results
* Benchmarks
* Database migration validation
* Human code review

Ask Pi to run and report these checks, but retain the original output when it matters.

---

# 27. Troubleshooting

## 27.1 No models are available

Check:

```bash
pi --list-models
```

Then verify:

* `/login` completed successfully.
* The expected environment variable exists.
* `auth.json` contains the intended provider entry.
* A command-backed credential helper succeeds outside Pi.
* The provider configuration is valid.
* Offline mode is not preventing required discovery.

Credential precedence may cause an old `auth.json` entry to override a newer environment variable.

## 27.2 Project extension or skill does not load

Check:

1. Whether the project is trusted.
2. Whether resource discovery was disabled by a CLI flag.
3. Whether the file is in a recognized directory.
4. Whether `.pi/settings.json` includes or filters the resource.
5. Whether `/reload` has been run.
6. Whether the extension threw an initialization error.

Project resources may be deliberately suppressed in noninteractive mode until trust is resolved.

## 27.3 The wrong previous session opens

Sessions are associated with working directories. Confirm:

```bash
pwd
```

Then use:

```bash
pi -r
```

or explicitly pass:

```bash
pi --session <reference>
```

A custom `--session-dir` or settings override may also change where sessions are found.

## 27.4 Context fills too quickly

Possible remedies:

* Run `/compact`.
* Start a new branch.
* Avoid dumping huge logs into context.
* Use `!!` for commands the model does not need.
* Reference only relevant files.
* Reduce verbose tool output through an extension.
* Adjust `keepRecentTokens`.
* Use a model with a larger context window.

## 27.5 Keyboard shortcuts do not work

The terminal, window manager, shell, or multiplexer may consume the key first.

Check:

```text
~/.pi/agent/keybindings.json
```

and adjust either Pi or the terminal mapping. Run `/reload` afterward.

## 27.6 Repeated provider errors

Pi’s retry settings are enabled by default with a limited number of attempts and an increasing delay. Verify the provider status, account limits, request size, model name, and retry configuration before increasing retry counts.

## 27.7 Headless execution hangs

Likely causes include:

* A project-trust decision awaiting input
* A provider login requirement
* A tool command waiting for interactive input
* A long-running subprocess
* An extension displaying UI
* A network request without an external timeout

For headless environments, resolve trust explicitly, use noninteractive credentials, disable unnecessary extensions, and enforce a process-level timeout.

---

# 28. Command reference

## Startup

```bash
pi
pi -p "prompt"
pi --mode json "prompt"
pi --mode rpc
```

## Sessions

```bash
pi -c
pi -r
pi --session <reference>
pi --session-dir <directory>
pi --no-session
pi --name <name>
```

## Models

```bash
pi --provider <provider>
pi --model <model-id>
pi --api-key <credential>
pi --thinking <level>
pi --list-models
pi --models <filter>
```

## Tools

```bash
pi --tools read,grep,find,ls
pi --exclude-tools bash
pi --no-builtin-tools
pi --no-tools
```

## Resources

```bash
pi -e ./extension.ts
pi --no-extensions
pi --skill <skill>
pi --no-skills
pi --prompt-template <template>
pi --no-prompt-templates
pi --theme <theme>
pi --no-themes
pi --no-context-files
```

## Trust and connectivity

```bash
pi --approve
pi --no-approve
pi --offline
```

The full set of options is version-dependent; use:

```bash
pi --help
```

for the installed version.

---

# 29. Choosing among extension mechanisms

| Need                                 | Best mechanism                  |
| ------------------------------------ | ------------------------------- |
| Reusable written procedure           | Skill                           |
| Parameterized recurring prompt       | Prompt template                 |
| New model-callable capability        | Extension tool                  |
| New user command                     | Extension command               |
| Tool-call approval or policy         | Extension event hook            |
| Custom provider                      | Extension/provider registration |
| Terminal colors and appearance       | Theme                           |
| Distribute a collection of resources | Package                         |
| Build a custom Node application      | SDK                             |
| Integrate from another language      | RPC                             |
| Process structured one-shot output   | JSON mode                       |
| Simple shell invocation              | Print mode                      |

---

# 30. Framework limitations

Pi’s minimalism is a strength when customization and observability matter, but it also means:

* It is not an internal security boundary.
* It does not provide a built-in enterprise policy engine.
* It does not guarantee deterministic model behavior.
* It does not validate that a generated patch is correct.
* It does not replace source control or CI.
* It does not automatically isolate credentials.
* It does not impose a planning methodology.
* It does not provide every orchestration feature by default.
* Extension and package quality varies.
* Model-provider behavior and model IDs change independently of Pi.

The harness should therefore be treated as a capable execution environment whose authority must be bounded externally.

---

# 31. Suggested organizational rollout

For a team adopting Pi, a controlled rollout can use five layers.

## Layer 1: Global instructions

Create a concise organization-level `AGENTS.md` containing:

* Approved package manager
* Required test commands
* Security constraints
* Generated-file rules
* Dependency policy
* Sensitive-directory policy

## Layer 2: Repository instructions

Each repository should document:

* Architecture
* Local validation commands
* Code-generation process
* Migration constraints
* Deployment-sensitive areas
* Definition of done

## Layer 3: Shared skills

Publish skills for:

* Pull-request review
* Database migrations
* Incident debugging
* Security review
* Release preparation
* Performance investigation

## Layer 4: Policy extensions

Develop reviewed extensions that:

* Block known destructive commands
* Redact sensitive tool output
* Add internal documentation search
* Run approved CI queries
* Add organization-specific tools
* Log auditable agent lifecycle events

## Layer 5: Isolation

Run high-risk work in controlled environments with:

* Short-lived credentials
* Restricted networks
* Repository-scoped filesystems
* Explicit tool sets
* Central logging
* Version-pinned packages

This structure preserves Pi’s flexibility while moving repeatable organizational requirements into reviewable artifacts.

---

# 32. Final mental model

A useful way to reason about Pi is:

```text
Pi = model access
   + agent loop
   + tools
   + session/context management
   + terminal/programmatic interfaces
   + user-controlled extensions
```

It is not the model itself, and it is not a complete software-development process. The effectiveness of a Pi deployment depends on six inputs:

1. **Model:** reasoning ability, speed, cost, and context.
2. **Instructions:** global, project, system, skills, and prompts.
3. **Tools:** what the agent can observe and change.
4. **Environment:** files, commands, credentials, and network access.
5. **Extensions:** policies, integrations, and workflow behavior.
6. **Validation:** tests, reviews, isolation, and human oversight.

For ordinary local development, Pi offers a transparent terminal coding agent. For advanced users, it becomes a programmable agent runtime. For organizations, it can serve as a small foundation on which to build controlled internal coding-agent workflows—provided that execution authority, package trust, credentials, and validation are handled explicitly.
