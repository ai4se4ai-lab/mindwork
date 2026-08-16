/**
 * Channel command handlers.
 *
 * Mirrors `desktop/src-tauri/src/commands/channels.rs` and
 * `desktop/src/shared/api/tauriChannels.ts`/`tauri.ts` (the wire contract:
 * snake_case fields, exact command names/args).
 *
 * Channels are NIP-29-shaped: clients publish management events (kind 9000
 * add-member, 9001 remove-member, 9007 create, 9021 join, 9022 leave) and the
 * relay derives the addressable state (kind:39000 metadata, kind:39002
 * membership) server-side — see `AGENTS.md` "Channel scoping". This file
 * only ever publishes the 900x management events and reads back the derived
 * 39000/39002 state; it never constructs 39000/39002 events directly.
 *
 * Deliberately out of scope (simplifications versus the Rust command):
 * - No hidden-DM (NIP-DV) filtering in `get_channels`.
 * - No `AppState::pending_owned_channels` overlay — a channel you just
 *   created may show `is_member: false` for one `get_channels` cycle until
 *   the relay's async kind:39002 provisioning lands (desktop's own comments
 *   note this membership step, specifically, is asynchronous server-side).
 * - No `known_hash` short-circuit — always returns the full list.
 */
import type { CommandHandler, SignedNostrEvent } from "@web/platform/adapter";

// ---------------------------------------------------------------------------
// kind:39000 / kind:39002 <-> RawChannel
// ---------------------------------------------------------------------------

interface RawChannel {
  id: string;
  name: string;
  channel_type: string;
  visibility: "open" | "private";
  description: string;
  topic: string | null;
  purpose: string | null;
  member_count: number;
  member_pubkeys: string[];
  last_message_at: string | null;
  archived_at: string | null;
  participants: string[];
  participant_pubkeys: string[];
  is_member?: boolean;
  ttl_seconds: number | null;
  ttl_deadline: string | null;
}

function firstTagValue(event: SignedNostrEvent, name: string): string | null {
  for (const tag of event.tags) {
    if (tag[0] === name) return tag[1] ?? null;
  }
  return null;
}

function hasTag(event: SignedNostrEvent, name: string): boolean {
  return event.tags.some((tag) => tag[0] === name);
}

function tagsNamed(event: SignedNostrEvent, name: string): string[][] {
  return event.tags.filter((tag) => tag[0] === name);
}

function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function channelInfoFromEvent(
  event: SignedNostrEvent,
  isMember: boolean | undefined,
): RawChannel {
  const id = firstTagValue(event, "d");
  if (!id) throw new Error("kind:39000 missing required `d` tag");

  const visibilityTag = firstTagValue(event, "visibility");
  const visibility: "open" | "private" =
    hasTag(event, "public") || visibilityTag === "open"
      ? "open"
      : hasTag(event, "private") || visibilityTag === "private"
        ? "private"
        : "open";

  const participantPubkeys = tagsNamed(event, "p")
    .map((tag) => tag[1])
    .filter((pk): pk is string => Boolean(pk));

  const ttlRaw = firstTagValue(event, "ttl");
  const ttlSeconds = ttlRaw !== null ? Number.parseInt(ttlRaw, 10) : Number.NaN;

  return {
    id,
    name: firstTagValue(event, "name") ?? "",
    channel_type:
      firstTagValue(event, "t") ?? (hasTag(event, "hidden") ? "dm" : "stream"),
    visibility,
    description: firstTagValue(event, "about") ?? "",
    topic: firstTagValue(event, "topic"),
    purpose: firstTagValue(event, "purpose"),
    member_count: 0,
    member_pubkeys: [],
    last_message_at: null,
    archived_at:
      firstTagValue(event, "archived") === "true"
        ? isoFromUnix(event.created_at)
        : null,
    participants: participantPubkeys,
    participant_pubkeys: participantPubkeys,
    is_member: isMember,
    ttl_seconds: Number.isFinite(ttlSeconds) ? ttlSeconds : null,
    ttl_deadline: firstTagValue(event, "ttl_deadline"),
  };
}

interface RawChannelMember {
  pubkey: string;
  role: string;
  is_agent?: boolean;
  joined_at: string | null;
  display_name: string | null;
}

function membersFromEvent(event: SignedNostrEvent): RawChannelMember[] {
  const seen = new Set<string>();
  const members: RawChannelMember[] = [];
  for (const tag of tagsNamed(event, "p")) {
    const pubkey = tag[1];
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);
    const role = tag[3]?.trim() || "member";
    members.push({
      pubkey,
      role,
      is_agent: role === "bot",
      joined_at: null,
      display_name: null,
    });
  }
  return members;
}

// ---------------------------------------------------------------------------
// get_channels
// ---------------------------------------------------------------------------

async function fetchChannels(
  ctx: Parameters<CommandHandler>[1],
): Promise<RawChannel[]> {
  const myPubkey = await ctx.signer.getPublicKey();

  const memberEvents = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [39002], "#p": [myPubkey] },
  ]);
  const memberIds = [
    ...new Set(
      memberEvents
        .map((ev) => firstTagValue(ev, "d"))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [metaEvents, openMetaEvents] = await Promise.all([
    memberIds.length > 0
      ? ctx.relay.query<SignedNostrEvent>([
          { kinds: [39000], "#d": memberIds, limit: memberIds.length },
        ])
      : Promise.resolve([]),
    ctx.relay.query<SignedNostrEvent>([{ kinds: [39000] }]),
  ]);

  const memberDTags = new Set(
    metaEvents.map((ev) => firstTagValue(ev, "d")).filter(Boolean),
  );

  const channels: RawChannel[] = [];
  for (const ev of metaEvents) {
    try {
      channels.push(channelInfoFromEvent(ev, true));
    } catch {
      // Skip malformed metadata rather than failing the whole list.
    }
  }
  for (const ev of openMetaEvents) {
    const d = firstTagValue(ev, "d");
    if (d && memberDTags.has(d)) continue;
    try {
      channels.push(channelInfoFromEvent(ev, false));
    } catch {
      // Skip malformed metadata rather than failing the whole list.
    }
  }

  if (channels.length > 0) {
    const ids = channels.map((c) => c.id);
    const [membershipEvents, messageEvents] = await Promise.all([
      ctx.relay.query<SignedNostrEvent>([
        { kinds: [39002], "#d": ids, limit: ids.length },
      ]),
      ctx.relay.query<SignedNostrEvent>(
        ids.map((id) => ({ kinds: [9, 40002], "#h": [id], limit: 1 })),
      ),
    ]);

    const membershipByChannel = new Map<string, RawChannelMember[]>();
    for (const ev of membershipEvents) {
      const d = firstTagValue(ev, "d");
      if (d) membershipByChannel.set(d, membersFromEvent(ev));
    }
    const lastMessageByChannel = new Map<string, number>();
    for (const ev of messageEvents) {
      const h = firstTagValue(ev, "h");
      if (!h) continue;
      const existing = lastMessageByChannel.get(h);
      if (existing === undefined || ev.created_at > existing) {
        lastMessageByChannel.set(h, ev.created_at);
      }
    }

    for (const channel of channels) {
      const members = membershipByChannel.get(channel.id);
      if (members) {
        channel.member_count = members.length;
        channel.member_pubkeys = members.map((m) => m.pubkey);
      }
      const lastMessage = lastMessageByChannel.get(channel.id);
      if (lastMessage !== undefined) {
        channel.last_message_at = isoFromUnix(lastMessage);
      }
    }
  }

  return channels;
}

const get_channels: CommandHandler<{
  hash: string;
  channels: RawChannel[] | null;
  last_messages: Record<string, string>;
}> = async (_args, ctx) => {
  const channels = await fetchChannels(ctx);
  const last_messages: Record<string, string> = {};
  for (const channel of channels) {
    if (channel.last_message_at) last_messages[channel.id] = channel.last_message_at;
  }
  // `hash` only needs to be a stable, opaque token here — this build never
  // sends a `known_hash` short-circuit request, so nothing reads it back.
  return { hash: crypto.randomUUID(), channels, last_messages };
};

// ---------------------------------------------------------------------------
// create_channel / ensure_starter_channels
// ---------------------------------------------------------------------------

async function fetchChannelMetaById(
  ctx: Parameters<CommandHandler>[1],
  channelId: string,
): Promise<SignedNostrEvent | undefined> {
  const events = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [39000], "#d": [channelId], limit: 1 },
  ]);
  return events[0];
}

async function createChannelInternal(
  ctx: Parameters<CommandHandler>[1],
  name: string,
  channelType: "stream" | "forum",
  visibility: "open" | "private",
  description?: string,
  ttlSeconds?: number,
): Promise<RawChannel> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("channel name is required");

  const channelId = crypto.randomUUID();
  const tags: string[][] = [
    ["h", channelId],
    ["name", trimmedName],
    ["visibility", visibility],
    ["channel_type", channelType],
  ];
  if (description) tags.push(["about", description]);
  if (typeof ttlSeconds === "number") tags.push(["ttl", String(ttlSeconds)]);

  const signed = await ctx.signer.sign({
    kind: 9007,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    tags,
  });
  const result = await ctx.relay.publish(signed);
  if (!result.accepted) {
    throw new Error(result.message || "channel create was rejected");
  }

  // The relay derives kind:39000 from this management event synchronously
  // within the same request (desktop's own `create_channel` re-fetches
  // immediately with no retry loop); one short retry here is defensive
  // margin, not evidence this is normally needed.
  let meta = await fetchChannelMetaById(ctx, channelId);
  if (!meta) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    meta = await fetchChannelMetaById(ctx, channelId);
  }
  if (!meta) {
    throw new Error("channel created but metadata not yet available");
  }
  return channelInfoFromEvent(meta, true);
}

const create_channel: CommandHandler<RawChannel> = async (args, ctx) => {
  const visibility = args.visibility;
  if (visibility !== "open" && visibility !== "private") {
    throw new Error(`invalid visibility: ${String(visibility)}`);
  }
  const channelType = args.channelType;
  if (channelType !== "stream" && channelType !== "forum") {
    throw new Error(`invalid channel_type: ${String(channelType)}`);
  }
  return createChannelInternal(
    ctx,
    String(args.name ?? ""),
    channelType,
    visibility,
    typeof args.description === "string" ? args.description : undefined,
    typeof args.ttlSeconds === "number" ? args.ttlSeconds : undefined,
  );
};

const STARTER_CHANNELS = [
  {
    name: "general",
    description: "General conversation and community updates.",
  },
  {
    name: "welcome-everyone",
    description: "Say hi, ask a question, or share what brought you here.",
  },
] as const;

const ensure_starter_channels: CommandHandler<RawChannel[]> = async (
  _args,
  ctx,
) => {
  const existing = await fetchChannels(ctx);
  const byName = new Map(existing.map((c) => [c.name, c]));
  const result: RawChannel[] = [];
  for (const spec of STARTER_CHANNELS) {
    const found = byName.get(spec.name);
    if (found) {
      result.push(found);
      continue;
    }
    result.push(
      await createChannelInternal(ctx, spec.name, "stream", "open", spec.description),
    );
  }
  return result;
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const get_channel_members: CommandHandler<{
  members: RawChannelMember[];
  next_cursor: string | null;
}> = async (args, ctx) => {
  const channelId = String(args.channelId ?? "");
  const events = await ctx.relay.query<SignedNostrEvent>([
    { kinds: [39002], "#d": [channelId], limit: 1 },
  ]);
  const membershipEvent = events[0];
  if (!membershipEvent) throw new Error("channel members not found");

  const members = membersFromEvent(membershipEvent);
  const pubkeys = members.map((m) => m.pubkey);
  if (pubkeys.length > 0) {
    const profileEvents = await ctx.relay
      .query<SignedNostrEvent>([{ kinds: [0], authors: pubkeys, limit: pubkeys.length }])
      .catch(() => [] as SignedNostrEvent[]);
    const latestByAuthor = new Map<string, SignedNostrEvent>();
    for (const ev of profileEvents) {
      const prior = latestByAuthor.get(ev.pubkey);
      if (!prior || ev.created_at > prior.created_at) latestByAuthor.set(ev.pubkey, ev);
    }
    for (const member of members) {
      const profileEvent = latestByAuthor.get(member.pubkey);
      if (!profileEvent) continue;
      try {
        const content = JSON.parse(profileEvent.content);
        member.display_name =
          (typeof content.display_name === "string" ? content.display_name : null) ??
          (typeof content.name === "string" ? content.name : null);
      } catch {
        // Malformed kind:0 content — leave display_name null.
      }
    }
  }

  return { members, next_cursor: null };
};

const add_channel_members: CommandHandler<{
  added: string[];
  errors: Array<{ pubkey: string; error: string }>;
}> = async (args, ctx) => {
  const channelId = String(args.channelId ?? "");
  const pubkeys = Array.isArray(args.pubkeys) ? (args.pubkeys as string[]) : [];
  const role =
    typeof args.role === "string" && args.role !== "member" ? args.role : undefined;

  const added: string[] = [];
  const errors: Array<{ pubkey: string; error: string }> = [];
  for (const pubkey of pubkeys) {
    try {
      const tags: string[][] = [
        ["h", channelId],
        ["p", pubkey.toLowerCase()],
      ];
      if (role) tags.push(["role", role]);
      const signed = await ctx.signer.sign({
        kind: 9000,
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        tags,
      });
      const result = await ctx.relay.publish(signed);
      if (!result.accepted) throw new Error(result.message || "add member rejected");
      added.push(pubkey);
    } catch (error) {
      errors.push({
        pubkey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { added, errors };
};

const remove_channel_member: CommandHandler<void> = async (args, ctx) => {
  const signed = await ctx.signer.sign({
    kind: 9001,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["h", String(args.channelId ?? "")],
      ["p", String(args.pubkey ?? "").toLowerCase()],
    ],
  });
  const result = await ctx.relay.publish(signed);
  if (!result.accepted) throw new Error(result.message || "remove member rejected");
};

const change_channel_member_role: CommandHandler<void> = async (args, ctx) => {
  const role = args.role;
  if (role !== "admin" && role !== "member" && role !== "guest" && role !== "bot") {
    if (role === "owner") {
      throw new Error("cannot assign owner role — use transfer ownership");
    }
    throw new Error(`invalid role: ${String(role)}`);
  }
  const tags: string[][] = [
    ["h", String(args.channelId ?? "")],
    ["p", String(args.pubkey ?? "").toLowerCase()],
  ];
  if (role !== "member") tags.push(["role", role]);
  const signed = await ctx.signer.sign({
    kind: 9000,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    tags,
  });
  const result = await ctx.relay.publish(signed);
  if (!result.accepted) throw new Error(result.message || "change role rejected");
};

const join_channel: CommandHandler<void> = async (args, ctx) => {
  const signed = await ctx.signer.sign({
    kind: 9021,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", String(args.channelId ?? "")]],
  });
  const result = await ctx.relay.publish(signed);
  if (!result.accepted) throw new Error(result.message || "join channel rejected");
};

const leave_channel: CommandHandler<void> = async (args, ctx) => {
  const signed = await ctx.signer.sign({
    kind: 9022,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    tags: [["h", String(args.channelId ?? "")]],
  });
  const result = await ctx.relay.publish(signed);
  if (!result.accepted) throw new Error(result.message || "leave channel rejected");
};

export const CHANNEL_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  get_channels: get_channels as CommandHandler,
  create_channel: create_channel as CommandHandler,
  ensure_starter_channels: ensure_starter_channels as CommandHandler,
  get_channel_members: get_channel_members as CommandHandler,
  add_channel_members: add_channel_members as CommandHandler,
  remove_channel_member: remove_channel_member as CommandHandler,
  change_channel_member_role: change_channel_member_role as CommandHandler,
  join_channel: join_channel as CommandHandler,
  leave_channel: leave_channel as CommandHandler,
};
