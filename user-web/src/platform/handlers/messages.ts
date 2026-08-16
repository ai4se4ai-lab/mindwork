/**
 * Channel-window and thread-reply command handlers.
 *
 * Both are raw-filter extensions on the same `POST /query` bridge endpoint
 * `platform/relay-http.ts` already talks to — see `docs/bridge-channel-window.md`
 * (channel window: `top_level`/`include_summaries`/`include_aux`) and
 * `desktop/src-tauri/src/commands/messages.rs`'s `build_thread_replies_filter`
 * (thread replies: `#e`/`depth_limit`/`thread_cursor`). Neither needs a
 * database or local process — they're just filter shapes the relay's HTTP
 * bridge already understands, so these handlers pass them straight through
 * via `ctx.relay.query` and return the flat signed-event array unchanged
 * (`get_channel_window`/`get_thread_replies` both return raw `RelayEvent[]`
 * on desktop too — no client-side reshaping happens in Rust either).
 *
 * Message *sending* (`relayClient.sendMessage`) and thread-reply aux
 * backfill (`relayClient.fetchAuxEventsByReference`) are NOT here — they run
 * entirely over the WS session in `desktop/src/shared/api/relayClientSession.ts`,
 * which only needs the `plugin:websocket|*` and `sign_event`/
 * `create_auth_event` commands (`handlers/websocket.ts`, `handlers/relay.ts`),
 * both already implemented. Nothing to add for those.
 */
import type { CommandHandler, NostrFilter, SignedNostrEvent } from "@web/platform/adapter";

/**
 * `NostrFilter` only declares the vanilla NIP-01 fields plus `#<tag>`
 * entries; the bridge extensions below (`top_level`, `depth_limit`, etc.)
 * are additional top-level filter keys the relay's `/query` handler reads
 * directly off the same JSON object. `RelayHttp.query` just forwards
 * whatever it's given, so widening the type here (rather than in the shared
 * `adapter.ts` contract every handler sees) keeps those bridge-only fields
 * scoped to the two places that actually use them.
 */
type BridgeFilter = NostrFilter & Record<string, unknown>;

// Mirrors desktop/src/shared/constants/kinds.ts CHANNEL_TIMELINE_CONTENT_KINDS.
const CHANNEL_TIMELINE_CONTENT_KINDS = [
  9, 40002, 40008, 40099, 43001, 43002, 43003, 43004, 43005, 43006, 48100,
];

interface ChannelWindowCursorArg {
  created_at: number;
  event_id: string;
}

const get_channel_window: CommandHandler<SignedNostrEvent[]> = async (args, ctx) => {
  const channelId = String(args.channelId ?? "");
  const limitRows = typeof args.limitRows === "number" ? args.limitRows : 50;
  const cursor = args.cursor as ChannelWindowCursorArg | null | undefined;

  const filter: BridgeFilter = {
    kinds: CHANNEL_TIMELINE_CONTENT_KINDS,
    "#h": [channelId],
    limit: limitRows,
    top_level: true,
    include_summaries: true,
    include_aux: true,
  };
  if (cursor) {
    filter.until = cursor.created_at;
    filter.before_id = cursor.event_id;
  }

  return ctx.relay.query<SignedNostrEvent>([filter]);
};

interface ThreadCursorArg {
  created_at: number;
  event_id: string;
}

const get_thread_replies: CommandHandler<{
  events: SignedNostrEvent[];
  next_cursor: { created_at: number; event_id: string } | null;
}> = async (args, ctx) => {
  const rootEventId = String(args.rootEventId ?? "");
  const channelId = typeof args.channelId === "string" ? args.channelId : null;
  const cap = Math.min(typeof args.limit === "number" ? args.limit : 200, 500);
  const depthLimit = typeof args.depthLimit === "number" ? args.depthLimit : 64;
  const cursor = args.cursor as ThreadCursorArg | null | undefined;

  const filter: BridgeFilter = {
    "#e": [rootEventId],
    kinds: CHANNEL_TIMELINE_CONTENT_KINDS,
    depth_limit: depthLimit,
    limit: cap,
  };
  if (channelId) filter["#h"] = [channelId];
  if (cursor) {
    filter.thread_cursor = cursor.created_at;
    filter.thread_cursor_id = cursor.event_id;
  }

  const events = await ctx.relay.query<SignedNostrEvent>([filter]);
  const nextCursor =
    events.length >= cap
      ? (() => {
          const last = events[events.length - 1];
          return { created_at: last.created_at, event_id: last.id };
        })()
      : null;

  return { events, next_cursor: nextCursor };
};

// Mirrors desktop Rust's `get_event` command's allow-list — deep-link/route
// resolution only ever targets a renderable timeline row, never an arbitrary
// kind.
const GET_EVENT_KINDS = [
  0, 1, 3, 5, 7, 9, 30078, 40002, 40003, 40008, 40099, 40100, 45001, 45003,
  48100,
];

/** Desktop returns the raw event as a JSON string; match that exactly
 * (`getEventById` in `desktop/src/shared/api/tauri.ts` does `JSON.parse` on
 * the result). */
const get_event: CommandHandler<string> = async (args, ctx) => {
  const eventId = String(args.eventId ?? "");
  const events = await ctx.relay.query<SignedNostrEvent>([
    { ids: [eventId], kinds: GET_EVENT_KINDS, limit: 1 },
  ]);
  if (!events[0]) throw new Error("event not found");
  return JSON.stringify(events[0]);
};

export const MESSAGE_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  get_channel_window: get_channel_window as CommandHandler,
  get_thread_replies: get_thread_replies as CommandHandler,
  get_event: get_event as CommandHandler,
};
