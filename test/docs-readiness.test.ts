// ABOUTME: Verifies user-facing documentation covers the implemented CLI surface and key future-facing release topics.
// ABOUTME: Protects operator docs from drifting behind the actual command surface and distribution plans.

import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readDocsTree(relativeRoot: string) {
  const root = fileURLToPath(new URL(relativeRoot, import.meta.url));
  const paths = (await readdir(root, { recursive: true }))
    .filter((path) => path.endsWith(".md") || path.endsWith(".mdx") || path.endsWith(".html"));
  return (await Promise.all(paths.map((path) => readFile(join(root, path), "utf8")))).join("\n");
}

describe("documentation readiness", () => {
  test("current docs publish the ID-based Deployed Worker management hard cut", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const quickref = readFileSync(join(root, "docs", "cli-quickref.md"), "utf8");
    const worker = readFileSync(join(root, "docs-docusaurus", "docs", "reference", "cli", "worker.md"), "utf8");
    for (const source of [readme, quickref, worker]) {
      expect(source).toContain("drwn org list");
      expect(source).toContain("drwn worker register");
      expect(source).toContain("drwn worker retire");
      expect(source).not.toContain("worker status <slug>");
      expect(source).not.toContain("worker deploy <rootRef> --name");
      expect(source).not.toContain("worker secret set <slug>");
    }
  });
  test("publishes auth, Worker, provider-neutral Mind, and exact release boundaries without claiming live qualification", async () => {
    const [
      readme,
      quickref,
      mind,
      worker,
      login,
      refresh,
      logout,
      analyze,
      whoami,
      sidebars,
      releaseProcess,
      publishing,
      changelog,
    ] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/cli-quickref.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/mind.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/worker.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/login.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/refresh.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/logout.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/analyze.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/whoami.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/sidebars.ts", import.meta.url), "utf8"),
      readFile(new URL("../docs/release-process.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/publishing.md", import.meta.url), "utf8"),
      readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
    ]);

    const commandOverview = `${readme}\n${quickref}`;
    for (const command of [
      "drwn worker mind",
      "drwn worker status [deployedWorkerId] [--json]",
      "drwn worker materialize --payload",
      "drwn worker buzz-tools",
      "drwn worker secret set",
      "drwn login --json",
      "drwn refresh --json",
      "drwn logout --json --require-remote-revoke",
      "drwn analyze sessions",
    ]) expect(commandOverview).toContain(command);

    const authDocs = `${quickref}\n${login}\n${refresh}\n${logout}`;
    for (const token of [
      "payload v3",
      "envelope v2",
      "CREDENTIAL_SCHEMA_UNSUPPORTED",
      "DRWN_TOKEN",
      "never persisted",
      "sanitized",
      "require-remote-revoke",
    ]) expect(authDocs).toContain(token);
    for (const forbidden of ["access token", "refresh token", "email", "credential path", "key reference"]) {
      expect(authDocs).toContain(forbidden);
    }

    const workerDocs = `${quickref}\n${mind}\n${worker}`;
    for (const token of [
      "deployed-worker.v1",
      "UNSUPPORTED_PROTOCOL",
      "SERVER_RESPONSE_INVALID",
      "deployedWorkerId",
      "MIND_BACKEND_UNSELECTED",
      "provider-neutral",
    ]) expect(workerDocs).toContain(token);
    expect(analyze).toContain("Foundry");
    expect(analyze).toContain("DRWN_ANALYZER_URL");
    expect(whoami).toContain("DAH identity");
    expect(whoami).toContain("DRWN_TOKEN");
    expect(whoami).not.toContain("Analyzer");
    expect(whoami).not.toContain("DRWN_ANALYZER_URL");
    expect(sidebars).not.toContain("reference/cli/acp");
    expect(sidebars).toContain("reference/cli/mind");
    expect(sidebars).toContain("reference/cli/worker");
    expect(sidebars).toContain("reference/cli/refresh");

    for (const token of [
      "darwinian-npm-publish",
      "dry_run: true",
      "build identity",
      "dry-run run ID and attempt",
      "artifact ID and digest",
      "annotated `v1.4.2` tag",
      "exact tarball",
      "release-recovery.yml",
      "source availability",
      "installed qualification",
      "I236",
      "I238",
      "Services adoption",
    ]) expect(releaseProcess).toContain(token);
    // The approver identity is declared in scripts/release/release-policy.json, so the
    // release docs must not reassert a second-person control the receipt no longer proves.
    for (const stale of ["independent approval", "independently approved", "independently reviewed"]) {
      expect(releaseProcess).not.toContain(stale);
    }
    expect(releaseProcess).toContain("scripts/release/release-policy.json");
    const cliPublishing = publishing.split("## Publishing `drwn-command-bridge`")[0]!;
    expect(cliPublishing).not.toContain("independently approved");
    expect(cliPublishing).toContain("DARWINIAN_GITHUB_PUBLICATION_CONTROLS_JSON");
    expect(cliPublishing).not.toContain("NPM_ORG_TOKEN");
    expect(cliPublishing).not.toContain("TMP_NPMRC");
    expect(cliPublishing).not.toContain("--userconfig");
    expect(cliPublishing).toContain("No local token fallback");

    expect(changelog).toContain("## [1.2.0] - 2026-08-07");
    expect(changelog).toContain("## [1.1.0] - 2026-08-05");
    expect(changelog).toContain("## [1.0.0] - 2026-08-03");
    expect(changelog).toContain("does not claim live I238 qualification");
  });

  test("I176 and I177 completion handoffs reconcile the approved plans with delivered state", async () => {
    const [i176, i177] = await Promise.all([
      readFile(new URL("../.ai/tasks/cl0176_completion_card_source_path_reform.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/tasks/cl0177_completion_machine_scope_blueprint.md", import.meta.url), "utf8"),
    ]);
    const handoffs: Array<[string, string, string]> = [
      [i176, "[I176]", "1fc03e6910a8e2a391a9dd4d53a2ec9513d27c1d"],
      [i177, "[I177]", "b4817b1d64c76c7f31b06b44a1390cc79f1ce49c"],
    ];

    for (const [handoff, issue, merge] of handoffs) {
      expect(handoff).toContain(issue);
      expect(handoff).toContain("Approved plan versus delivered result");
      expect(handoff).toContain(merge);
      expect(handoff).toContain("Post-merge");
      expect(handoff.toLowerCase()).toContain("rollback");
    }
    expect(i176).toContain("1b9a53f8f0f72fd859b83ba847c5f161e027c6d6");
    for (const finalEvidence of [
      "1b9a53f8f0f72fd859b83ba847c5f161e027c6d6",
      "30875268803",
      "30875268802",
      "ff5a359536726cebddb64702eafae92a889297ec8d975b2fa8a7d74724ad18a8",
    ]) {
      expect(i177).toContain(finalEvidence);
    }
  });

  test("production deployment and public links use the live canonical docs domain", async () => {
    const documents = await Promise.all([
      readFile(new URL("../.github/workflows/docs-deploy-production.yml", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docusaurus.config.ts", import.meta.url), "utf8"),
      readFile(new URL("../docs/cli-quickref.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/docs-cicd.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/DEPRECATED.md", import.meta.url), "utf8"),
      readFile(new URL("../lychee.toml", import.meta.url), "utf8"),
    ]);

    for (const document of documents) {
      expect(document).toContain("docs.darwinian.dev");
      expect(document).not.toContain("darwiniantools.com");
    }
    expect(documents[0]).toContain("PROD_URL: https://docs.darwinian.dev");
  });

  test("active non-Docusaurus Mind docs publish the semantic Worker-bound contract", async () => {
    const docs = (await Promise.all([
      readFile(new URL("../.ai/knowledges/12_mind-card-lifecycle-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/analyses/113_mind-card-engineering-guide.html", import.meta.url), "utf8"),
      readFile(new URL("../.ai/analyses/114_drwn-worker-cli-architecture.html", import.meta.url), "utf8"),
    ])).join("\n");

    for (const token of [
      '"observations"',
      '"insights"',
      "/pool/observations/",
      "/pool/insights/",
      "drwn.mind-index",
      "drwn worker mind provision",
      "selected Worker",
      "0.9.0",
    ]) {
      expect(docs).toContain(token);
    }
    for (const stale of [
      /\b[Ll][456]\b/,
      /\/pool\/l[456](?:\/|\b)/,
      /memory layer/i,
      /active (?:card |mind )?stack/i,
      /stack-ordered/i,
      /drwn (?:mind|worker stack) (?:list|use|clear)/,
      /activeWorkers|activeMinds/,
      /MINDS_MIN_DRWN_VERSION\s*=\s*0\.7\.0/,
    ]) {
      expect(docs).not.toMatch(stale);
    }
  });

  test("README, usage guide, and Homebrew checklist cover key scenarios", async () => {
    const [
      readme,
      quickref,
      usageGuide,
      projectGuide,
      bundleGuide,
      brewGuide,
      publishingHistory,
      knowledgeReadme,
      maintainerReadme,
      publishingGuide,
      releaseProcess,
      ...docsDocusaurusFiles
    ] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/cli-quickref.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/01_agents-cli-usage-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/02_per-project-config-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/03_npm-skill-bundles-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/04_homebrew-release-checklist.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/05_npm-publishing-analysis-and-manual.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/publishing.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/release-process.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/getting-started/paths/author-and-publish-card.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/getting-started/paths/use-team-harness.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/local-store.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/mcp-servers.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/authoring-multi-skill-cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/sharing-with-a-team.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/card.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/machine.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/extensions.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/status.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/write.md", import.meta.url), "utf8"),
    ]);
    const docsDocusaurus = docsDocusaurusFiles.join("\n");
    const docsAstro = await readDocsTree("../docs-astro/src/content/docs");
    const repoOperatorDocs = quickref + "\n" + usageGuide;

    // Usage-pattern coverage: every operator-facing detail must appear in
    // the in-repo operator docs (cli-quickref + agents CLI usage guide).
    for (const doc of [quickref, usageGuide]) {
      expect(doc).toContain("bun link");
      expect(doc).toContain("uv tool install --python 3.12 'markitdown[all]'");
      expect(doc).toContain("markitdown");
      expect(doc).toContain("beads");
      expect(doc).toContain("parallel");
    }
    for (const command of [
      "drwn write",
      "drwn scan",
      "drwn doctor",
      "drwn init",
      "drwn extensions",
      "drwn extensions setup parallel",
      "drwn extensions setup markitdown",
      "drwn machine skill list",
      "drwn card catalog publish",
    ]) {
      expect(quickref).toContain(command);
    }

    expect(brewGuide).toContain("Homebrew");
    expect(brewGuide).toContain("tagged release");
    expect(brewGuide).toContain("drwn");
    expect(brewGuide).toContain("current npm package: `darwinian`");
    expect(brewGuide).not.toContain("`dminds`");
    expect(publishingHistory).toContain("Historical incident record");
    expect(publishingHistory).toContain("superseded");
    for (const retired of ["NPM_ORG_TOKEN", "NPM_TOKEN repository secret", "manual flow below remains valid"]) {
      expect(publishingHistory).not.toContain(retired);
    }
    expect(knowledgeReadme).toContain("historical npm incident record");
    expect(maintainerReadme).toContain("exact-artifact OIDC");
    expect(maintainerReadme).toContain("docs-cicd.md");
    expect(maintainerReadme).toContain("skills-repo-submodule.md");
    expect(bundleGuide).toContain("`darwinian` remains the single first-party harness package");
    expect(bundleGuide).not.toContain("`darwinian-minds` remains a single first-party harness package");
    const bridgePublishing = publishingGuide.split("## Publishing `drwn-command-bridge`")[1]!;
    expect(bridgePublishing).toContain("set -euo pipefail");
    expect(bridgePublishing).toContain("--prefer-online");
    expect(bridgePublishing).toContain('.error.code == "E404"');
    expect(bridgePublishing).toContain("Registry result was indeterminate");
    expect(bridgePublishing).toContain("unset NPM_BRIDGE_TOKEN");

    // Slim README: brand identity, pitch, install, first run, doc pointers,
    // contributing. Deep content (Disciplines, Safety model, "What it
    // harnesses", "Why this exists") lives in the docs site; the README links
    // to the corresponding concepts pages.
    expect(readme).toContain("local meta-harness");
    expect(readme).toContain("The package is `darwinian`. The command is `drwn`.");
    expect(readme).toContain("<img src=\"./docs/assets/darwinian-worker-logo.png\"");
    expect(readme).toContain("Install");
    expect(readme).toContain("First run");
    expect(readme).toContain("Documentation");
    expect(readme).toContain("Contributing");
    expect(readme).toContain("docs-docusaurus");
    expect(readme).toContain("docs/cli-quickref.md");
    expect(readme).toContain("bun run docs:build");
    expect(readme).toContain("drwn write");
    expect(readme).toContain("drwn status");
    expect(readme).toContain("concepts/disciplines");
    expect(readme).toContain("concepts/safety-model");
    expect(readme).toContain("Whole-Store export is unavailable");
    expect(readme).toContain("drwn machine inventory bundle");

    // cli-quickref carries the usage-pattern content the slim README points to.
    expect(quickref).toContain("Usage modes");
    expect(quickref).toContain("Command reference");
    expect(quickref).toContain("Per-project configuration");
    expect(quickref).toContain("Extension skill bundles");
    expect(quickref).toContain("Optional extensions");
    expect(quickref).toContain("How write works");
    expect(quickref).toContain("How export works");
    expect(quickref).toContain("drwn machine skill|mcp enable|disable");
    expect(quickref).toContain("fail nonzero with");
    expect(quickref).toContain("drwn machine inventory gc");
    for (const command of ["inventory export", "inventory bundle", "inventory verify", "inventory sync"]) {
      expect(quickref).toContain(command);
      expect(docsDocusaurus).toContain(command);
    }
    for (const boundary of [
      "not a backup or restore",
      "checksum is not authenticity",
      "source-content safeguard",
      "extras are preserved",
      "no `machine.json`",
    ]) {
      expect(quickref + docsDocusaurus).toContain(boundary);
    }
    expect(quickref).toContain("--mode direct");
    expect(quickref).toContain("https://github.com/curation-labs/dm-cards-catalog-v1.git");
    expect(quickref).toContain("@community");
    expect(quickref).toContain("registry/config.json");
    expect(quickref).toContain("registry/mcp-servers.json");
    expect(quickref).toContain("drwn apply");
    expect(quickref).toContain("No public command archives the whole");

    expect(repoOperatorDocs).toContain("drwn apply");
    expect(usageGuide).toContain("No public command creates a broad archive");
    expect(usageGuide).toContain("<project>/.agents/drwn/config.json");
    expect(usageGuide).toContain("~/.agents/drwn/machine.json");
    expect(usageGuide).toContain("~/.agents/drwn/mcp-servers");
    expect(usageGuide).toContain("~/.agents/drwn/skills");
    expect(usageGuide).toContain("drwn write --force");
    expect(usageGuide).toContain("drwn status --why");
    expect(usageGuide).toContain("drwn machine skill install");
    expect(usageGuide).toContain("drwn machine mcp add");
    expect(usageGuide).toContain("drwn card catalog publish");
    expect(usageGuide).toContain("catalog refresh");
    expect(usageGuide).toContain("https://github.com/curation-labs/dm-cards-catalog-v1.git");
    expect(usageGuide).toContain("repo-native and installed package-backed skills");
    expect(usageGuide).toContain("darwinian-minds");
    expect(usageGuide).toContain("local harness");
    expect(usageGuide).toContain("drwn apply");
    expect(projectGuide).toContain("Discovery walks upward");
    expect(projectGuide).toContain("\"schema\": \"drwn.project-config\"");
    expect(projectGuide).toContain("\"schemaVersion\": 1");
    expect(projectGuide).toContain("skills.include");
    expect(projectGuide).toContain("skills.exclude");
    expect(projectGuide).toContain("extensions.parallel");
    expect(projectGuide).toContain("extensions.beads");
    expect(projectGuide).toContain("extensions.markitdown");
    expect(projectGuide).toContain("markitdown-document-conversion");
    expect(bundleGuide).toContain("bundle.json");
    expect(bundleGuide).toContain("npm pack");
    expect(bundleGuide).toContain("available");
    expect(bundleGuide).toContain("selected Worker closure");
    expect(bundleGuide).toContain("~/.agents/drwn/skills");
    expect(bundleGuide).toContain('"schema": "drwn.machine"');
    expect(brewGuide).toContain("drwn machine inventory gc --json");
    expect(brewGuide).toContain("drwn card list --json");
    expect(docsDocusaurus).toContain("Cards");
    expect(docsDocusaurus).toContain("Machine Inventory");
    expect(docsDocusaurus).toContain("drwn extensions add");
    expect(docsDocusaurus).toContain("drwn card");
    expect(docsDocusaurus).toContain("drwn card catalog publish");
    expect(docsDocusaurus).toContain("https://github.com/curation-labs/dm-cards-catalog-v1.git");
    expect(docsDocusaurus).toContain("@community");
    expect(docsDocusaurus).toContain("drwn machine inventory gc");
    expect(docsDocusaurus).toContain("drwn apply");
    expect(docsDocusaurus).toContain("drwn update");
    expect(docsDocusaurus).toContain("drwn write --force");
    expect(docsDocusaurus).toContain("drwn status --why");
    expect(docsDocusaurus).toContain("~/.agents/drwn/machine.json");
    expect(docsDocusaurus).toContain("~/.agents/drwn/skills");
    expect(docsDocusaurus).toContain("~/.agents/drwn/mcp-servers");
    expect(docsDocusaurus).toContain("Whole-Store archive creation is unavailable");
    for (const command of [
      "drwn card source list",
      "drwn card source show",
      "drwn card source doctor",
      "drwn card source add-skill",
      "drwn card source remove-skill",
      "drwn card source set",
      "drwn card source add-mcp",
      "drwn card source remove-mcp",
      "--stability",
      "--last-validated-with",
      "--test-status-badge",
    ]) {
      expect(readme + quickref + usageGuide + docsDocusaurus).toContain(command);
    }
    expect(docsDocusaurus).not.toContain("Coming soon");
    expect(docsDocusaurus).not.toContain("drwn add extension");
    expect(docsDocusaurus).not.toContain("Machine-wide active MCP defaults live in `~/.agents/drwn/config.json`");
    expect(docsDocusaurus).not.toContain("package-backed skills and user MCP definitions under `~/.agents/library`");
    expect(knowledgeReadme).toContain("Operator Docs");
    expect(knowledgeReadme).toContain("Distribution And Release Docs");
    expect(maintainerReadme).toContain("publishing.md");
    expect(publishingGuide).toContain("TMP_NPMRC");
    expect(publishingGuide).toContain("--userconfig");
    expect(releaseProcess).toContain("Releasing a new CLI version");
    expect(releaseProcess).toContain("bun run verify:release");
    expect(releaseProcess).toContain("git tag -a v");
    expect(releaseProcess).toContain("npm-publish");
    expect(releaseProcess).toContain("npm view darwinian@");
    expect(releaseProcess).toContain("drwn-command-bridge");
    expect(releaseProcess).toContain("native macOS");
    expect(releaseProcess).toContain("npm publish --access public");

    const machineDocs = [readme, quickref, usageGuide, projectGuide, bundleGuide].join("\n");
    for (const token of [
      '"schema": "drwn.machine"',
      '"schemaVersion": 2',
      '"activeWorker"',
      '"workerLock"',
      "@curation-labs/machine-defaults",
      "Operator 2.0.2",
      "drwn apply --root",
      "drwn use --root",
      "--scope machine",
      "drwn machine skill references",
      "drwn machine mcp references",
      "drwn write --root",
      "MACHINE_PROJECTION_CONFLICT",
      "operator-owned runtime state",
    ]) {
      expect(machineDocs).toContain(token);
    }
    for (const stale of [
      /drwn skills (?:curate|uncurate)/,
      /drwn (?:library|store)(?:\s|`)/,
      /drwn skills (?:list|packages)/,
      /future Task 80/i,
      /"defaults"\s*:/,
      /defaults\.(?:skills|mcpServers)/,
      /curated publication layer/i,
    ]) {
      expect(machineDocs).not.toMatch(stale);
      expect(docsDocusaurus).not.toMatch(stale);
    }
    for (const stale of [
      /drwn card (?:add|apply|pin|remove|update|detach)/,
      /"cards"\s*:/,
      /built-in defaults \+ user library/,
      /machine inventory export --out\b/,
    ]) {
      expect(docsAstro).not.toMatch(stale);
    }
  });

  test("forward docs publish only the first supported project Worker contract", async () => {
    const [contract, reset, readme, install, quickref, workerHelp, docusaurus] = await Promise.all([
      readFile(new URL("../docs/contracts/project-worker-v1.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/prelaunch-project-reset.md", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../INSTALL.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/cli-quickref.md", import.meta.url), "utf8"),
      readFile(new URL("../cli/commands/worker/worker.ts", import.meta.url), "utf8"),
      readDocsTree("../docs-docusaurus/docs"),
    ]);
    const knowledge = (await Promise.all([
      "01_agents-cli-usage-guide.md",
      "02_per-project-config-guide.md",
      "09_cards-manual-test-guide.md",
      "10_drwn-cli-architecture.md",
      "11_card-usage-guide.html",
    ].map((name) => readFile(new URL(`../.ai/knowledges/${name}`, import.meta.url), "utf8")))).join("\n");
    const astro = await readDocsTree("../docs-astro/src/content/docs");
    const forwardDocs = [readme, install, quickref, workerHelp, knowledge, docusaurus, astro].join("\n");

    for (const schema of ["drwn.project-config", "drwn.project-lock", "drwn.project-local", "drwn.generated-worker"]) {
      expect(contract).toContain(schema);
    }
    for (const command of ["drwn add", "drwn apply", "drwn use", "drwn write"]) {
      expect(contract).toContain(command);
      expect(forwardDocs).toContain(command);
    }
    expect(contract).toContain("activeWorker");
    expect(contract).toContain("null");
    expect(contract).toContain("one aggregate");
    expect(contract).toContain("declared");
    expect(contract).toContain("ambient");
    expect(contract).toContain("OAuth");
    expect(contract).toContain("No public command creates a whole-Store archive");
    expect(contract).toContain("Task 82");
    expect(contract).toContain("Operator 2.0.2");
    expect(contract).toContain("@curation-labs/machine-defaults");
    expect(reset).toContain("controlled prelaunch reset");
    expect(reset).toContain("no automated migration");

    for (const stale of [
      /activeWorkers/,
      /drwn worker stack/,
      /active worker stack/i,
      /all installed workers are active/i,
      /drwn card (?:add|apply|remove|pin|update|detach)/,
      /--no-apply/,
      /COMMAND_MOVED/,
      /config\.json\.cards/,
      /"lockfileVersion"/,
      /activeMinds/,
      /active mind stack/i,
      /drwn mind (?:list|use|clear)/,
    ]) {
      expect(forwardDocs).not.toMatch(stale);
    }
  });

  test("v1.4 docs explain per-agent launch contexts, Codex nesting, trust, pruning, and resume limits", async () => {
    const [concept, worker, schema, patterns, doctor, readme, changelog] = await Promise.all([
      readFile(new URL("../docs-docusaurus/docs/concepts/per-agent-worker-launch-contexts.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/worker.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/schemas/worker-launch-context-v1.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/per-project-patterns.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/doctor-in-ci.md", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
    ]);
    const all = [concept, worker, schema, patterns, doctor, readme, changelog].join("\n");
    for (const token of [
      "drwn worker launch-context prepare",
      "drwn.worker-launch-plan",
      "drwn.worker-launch-context",
      "drwn.worker-launch-receipt",
      "--enable-mcp",
      "--execute",
      "2.1.212",
      "0.149.0",
      "-C",
      "--add-dir",
      "relaunch_required",
      "RUN_DRWN_REAL_CLAUDE",
      "RUN_DRWN_REAL_CODEX",
      "RUN_DRWN_REAL_HERDR",
      "DRWN_LIVE_DRWN_BIN",
      "LAUNCH_CONTEXT_STORE_INVALID",
    ]) expect(all).toContain(token);
    expect(concept).toContain("active Worker");
    expect(concept).toContain("content-addressed");
    expect(concept).toContain("does not write to user home");
    expect(doctor).toContain("launchContexts");
    expect(changelog).toContain("## [1.4.2]");
  });
});
