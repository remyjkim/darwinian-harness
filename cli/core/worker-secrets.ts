// ABOUTME: Parses local drwn worker secrets files for deployment-time MCP tokens.
// ABOUTME: Keeps implicit secret discovery on the current .drwn.secrets filename.

export const DRWN_SECRETS_FILE = ".drwn.secrets";

export function defaultSecretsFileCandidates(): string[] {
  return [DRWN_SECRETS_FILE];
}

export function parseSecretsFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const server = line.slice(0, eq).trim();
    const token = line.slice(eq + 1).trim();
    if (server && token) out[server] = token;
  }
  return out;
}
