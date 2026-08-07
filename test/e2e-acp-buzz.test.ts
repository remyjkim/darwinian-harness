// ABOUTME: Credential-gated relay E2E for Buzz ACP channel delivery and a threaded reply.
// ABOUTME: Runs only with DRWN_E2E_BUZZ=1 and real relay, identity, channel, and Worker inputs.

import { expect, test as baseTest } from "bun:test";
import { resolve } from "node:path";

const enabled = process.env.DRWN_E2E_BUZZ === "1";
const test = baseTest.skipIf(!enabled);

type BuzzEvent = {
  id?: unknown;
  pubkey?: unknown;
  content?: unknown;
  tags?: unknown;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`DRWN_E2E_BUZZ=1 requires ${name}`);
  return value;
}

function requiredPubkey(name: string): string {
  const value = required(name).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be a 64-character hexadecimal pubkey`);
  return value;
}

function triggerEnvironment(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    BUZZ_PRIVATE_KEY: required("DRWN_E2E_BUZZ_TRIGGER_PRIVATE_KEY"),
  };
  const triggerAuthTag = process.env.DRWN_E2E_BUZZ_TRIGGER_AUTH_TAG;
  if (triggerAuthTag) env.BUZZ_AUTH_TAG = triggerAuthTag;
  else delete env.BUZZ_AUTH_TAG;
  return env;
}

async function runBuzz(
  binary: string,
  env: Record<string, string | undefined>,
  args: string[],
): Promise<string> {
  const process = Bun.spawn([binary, ...args], {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    // Drain stderr without ever reflecting potentially sensitive relay diagnostics.
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`Buzz command failed with exit code ${exitCode}`);
  return stdout;
}

function hasReplyTag(event: BuzzEvent, parentId: string): boolean {
  if (!Array.isArray(event.tags)) return false;
  return event.tags.some((tag) =>
    Array.isArray(tag) && tag[0] === "e" && tag[1] === parentId
  );
}

async function waitForDelivery(options: {
  buzzBinary: string;
  channel: string;
  env: Record<string, string | undefined>;
  marker: string;
  postingPubkey: string;
  since: number;
  replyTo?: string;
}): Promise<BuzzEvent> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const stdout = await runBuzz(options.buzzBinary, options.env, [
      "messages", "get",
      "--channel", options.channel,
      "--since", String(options.since),
      "--limit", "200",
    ]);
    const events = JSON.parse(stdout) as BuzzEvent[];
    const match = events.find((event) =>
      event.pubkey === options.postingPubkey &&
      event.content === options.marker &&
      (options.replyTo === undefined || hasReplyTag(event, options.replyTo))
    );
    if (match) return match;
    await Bun.sleep(1_000);
  }
  throw new Error("Timed out waiting for the governed Buzz delivery evidence");
}

async function sendTrigger(options: {
  buzzBinary: string;
  channel: string;
  env: Record<string, string | undefined>;
  agentPubkey: string;
  content: string;
  replyTo?: string;
}): Promise<string> {
  const stdout = await runBuzz(options.buzzBinary, options.env, [
    "messages", "send",
    "--channel", options.channel,
    "--content", options.content,
    "--mention", options.agentPubkey,
    ...(options.replyTo ? ["--reply-to", options.replyTo] : []),
  ]);
  const result = JSON.parse(stdout) as { accepted?: unknown; event_id?: unknown };
  expect(result.accepted).toBe(true);
  if (typeof result.event_id !== "string" || !/^[0-9a-f]{64}$/i.test(result.event_id)) {
    throw new Error("Buzz trigger returned no valid event id");
  }
  return result.event_id;
}

test("real buzz-acp delivers a deployed Worker answer and a threaded reply", async () => {
  const slug = required("DRWN_E2E_DEPLOY_SLUG");
  const channel = required("DRWN_E2E_BUZZ_CHANNEL");
  required("BUZZ_PRIVATE_KEY");
  required("BUZZ_RELAY_URL");
  const agentPubkey = requiredPubkey("DRWN_E2E_BUZZ_AGENT_PUBKEY");
  const postingPubkey = process.env.DRWN_E2E_BUZZ_POSTING_PUBKEY
    ? requiredPubkey("DRWN_E2E_BUZZ_POSTING_PUBKEY")
    : agentPubkey;
  const buzzBinary = process.env.DRWN_E2E_BUZZ_BIN ?? "buzz";
  const buzzAcpBinary = process.env.DRWN_E2E_BUZZ_ACP_BIN ?? "buzz-acp";
  const triggerEnv = triggerEnvironment();
  const startedAt = Math.floor(Date.now() / 1_000) - 5;
  const firstMarker = `I105_BUZZ_CHANNEL_${Date.now()}`;
  const secondMarker = `I105_BUZZ_THREAD_${Date.now()}`;

  const harness = Bun.spawn([buzzAcpBinary], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_CWD: process.cwd(),
      BUZZ_ACP_AGENT_COMMAND: process.execPath,
      BUZZ_ACP_AGENT_ARGS: ["run", resolve("cli/index.ts"), "acp", "serve", slug].join(","),
      BUZZ_ACP_RESPOND_TO: "anyone",
      BUZZ_ACP_IDLE_TIMEOUT: "180",
      DRWN_ACP_SLUG: slug,
    },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });

  try {
    const startup = await Promise.race([
      harness.exited.then((exitCode) => ({ exitCode })),
      Bun.sleep(5_000).then(() => null),
    ]);
    if (startup) throw new Error(`buzz-acp exited during startup (${startup.exitCode})`);

    const firstTrigger = await sendTrigger({
      buzzBinary,
      channel,
      env: triggerEnv,
      agentPubkey,
      content: `Use buzz_messages_send to send exactly ${firstMarker} to this channel.`,
    });
    expect(firstTrigger).toMatch(/^[0-9a-f]{64}$/i);
    const firstDelivery = await waitForDelivery({
      buzzBinary,
      channel,
      env: triggerEnv,
      marker: firstMarker,
      postingPubkey,
      since: startedAt,
    });
    expect(firstDelivery.id).toMatch(/^[0-9a-f]{64}$/i);

    const secondTrigger = await sendTrigger({
      buzzBinary,
      channel,
      env: triggerEnv,
      agentPubkey,
      replyTo: String(firstDelivery.id),
      content: `Use buzz_messages_thread to reply to this event with exactly ${secondMarker}.`,
    });
    const threadedDelivery = await waitForDelivery({
      buzzBinary,
      channel,
      env: triggerEnv,
      marker: secondMarker,
      postingPubkey,
      since: startedAt,
      replyTo: secondTrigger,
    });
    expect(hasReplyTag(threadedDelivery, secondTrigger)).toBe(true);
  } finally {
    harness.kill();
    await harness.exited;
  }
}, 420_000);
