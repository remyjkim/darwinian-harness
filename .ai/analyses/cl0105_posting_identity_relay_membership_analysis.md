# ABOUTME: Relay-side requirements for a fresh Nostr keypair to post into a Buzz channel, and whether a dedicated posting identity works.
# ABOUTME: Evidence base for the B-lean key-custody hardening choice in cl0105_buzz_tooling_delivery_decision_analysis.md §7.6.

# cl0105 — Posting-identity & relay-membership requirements for a fresh keypair

**Investigation date:** 2026-08-04
**Source under review:** `~/dev/buzz` @ `0afeac8a7` (2026-08-04, `main`, clean working tree)
**Scope:** What a brand-new standalone Nostr keypair needs, relay-side, before its `buzz messages send` to a channel lands; who grants channel membership; and whether a second keypair used purely as a posting identity works and what (if anything) breaks. Feeds `cl0105_buzz_tooling_delivery_decision_analysis.md`.

Every file:line below was either read directly or spot-verified after a subagent surfaced it. The two crux lines (`check_channel_membership` open-visibility fallback and the `Scope::all_known()` grant) were re-read directly.

Kind constants (`crates/buzz-core/src/kind.rs`): kind **9** = `KIND_STREAM_MESSAGE` (channel message); **9000** = add-user; **9001** = remove-user; **9021** = join-request. The governing axis throughout is the channel's **`visibility`** column (`"open"` vs `"private"`, `crates/buzz-core/src/channel.rs:22-51`), default `"open"` at creation (`crates/buzz-relay/src/handlers/side_effects.rs:1764`).

---

## Q1 — What must be true relay-side before a fresh key's kind:9 post is accepted

A kind:9 EVENT passes through **two stages**; both must succeed.

### Stage 1 — Connection auth (NIP-42), before any EVENT is processed
The WS EVENT handler requires `AuthState::Authenticated`, else `OK:false "auth-required: not authenticated"` (`crates/buzz-relay/src/handlers/event.rs:634-653`). Authentication (`handlers/auth.rs:43-294`) runs, in order:
1. **NIP-42 Schnorr verification** of the challenge — a brand-new keypair just signs; no prior registration (`auth.rs:87-90`). On success it is granted **full scopes**: `scopes: Scope::all_known()` (**`crates/buzz-auth/src/lib.rs:134-142`**, verified — *"In pure Nostr mode, all authenticated connections get full scopes. Per-channel access is enforced by the relay's membership checks"*). So kind:9's `MessagesWrite` scope requirement (`handlers/ingest.rs:247-258`, gate at `:1904`) is always satisfied for a pubkey-only auth.
2. **Community ban gate** — banned pubkey (or its NIP-OA owner) denied (`auth.rs:106-184`).
3. **Pubkey allowlist gate** — only if `BUZZ_PUBKEY_ALLOWLIST=true` AND pubkey-only NIP-42: pubkey must be in the `pubkey_allowlist` table, else fail-closed (`auth.rs:186-214`).
4. **Relay-membership gate** (`enforce_relay_membership`) — only if `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`: pubkey (or a NIP-OA owner it proves) must be in `relay_members`, else `restricted: not a relay member` (`auth.rs:216-238`). Off ⇒ `OpenRelay`, any authenticated pubkey passes (`crates/buzz-relay/src/api/mod.rs:67-68`).

Both flags default **`false`** (`NOSTR.md:337-339`). On a default relay a fresh key authenticates with nothing but a valid signature.

### Stage 2 — Ingest authorization of the kind:9 event (`handlers/ingest.rs`, from `:1806`)
- Signature/timestamp/size checks; `pubkey == auth` match (`:1844-1882`).
- Not banned/timed-out on the write path (`:1995-2024`).
- **`#h` tag required** — kind:9 is channel-scoped (`requires_h_channel_scope`, `:480`); missing `#h` → `invalid: channel-scoped events must include an h tag` (`:2095-2099`).
- **Membership/visibility gate** — kind:9 is *not* in `skip_membership` (`:2152-2157`), so `check_channel_membership` runs (`:2167-2185`).

**`check_channel_membership` (`ingest.rs:508-545`, verified) is the crux:**
```rust
// member → allow
Ok(true) => return Ok(()),
...
let is_open = match channel { Some(ch) => ch.visibility == "open", None => /* DB read */ };
if is_open { Ok(()) } else { Err("restricted: not a channel member") }   // :540-543
```

Result is **visibility-dependent**:
- **Open/public channel:** membership **NOT required**. A brand-new non-member key's kind:9 is accepted on the open-visibility fallback (`NOSTR.md:109` states this explicitly).
- **Private channel:** membership **IS required**. Non-member → `OK:false "restricted: not a channel member"`.

Membership is backed by the **`channel_members` DB table** (`is_member`, `crates/buzz-db/src/channel.rs:639-657`): a row for `(community_id, channel_id, pubkey)` with `removed_at IS NULL`; `is_member_cached` is a moka cache over it (`state.rs:828-843`). **NIP-OA auth_tag is NOT consulted at the post gate** — it only matters at Stage-1 relay-membership as an owner-delegation shortcut. There is no per-post attestation requirement.

---

## Q2 — Who grants membership, and is it one-time?

Two grant paths, authorized in `handlers/side_effects.rs::validate_admin_event` (`:304-447`) and DB `add_member` (`buzz-db/src/channel.rs:380-450`):

- **Self-join, kind:9021** (CLI `buzz channels join` → `build_join`, `builders.rs:702-705`). `handle_join_request` (`side_effects.rs:1931-2007`): **open channels only** — private → `Err "channel is private — request an invitation"` (`:1946-1950`). Adds actor as role `Member`.
- **Add-member, kind:9000** (CLI `buzz channels add-member` → `build_add_member`, `builders.rs:564-578`). Authz (`validate_admin_event:339-447`):
  - **Open channel:** any authenticated user; self-add always allowed (`:413-416`); third-party add subject only to the *target's* `channel_add_policy` (`owner_only`/`nobody`/`anyone`, `:418-445`) — that policy governs adding **agents**, not plain keys.
  - **Private channel:** actor must already be an active member, else `Err "actor not authorized"` (`:361-364`); a non-member **cannot self-add** (DB re-check `channel.rs:403-406`). **Any existing member can invite** a new plain Member (`:360`); **only owners/admins (`is_elevated`) may grant elevated roles** (`:366-373`).

Roles: `Owner > Admin > Member > Guest`, plus `Bot` (`buzz-core/src/channel.rs:104-136`).

**Persistence:** durable `channel_members` row with `removed_at IS NULL`. **No expiry, no re-auth** — grant once per identity per channel; stands until an explicit kind:9001 remove / leave sets `removed_at` (`channel.rs:619-620`). Caveat: an **ephemeral** channel (`ttl`, `reap_expired_ephemeral_channels`, `channel.rs:1495`) takes its membership with it when reaped.

---

## Q3 — A second keypair as a distinct posting identity: works? breaks?

### Distinct member + display
- **Membership is keyed purely by pubkey.** `channel_members.pubkey` is the identity; `MemberRecord` carries pubkey/role/joined_at/invited_by/removed_at — **no display name** (`channel.rs:70-82`). A second, separate keypair is simply a separate member row; there is **no account/identity merge**.
- **Display name comes from the key's own kind:0 profile** (`handle_kind0_profile` → `update_user_profile`, `side_effects.rs:1196-1282`; CLI `buzz users set-profile`, `commands/users.rs:359-416`). Member-list queries LEFT-JOIN `users` for `display_name` (`channel.rs:1008-1032`). **With no kind:0 published, the relay has no name → clients render a bare npub.**
- NIP-OA `agent_owner_pubkey` mapping (`api/mod.rs:174+`) links an agent key to an owner key for ban-cascade/observer auth; it does **not** collapse them into one member.

### buzz-acp attribution (verified directly in buzz-acp)
Everything the harness emits is signed by `config.keys` = `BUZZ_PRIVATE_KEY` (the agent identity):
- relay connection keyed with `config.keys` (`buzz-acp/src/lib.rs:1395`), `rest_client = relay.rest_client()` (`:1603`), `agent_keys = config.keys.clone()` (`:1608`);
- **presence** (kind 20001) — `presence_keys = config.keys.clone()` (`:1416`);
- **reactions** 👀/💬 — signed with `rest.keys` (`pool.rs:3813 / 3857 / 3938`);
- **turn metrics** (NIP-AM kind 44200) — `.sign_with_keys(&ctx.agent_keys)` (`pool.rs:3738`).

Channel **replies** are posted by whatever key runs `buzz messages send`. By default that is the same `BUZZ_PRIVATE_KEY` (inherited into the MCP/shell). buzz-acp itself never posts a kind:9 channel message from agent output (see delivery-path finding).

### Consequence
- **Lean Option B (container = just the `buzz` CLI + key B, no harness):** B is the whole identity. Posts land as a distinct member B; threading works (Nostr `e`-tags reference the triggering event regardless of signer); nothing to split. Clean.
- **Hybrid (harness runs under key A, replies posted under key B):** replies appear as member B and thread correctly, **but** reactions/presence/turn-metrics stay under A → an **attribution split** (👀/💬, presence, and 44200 metrics = A; reply text = B). It also requires the agent to *deliberately* use B's key (`--private-key B` or a distinct `BUZZ_PRIVATE_KEY`), since the default CLI path signs as A. So the split only arises if keys are intentionally mixed.

---

## Bottom line for the operator's decision

Minting a **second standalone keypair** and posting from a cloud container as a normal distinct member is **fully supported**. Prerequisites before its first kind:9 lands:

**Relay-level (both channel cases) — determined by deployment env, must be read from the running config, not source:**
- `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true` ⇒ insert a `relay_members` row for the new pubkey first (`buzz-admin add-member`), else it can't authenticate.
- `BUZZ_PUBKEY_ALLOWLIST=true` ⇒ insert a `pubkey_allowlist` row first. (Asymmetry: the allowlist gate lives only on the WS auth path; the HTTP `submit_event` path enforces relay-membership at `bridge.rs:802-825` but not the allowlist.)
- Both `false` (defaults) ⇒ a valid NIP-42 signature is all that's needed. **NIP-OA / `x-auth-tag` not required** for a standalone key — it is only an alternative way to satisfy relay-membership by proving ownership by an existing member.

**Channel-level:**
- **Open target channel:** nothing more — authenticate + send kind:9 with the `#h` channel tag and it lands. (Optionally send kind:9021 join / self kind:9000 to appear in the member roster, but neither is required to post.)
- **Private target channel:** the second key **cannot** add itself; an existing member (any role) or owner/admin must add it once via kind:9000 (`buzz channels add-member`). Then membership is persistent and it posts normally.
- To show a human-readable name instead of a bare npub, publish a kind:0 profile from the new key (`buzz users set-profile`) once.

**Nothing breaks structurally** for a distinct posting identity. The only "break" is the attribution split described above, and it occurs *only* if the harness runs under one key while replies are posted under another.
