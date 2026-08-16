/**
 * Profile (kind:0) command handlers.
 *
 * Mirrors `desktop/src-tauri/src/commands/profile.rs` — `desktop/src/shared/
 * api/tauriProfiles.ts` is the contract these must satisfy (snake_case field
 * names on the wire; the TS layer converts to camelCase).
 *
 * `search_users` is a deliberately simplified subset of the Rust command: no
 * server-side re-ranking pass (`rank_user_search_results`), no `search_mode:
 * "prefix"` bridge extension, and only the first page. It still gets a real
 * NIP-50 search from the relay (`AGENTS.md`: `search` filters route to
 * `buzz-search` automatically), which is enough to drive the member-picker /
 * @mention flows this build needs; it just won't rank or paginate identically
 * to desktop.
 */
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { CommandHandler, SignedNostrEvent } from "@web/platform/adapter";

// ---------------------------------------------------------------------------
// NIP-OA owner-attestation verification
//
// Mirrors crates/buzz-sdk/src/nip_oa.rs::verify_auth_tag: an `["auth",
// <owner-pubkey-hex>, <conditions>, <sig-hex>]` tag proves the owner key
// authorized this event's author (the agent key) to publish under its own
// authorship. preimage = "nostr:agent-auth:" + agentPubkeyHex + ":" +
// conditions; message = SHA-256(preimage); BIP-340 Schnorr over that message,
// checked against the owner pubkey. This is real signature verification, not
// a presence check — `is_agent` in the UI (bot badges, "managed by you")
// depends on it being genuine, not spoofable by anyone who can write an
// `auth` tag with an owner pubkey they don't hold the key for.
//
// One simplification versus the Rust implementation: `validate_conditions`'s
// exact grammar (`kind=<0-65535>`, `created_at<`/`created_at>`, `&`-joined, no
// leading zeros) is not re-checked here. A forged tag with malformed
// conditions still can't pass — it would need a valid signature over that
// exact malformed string, which requires the owner's private key. A
// genuinely-issued tag always has grammar-valid conditions because
// `compute_auth_tag` validates before signing. So skipping the grammar check
// only widens acceptance in a case that can't be forged, not in a case that
// matters for display purposes.
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Returns the verified owner pubkey hex, or `null` if no tag verifies. */
function verifyAgentOwnerPubkey(event: SignedNostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] !== "auth" || tag.length !== 4) continue;
    const [, ownerPubkeyHex, conditions, sigHex] = tag;
    if (!HEX64.test(ownerPubkeyHex) || !HEX128.test(sigHex)) continue;
    if (ownerPubkeyHex === event.pubkey) continue; // self-attestation rejected

    const preimage = `nostr:agent-auth:${event.pubkey}:${conditions}`;
    const message = sha256(new TextEncoder().encode(preimage));
    try {
      if (schnorr.verify(hexToBytes(sigHex), message, hexToBytes(ownerPubkeyHex))) {
        return ownerPubkeyHex;
      }
    } catch {
      // Malformed hex or an invalid curve point — not a verified tag.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// kind:0 <-> ProfileInfo / UserProfileSummary
// ---------------------------------------------------------------------------

interface RawProfileInfo {
  pubkey: string;
  display_name: string | null;
  avatar_url: string | null;
  about: string | null;
  nip05_handle: string | null;
  owner_pubkey: string | null;
  has_profile_event: boolean;
}

interface RawUserProfileSummary {
  display_name: string | null;
  name: string | null;
  avatar_url: string | null;
  nip05_handle: string | null;
  owner_pubkey: string | null;
  is_agent: boolean;
}

function emptyProfileInfo(pubkey: string): RawProfileInfo {
  return {
    pubkey,
    display_name: null,
    avatar_url: null,
    about: null,
    nip05_handle: null,
    owner_pubkey: null,
    has_profile_event: false,
  };
}

function parseKind0Content(event: SignedNostrEvent): Record<string, unknown> {
  try {
    const parsed = JSON.parse(event.content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    throw new Error(`kind:0 content is not valid JSON: ${error}`);
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function profileInfoFromEvent(event: SignedNostrEvent): RawProfileInfo {
  const content = parseKind0Content(event);
  return {
    pubkey: event.pubkey,
    display_name: asString(content.display_name) ?? asString(content.name),
    avatar_url: asString(content.picture),
    about: asString(content.about),
    nip05_handle: asString(content.nip05),
    owner_pubkey: verifyAgentOwnerPubkey(event),
    has_profile_event: true,
  };
}

function userSummaryFromEvent(event: SignedNostrEvent): RawUserProfileSummary {
  const content = parseKind0Content(event);
  const ownerPubkey = verifyAgentOwnerPubkey(event);
  return {
    display_name: asString(content.display_name) ?? asString(content.name),
    name: asString(content.name),
    avatar_url: asString(content.picture),
    nip05_handle: asString(content.nip05),
    owner_pubkey: ownerPubkey,
    is_agent: ownerPubkey !== null,
  };
}

/** Newest kind:0 per author, matching Rust's `latest` fold. */
function latestPerAuthor(events: SignedNostrEvent[]): Map<string, SignedNostrEvent> {
  const latest = new Map<string, SignedNostrEvent>();
  for (const event of events) {
    const prior = latest.get(event.pubkey);
    if (!prior || event.created_at > prior.created_at) {
      latest.set(event.pubkey, event);
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const get_profile: CommandHandler<RawProfileInfo> = async (_args, ctx) => {
  const pubkey = await ctx.signer.getPublicKey();
  const events = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [0], authors: [pubkey], limit: 1 },
  ]);
  return events[0] ? profileInfoFromEvent(events[0]) : emptyProfileInfo(pubkey);
};

const get_user_profile: CommandHandler<RawProfileInfo> = async (args, ctx) => {
  const target =
    typeof args.pubkey === "string" ? args.pubkey : await ctx.signer.getPublicKey();
  const events = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [0], authors: [target], limit: 1 },
  ]);
  return events[0] ? profileInfoFromEvent(events[0]) : emptyProfileInfo(target);
};

/**
 * Read-merge-write: kind 0 is a full profile snapshot, so an update must
 * carry forward every field the caller didn't touch.
 */
const update_profile: CommandHandler<RawProfileInfo> = async (args, ctx) => {
  const pubkey = await ctx.signer.getPublicKey();
  const prior = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [0], authors: [pubkey], limit: 1 },
  ]);
  const current = prior[0] ? parseKind0Content(prior[0]) : {};

  const displayName =
    typeof args.displayName === "string" ? args.displayName : asString(current.display_name);
  // update_profile never lets callers set the kind:0 `name` field directly —
  // it's carried forward from whatever was already there (matches Rust: no
  // `name` parameter on this command).
  const name = asString(current.name);
  const picture =
    typeof args.avatarUrl === "string" ? args.avatarUrl : asString(current.picture);
  const about = typeof args.about === "string" ? args.about : asString(current.about);
  const nip05 =
    typeof args.nip05Handle === "string" ? args.nip05Handle : asString(current.nip05);

  const content: Record<string, string> = {};
  if (displayName !== null) content.display_name = displayName;
  if (name !== null) content.name = name;
  if (picture !== null) content.picture = picture;
  if (about !== null) content.about = about;
  if (nip05 !== null) content.nip05 = nip05;

  const signed = await ctx.signer.sign({
    kind: 0,
    content: JSON.stringify(content),
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
  });
  const result = await ctx.relay.publish(signed);
  if (!result.accepted) {
    throw new Error(result.message || "profile update was rejected");
  }
  return profileInfoFromEvent(signed);
};

const get_users_batch: CommandHandler<{
  profiles: Record<string, RawUserProfileSummary>;
  missing: string[];
}> = async (args, ctx) => {
  const pubkeys = Array.isArray(args.pubkeys) ? (args.pubkeys as string[]) : [];
  if (pubkeys.length === 0) {
    return { profiles: {}, missing: [] };
  }
  const events = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [0], authors: pubkeys },
  ]);
  const latest = latestPerAuthor(events);
  const profiles: Record<string, RawUserProfileSummary> = {};
  for (const [pk, event] of latest) {
    profiles[pk] = userSummaryFromEvent(event);
  }
  const missing = pubkeys.filter((pk) => !(pk in profiles));
  return { profiles, missing };
};

const search_users: CommandHandler<{
  users: Array<RawUserProfileSummary & { pubkey: string }>;
  next_cursor: string | null;
}> = async (args, ctx) => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 8, 500);
  if (limit <= 0) return { users: [], next_cursor: null };

  const filter =
    query.length > 0
      ? { kinds: [0] as number[], search: query, limit }
      : { kinds: [0] as number[], limit };
  const events = await ctx.relay.query<SignedNostrEvent>([filter]);
  const latest = latestPerAuthor(events);
  const users = [...latest.entries()].map(([pubkey, event]) => ({
    pubkey,
    ...userSummaryFromEvent(event),
  }));
  return { users, next_cursor: null };
};

export const PROFILE_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  get_profile: get_profile as CommandHandler,
  get_user_profile: get_user_profile as CommandHandler,
  update_profile: update_profile as CommandHandler,
  get_users_batch: get_users_batch as CommandHandler,
  search_users: search_users as CommandHandler,
};
