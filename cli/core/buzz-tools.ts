// ABOUTME: Executes the narrow Buzz message-delivery command without a shell.
// ABOUTME: Message content travels only over stdin and failure details are redacted.

export interface BuzzDeliveryInput {
  channel: string;
  content: string;
  replyTo?: string;
}

export interface BuzzCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type BuzzCommandExecutor = (argv: string[], stdin: string) => Promise<BuzzCommandResult>;

export type BuzzDeliveryResult =
  | { ok: true; receipt: string }
  | { ok: false; error: string };

function requireNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must be non-empty`);
}

const channelIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventIdPattern = /^[0-9a-f]{64}$/i;

export async function executeBuzzDelivery(
  input: BuzzDeliveryInput,
  executor: BuzzCommandExecutor,
): Promise<BuzzDeliveryResult> {
  requireNonEmpty("channel", input.channel);
  requireNonEmpty("content", input.content);
  if (input.replyTo !== undefined) requireNonEmpty("replyTo", input.replyTo);
  if (!channelIdPattern.test(input.channel)) throw new Error("channel must be a UUID");
  if (input.replyTo !== undefined && !eventIdPattern.test(input.replyTo)) {
    throw new Error("replyTo must be a 64-character hexadecimal Nostr event id");
  }
  if (Buffer.byteLength(input.content, "utf8") > 65_536) {
    throw new Error("content exceeds Buzz's 65536-byte limit");
  }

  const argv = [
    "buzz", "messages", "send",
    "--channel", input.channel,
    "--content", "-",
    ...(input.replyTo === undefined ? [] : ["--reply-to", input.replyTo]),
  ];
  const result = await executor(argv, input.content);
  if (result.exitCode !== 0) {
    return { ok: false, error: `Buzz delivery failed with exit code ${result.exitCode}` };
  }
  return { ok: true, receipt: result.stdout.trim().slice(0, 4_096) };
}

export const executeBuzzCommand: BuzzCommandExecutor = async (argv, stdin) => {
  const process = Bun.spawn(argv, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  process.stdin.write(stdin);
  process.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};
