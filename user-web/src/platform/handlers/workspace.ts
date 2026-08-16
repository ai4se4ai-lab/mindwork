/**
 * Workspace / community-apply command handlers.
 *
 * Desktop's `apply_workspace` (`src-tauri/src/commands/workspace.rs`) is the
 * single command `useCommunityInit.ts` calls whenever the active community
 * changes. On desktop it does a lot: points the Rust backend's live relay
 * connection at a new URL, optionally swaps the in-keychain signing key
 * (`nsec`), persists/symlinks a local `repos_dir`, flips an agent-managed-
 * profiles flag, and kicks off local event-retention backfill.
 *
 * Almost none of that has a web equivalent, and this build has no supported
 * way to reconnect to a *different* relay mid-session yet — `RelayHttpClient`
 * (`platform/relay-http.ts`) is constructed once in `bootstrap.ts` with a
 * fixed `baseUrl`/`wsUrl`, and every relay-backed command handler reads those
 * fields, not a mutable "current relay" the way Rust's
 * `state.relay_url_override` is. Building real multi-relay switching support
 * is a real feature, not a shim — out of scope here.
 *
 * What *is* implemented: the one case this build can genuinely satisfy —
 * applying the community the adapter was already booted against (the common
 * case in dev, where `resolveRelayUrl()` and the "join" flow both point at
 * the same local relay). `nsec` (raw key import) has no NIP-07 equivalent —
 * the whole point of NIP-07 is that the page never holds the secret key — so
 * a non-empty `nsec` fails loudly instead of being silently dropped.
 * `reposDir`/`agentManagedProfiles` mirror how Rust itself treats a bad/
 * inapplicable `repos_dir`: non-fatal, simply not applied.
 */
import {
  UnimplementedCommandError,
  type CommandHandler,
} from "@web/platform/adapter";
import { httpToWs } from "@web/platform/relay-http";

function normalizeWsUrl(url: string): string {
  return httpToWs(url.trim()).replace(/\/+$/, "");
}

const apply_workspace: CommandHandler<void> = async (args, ctx) => {
  const nsec = typeof args.nsec === "string" ? args.nsec.trim() : "";
  if (nsec) {
    // No NIP-07 provider accepts an imported secret key — signing is only
    // ever delegated to the extension. Fail clearly rather than silently
    // ignoring the user's imported key and leaving them signed in as
    // whatever identity NIP-07 already returned.
    throw new UnimplementedCommandError("apply_workspace(nsec import)");
  }

  const requestedRelayUrl = String(args.relayUrl ?? "").trim();
  if (!requestedRelayUrl) {
    throw new Error("apply_workspace requires a relayUrl");
  }

  let requestedWsUrl: string;
  try {
    requestedWsUrl = normalizeWsUrl(requestedRelayUrl);
  } catch {
    throw new Error("invalid relay URL");
  }

  if (requestedWsUrl !== normalizeWsUrl(ctx.relay.wsUrl)) {
    // Genuine multi-relay switching: not supported yet (see file docblock).
    throw new UnimplementedCommandError("apply_workspace(switch relay)");
  }

  // Already configured for this relay — nothing to do. `reposDir` and
  // `agentManagedProfiles` are accepted and intentionally no-op, matching how
  // Rust itself never fails the command over a `repos_dir` it can't apply.
};

export const WORKSPACE_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  apply_workspace: apply_workspace as CommandHandler,
};
