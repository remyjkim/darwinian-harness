// ABOUTME: Verifies pure interactive mode resolution for commands that can prompt.
// ABOUTME: Keeps non-TTY safety semantics independent from Clipanion command tests.

import { describe, expect, test } from "bun:test";

describe("core interactivity", () => {
  test("defaults init to guided mode only when both stdin and stdout are TTYs", async () => {
    const { resolveInitMode } = await import("../cli/core/interactivity");

    expect(resolveInitMode({ guided: false, minimal: false, nonInteractive: false, stdinIsTTY: true, stdoutIsTTY: true }).mode).toBe("guided");
    expect(resolveInitMode({ guided: false, minimal: false, nonInteractive: false, stdinIsTTY: false, stdoutIsTTY: true }).mode).toBe("error");
  });

  test("uses minimal mode for explicit non-interactive flags", async () => {
    const { resolveInitMode } = await import("../cli/core/interactivity");

    expect(resolveInitMode({ guided: false, minimal: true, nonInteractive: false, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("minimal");
    expect(resolveInitMode({ guided: false, minimal: false, nonInteractive: true, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("minimal");
  });

  test("rejects guided mode without a TTY", async () => {
    const { resolveInitMode } = await import("../cli/core/interactivity");

    const result = resolveInitMode({ guided: true, minimal: false, nonInteractive: false, stdinIsTTY: false, stdoutIsTTY: false });
    expect(result.mode).toBe("error");
    expect(result.message).toContain("TTY");
  });

  test("preselects the recommended machine Worker unless the guided answer opts out", async () => {
    const { resolveRecommendedWorkerChoice } = await import("../cli/core/interactivity");

    expect(resolveRecommendedWorkerChoice("")).toBe(true);
    expect(resolveRecommendedWorkerChoice("yes")).toBe(true);
    expect(resolveRecommendedWorkerChoice("Y")).toBe(true);
    expect(resolveRecommendedWorkerChoice("n")).toBe(false);
    expect(resolveRecommendedWorkerChoice("no")).toBe(false);
  });

  test("resolves install decision mode for explicit MarkItDown setup flags", async () => {
    const { resolveInstallDecisionMode } = await import("../cli/core/interactivity");

    expect(resolveInstallDecisionMode({ install: true, noInstall: false, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("install");
    expect(resolveInstallDecisionMode({ install: false, noInstall: true, stdinIsTTY: false, stdoutIsTTY: false }).mode).toBe("skip");
  });

  test("rejects conflicting install flags", async () => {
    const { resolveInstallDecisionMode } = await import("../cli/core/interactivity");

    const result = resolveInstallDecisionMode({ install: true, noInstall: true, stdinIsTTY: true, stdoutIsTTY: true });
    expect(result.mode).toBe("error");
    expect(result.message).toContain("Use either --install or --no-install");
  });

  test("prompts only when install decision needs a TTY", async () => {
    const { resolveInstallDecisionMode } = await import("../cli/core/interactivity");

    expect(resolveInstallDecisionMode({ install: false, noInstall: false, stdinIsTTY: true, stdoutIsTTY: true }).mode).toBe("prompt");
    const result = resolveInstallDecisionMode({ install: false, noInstall: false, stdinIsTTY: false, stdoutIsTTY: false });
    expect(result.mode).toBe("error");
    expect(result.message).toContain("--install or --no-install");
  });
});
