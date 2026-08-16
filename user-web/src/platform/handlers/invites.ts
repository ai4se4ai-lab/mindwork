/**
 * Invite / join-policy command handlers.
 *
 * Unlike most of `handlers/relay.ts`, these don't talk to `ctx.relay` (the
 * browser's own configured community relay) — they fetch an *arbitrary*
 * other relay the user is trying to join or reconnect to, so they reach out
 * with a bare `fetch` instead.
 */
import type { CommandHandler } from "@web/platform/adapter";

const JOIN_POLICY_REQUEST_TIMEOUT_MS = 15_000;
// Mirrors desktop Rust's MAX_JOIN_POLICY_RESPONSE_BYTES
// (src-tauri/src/commands/join_policy.rs) — a defensive cap, not a protocol
// requirement.
const MAX_JOIN_POLICY_RESPONSE_BYTES = 4 * 1024 * 1024;

/** Mirrors desktop Rust's `join_policy_url` (commands/join_policy.rs):
 * ws(s):// -> http(s):// and append `/api/join-policy`. */
function joinPolicyHttpUrl(relayUrl: string): URL {
  const trimmed = relayUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("invalid relay URL");
  }
  const httpScheme =
    url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : null;
  if (!httpScheme) {
    throw new Error("relay URL must use ws:// or wss://");
  }
  if (url.username || url.password) {
    throw new Error("relay URL must not contain credentials");
  }
  url.protocol = httpScheme;
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/api/join-policy`;
  url.search = "";
  url.hash = "";
  return url;
}

/**
 * Mirrors desktop Rust's `fetch_join_policy` command: GET
 * `{relay origin}/api/join-policy` and return its `policy` field verbatim
 * (snake_case field names — `desktop/src/shared/api/invites.ts`'s
 * `getJoinPolicy` reads `terms_markdown`/`age_attestation_required`/etc.
 * straight off whatever this command returns), or `null` on a 404 (relays
 * predating join-policy support have none configured).
 *
 * One divergence from the Rust implementation, which is worth calling out
 * rather than papering over: Rust's `reqwest` client is built with
 * `redirect::Policy::none()` so a 3xx comes back as a real status code
 * (its own test asserts `fetch_join_policy(...) == Err("HTTP 307")`).
 * Browser `fetch` with `redirect: "manual"` can't do that — the spec hides
 * the real status behind an opaque `type: "opaqueredirect"` response with
 * `status: 0` for cross-origin safety. This handler reports that case as a
 * distinct error rather than fabricating a fake status code.
 */
const fetch_join_policy: CommandHandler<unknown> = async (args) => {
  const url = joinPolicyHttpUrl(String(args.relayUrl ?? ""));
  const response = await fetch(url.toString(), {
    redirect: "manual",
    signal: AbortSignal.timeout(JOIN_POLICY_REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) return null;
  if (response.type === "opaqueredirect") {
    throw new Error("join policy request was redirected");
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  if (text.length > MAX_JOIN_POLICY_RESPONSE_BYTES) {
    throw new Error("join policy response too large");
  }

  const body = JSON.parse(text) as { policy?: unknown };
  return body.policy ?? null;
};

export const INVITE_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  fetch_join_policy: fetch_join_policy as CommandHandler,
};
