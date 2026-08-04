// ABOUTME: Resolves interactive command modes without tying behavior to Clipanion.
// ABOUTME: Keeps TTY safety rules testable for init and future guided add flows.

export type InitMode = "guided" | "minimal" | "error";
export type InstallDecisionMode = "prompt" | "install" | "skip" | "error";

export function resolveInitMode(options: {
  guided: boolean;
  minimal: boolean;
  nonInteractive: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}): { mode: InitMode; message?: string } {
  if (options.guided && (options.minimal || options.nonInteractive)) {
    return { mode: "error", message: "Use either --guided or non-interactive init flags, not both." };
  }

  if (options.guided) {
    return options.stdinIsTTY && options.stdoutIsTTY
      ? { mode: "guided" }
      : { mode: "error", message: "Guided init requires a TTY. Use --non-interactive for scripts." };
  }

  if (options.minimal || options.nonInteractive) {
    return { mode: "minimal" };
  }

  if (options.stdinIsTTY && options.stdoutIsTTY) {
    return { mode: "guided" };
  }

  return { mode: "error", message: "drwn init defaults to guided mode. Use --non-interactive for scripts." };
}

export function resolveRecommendedWorkerChoice(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "" || normalized === "y" || normalized === "yes";
}

export function resolveInstallDecisionMode(options: {
  install: boolean;
  noInstall: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}): { mode: InstallDecisionMode; message?: string } {
  if (options.install && options.noInstall) {
    return { mode: "error", message: "Use either --install or --no-install, not both." };
  }
  if (options.install) {
    return { mode: "install" };
  }
  if (options.noInstall) {
    return { mode: "skip" };
  }
  if (options.stdinIsTTY && options.stdoutIsTTY) {
    return { mode: "prompt" };
  }
  return { mode: "error", message: "MarkItDown setup needs an install decision. Use --install or --no-install for scripts." };
}
