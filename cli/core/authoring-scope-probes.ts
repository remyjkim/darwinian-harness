// ABOUTME: Default probe runners for authoring-scope auto-derivation.
// ABOUTME: Bun-native subprocess; absent, failing, or slow `gh`/`git` is a clean null, never a hang.

const PROBE_TIMEOUT_MS = Number(process.env.DRWN_PROBE_TIMEOUT_MS ?? 15_000);

export async function defaultProbeGh(): Promise<string | null> {
  return runCapturing(["gh", "api", "user", "-q", ".login"]);
}

export async function defaultProbeGit(args: string[]): Promise<string | null> {
  return runCapturing(["git", ...args]);
}

async function runCapturing(cmd: string[]): Promise<string | null> {
  try {
    // stdin is closed so the probe can never block reading it, and a timeout kills a
    // hung probe so an unresponsive `gh`/`git` degrades to null instead of blocking forever.
    const proc = Bun.spawn(cmd, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // The process may have already exited.
      }
    }, PROBE_TIMEOUT_MS);
    const exitCode = await proc.exited;
    clearTimeout(timer);
    if (exitCode !== 0) return null;
    const text = (await new Response(proc.stdout).text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
