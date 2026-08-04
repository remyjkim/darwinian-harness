// ABOUTME: Resolves which deployed Worker slug an ACP session serves: explicit positional,
// ABOUTME: DRWN_ACP_SLUG env, or the single machine mind-binding; anything else fails loudly.

import { readMindBindings } from "../mind-store/bindings";

export async function resolveAcpSlug(
  context: { agentsDir: string },
  positional: string | undefined,
  env: Record<string, string | undefined>,
): Promise<string> {
  if (positional && positional.length > 0) {
    return positional;
  }
  const fromEnv = env.DRWN_ACP_SLUG;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  const bindings = await readMindBindings(context.agentsDir);
  const slugs = Object.keys(bindings);
  if (slugs.length === 1 && slugs[0]) {
    return slugs[0];
  }
  const candidates = slugs.length > 0 ? ` Deployed bindings: ${slugs.join(", ")}.` : "";
  throw new Error(
    `No Worker slug for the ACP session. Pass one (drwn acp serve <slug>) or set DRWN_ACP_SLUG.${candidates}`,
  );
}
