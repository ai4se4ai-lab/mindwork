/**
 * Platform adapter contract.
 *
 * The desktop app reaches its backend through exactly three Tauri primitives:
 * `invoke(cmd, args)`, `listen(event, cb)`, and `Channel` (a push stream handed
 * to `invoke` as an argument). Every one of the 239 commands and 21 event
 * channels the frontend uses goes through them.
 *
 * That makes those three the whole porting surface. `desktop/src/testing/
 * e2eBridge.ts` already proves it: it replaces the entire Rust backend with a
 * mock by intercepting the same seam. The web build does the same thing, except
 * the implementation behind the seam talks to the relay over HTTP + WebSocket
 * instead of returning fixtures.
 *
 * Implementations must be *transport*-faithful, not implementation-faithful:
 * a handler is free to satisfy `get_channels` with a `POST /query` instead of
 * Rust's cached store, so long as the returned shape matches what the desktop
 * command returned. `desktop/src/shared/api/types.ts` is the source of truth for
 * those shapes.
 */

/** Arguments object as passed to `invoke`. Tauri serialises this to JSON. */
export type InvokeArgs = Record<string, unknown>;

/**
 * Browser stand-in for `@tauri-apps/api/core`'s `Channel`.
 *
 * Tauri serialises a `Channel` into an opaque handle so the Rust side can push
 * frames back. Nothing crosses a process boundary here, so a handler receives
 * the live object and calls `send` directly.
 */
export interface AdapterChannel<T = unknown> {
  readonly id: number;
  onmessage: (message: T) => void;
  send(message: T): void;
}

/** A single `invoke` command implementation. */
export type CommandHandler<T = unknown> = (
  args: InvokeArgs,
  ctx: AdapterContext,
) => Promise<T> | T;

/**
 * What a handler is allowed to reach for. Handlers never import transport
 * modules directly — everything arrives here, so tests can substitute fakes.
 */
export interface AdapterContext {
  /** Relay HTTP surface: `/events`, `/query`, `/count`, `/media`, … */
  readonly relay: RelayHttp;
  /** Signs Nostr events. NIP-07 extension, or an in-browser encrypted key. */
  readonly signer: NostrSigner;
  /** What this browser session can and cannot do. */
  readonly capabilities: Capabilities;
  /** Push a frame to `listen()` subscribers — the web side of Rust's `emit`. */
  emit(event: string, payload?: unknown): void;
  /** Re-entrant `invoke`, so a handler can compose other commands. */
  invoke<T>(cmd: string, args?: InvokeArgs): Promise<T>;
}

/** Relay HTTP client. Mirrors what `buzz-cli`'s `client.rs` does natively. */
export interface RelayHttp {
  /** Base URL, no trailing slash — e.g. `https://relay.buzz.place`. */
  readonly baseUrl: string;
  /** WebSocket URL for the same community. */
  readonly wsUrl: string;
  /** `POST /query` — Nostr REQ filters. NIP-50 `search` routes to buzz-search. */
  query<T = unknown>(filters: NostrFilter[]): Promise<T[]>;
  /** `POST /count` — Nostr COUNT filters. */
  count(filters: NostrFilter[]): Promise<number>;
  /** `POST /events` — submit one signed event. */
  publish(event: SignedNostrEvent): Promise<PublishResult>;
  /** Authenticated GET/POST against a relay path, with a NIP-98 header. */
  fetchAuthed(path: string, init?: RequestInit): Promise<Response>;
  /** Unauthenticated GET — NIP-11, health, join policy. */
  fetchPublic(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * Event signing. On desktop the key lives in the Rust keystore and never
 * reaches JS; in the browser it is either held by a NIP-07 extension (preferred,
 * key never enters the page) or an in-page key unlocked from encrypted storage.
 */
export interface NostrSigner {
  readonly kind: "nip07" | "local" | "readonly";
  getPublicKey(): Promise<string>;
  /** Fills in `pubkey`, `id`, `sig`. Backs the `sign_event` command. */
  sign(template: UnsignedNostrEvent): Promise<SignedNostrEvent>;
  /** NIP-42 relay auth event (kind 22242). Backs `create_auth_event`. */
  signAuth(challenge: string, relayUrl: string): Promise<SignedNostrEvent>;
  /** NIP-98 HTTP auth header value (kind 27235). */
  httpAuthHeader(
    url: string,
    method: string,
    body?: string,
  ): Promise<string>;
  /** NIP-44 self-encryption, used for private notes and observer frames. */
  encryptToSelf(plaintext: string): Promise<string>;
  decryptFromSelf(ciphertext: string): Promise<string>;
}

/**
 * Per-session capability flags.
 *
 * 75 of the 239 desktop commands need the local machine — spawning agent
 * processes, PTYs, on-disk git checkouts, local model serving, audio devices.
 * Rather than pretend, those commands reject with a `HandoffRequiredError` and
 * the UI offers a `buzz://` deep link into the desktop app.
 */
export interface Capabilities {
  /** PTY-backed terminal panes (`terminal_*`). Always false on web. */
  readonly terminal: boolean;
  /** Spawning/stopping agent processes locally (`start_managed_agent`, …). */
  readonly localAgents: boolean;
  /** On-disk project repositories and local git (`*_project_repo*`). */
  readonly localGit: boolean;
  /** Local LLM serving (`mesh_*`). */
  readonly meshLlm: boolean;
  /** Device audio capture/playback for huddles. */
  readonly audioDevices: boolean;
  /** OS keychain / device pairing flows. */
  readonly devicePairing: boolean;
  /** Builderlab OAuth (local callback server + system browser) for hosted communities (`*builderlab*`). */
  readonly hostedCommunities: boolean;
  /** Whether a desktop install is reachable for handoff deep links. */
  readonly desktopHandoff: boolean;
}

/** The adapter the shims bind to. */
export interface PlatformAdapter {
  readonly name: string;
  readonly capabilities: Capabilities;
  invoke<T>(cmd: string, args?: InvokeArgs): Promise<T>;
  listen<T>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
  ): Promise<UnlistenFn>;
  emit(event: string, payload?: unknown): Promise<void>;
}

export type UnlistenFn = () => void;

/**
 * Raised when a command needs the local machine. The UI catches this and
 * renders a handoff prompt rather than a generic error toast.
 */
export class HandoffRequiredError extends Error {
  constructor(
    readonly command: string,
    /** `buzz://` URL that performs the operation in the desktop app. */
    readonly deepLink: string | null,
    readonly capability: keyof Capabilities,
    /** Feature label for the prompt, e.g. "Hosted communities". */
    readonly feature: string,
  ) {
    super(`${feature} needs the Buzz desktop app.`);
    this.name = "HandoffRequiredError";
  }
}

/** Raised when a command has no web implementation yet. Distinct from handoff. */
export class UnimplementedCommandError extends Error {
  constructor(readonly command: string) {
    super(`No web implementation for "${command}".`);
    this.name = "UnimplementedCommandError";
  }
}

// ---------------------------------------------------------------------------
// Nostr wire types (kept structurally identical to desktop/src/shared/api/types)
// ---------------------------------------------------------------------------

export interface UnsignedNostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface SignedNostrEvent extends UnsignedNostrEvent {
  id: string;
  pubkey: string;
  sig: string;
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [tagFilter: `#${string}`]: unknown;
}

export interface PublishResult {
  event_id: string;
  accepted: boolean;
  message: string;
}
