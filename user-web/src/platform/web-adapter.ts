/**
 * The WebAdapter — the browser implementation of the desktop IPC surface.
 *
 * Dispatch order for `invoke(cmd, args)`:
 *   1. `plugin:websocket|*`  -> browser WebSocket (handlers/websocket.ts)
 *   2. registered handler    -> relay HTTP / signer / browser API
 *   3. local-machine command -> HandoffRequiredError (handlers/handoff.ts)
 *   4. anything else         -> UnimplementedCommandError
 *
 * Step 4 exists so an unported command fails loudly and identifiably instead of
 * returning `undefined` and corrupting state somewhere downstream.
 */
import {
  UnimplementedCommandError,
  type AdapterContext,
  type Capabilities,
  type CommandHandler,
  type InvokeArgs,
  type NostrSigner,
  type PlatformAdapter,
  type RelayHttp,
  type UnlistenFn,
} from "@web/platform/adapter";
import { assertNoHandoffRequired } from "@web/platform/handlers/handoff";
import { WEBSOCKET_HANDLERS } from "@web/platform/handlers/websocket";

type Listener = (event: { event: string; id: number; payload: unknown }) => void;

export interface WebAdapterOptions {
  relay: RelayHttp;
  signer: NostrSigner;
  capabilities: Capabilities;
  /** Command implementations, merged over the built-in websocket handlers. */
  handlers?: Record<string, CommandHandler>;
}

export class WebAdapter implements PlatformAdapter {
  readonly name = "web";
  readonly capabilities: Capabilities;

  private readonly handlers = new Map<string, CommandHandler>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly context: AdapterContext;
  private nextEventId = 1;

  constructor(options: WebAdapterOptions) {
    this.capabilities = options.capabilities;

    for (const [cmd, handler] of Object.entries(WEBSOCKET_HANDLERS)) {
      this.handlers.set(cmd, handler as CommandHandler);
    }
    for (const [cmd, handler] of Object.entries(options.handlers ?? {})) {
      this.handlers.set(cmd, handler);
    }

    this.context = {
      relay: options.relay,
      signer: options.signer,
      capabilities: options.capabilities,
      emit: (event, payload) => {
        void this.emit(event, payload);
      },
      invoke: (cmd, args) => this.invoke(cmd, args),
    };
  }

  /** Register or replace a command handler. Used as features are ported. */
  register(cmd: string, handler: CommandHandler): void {
    this.handlers.set(cmd, handler);
  }

  /** Commands with a web implementation — drives the support matrix in docs. */
  supportedCommands(): string[] {
    return [...this.handlers.keys()].sort();
  }

  async invoke<T>(cmd: string, args: InvokeArgs = {}): Promise<T> {
    const handler = this.handlers.get(cmd);
    if (handler) {
      return (await handler(args, this.context)) as T;
    }
    // Throws HandoffRequiredError for local-machine commands.
    assertNoHandoffRequired(cmd, args);
    throw new UnimplementedCommandError(cmd);
  }

  async listen<T>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
  ): Promise<UnlistenFn> {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const listener = handler as Listener;
    set.add(listener);

    return () => {
      const current = this.listeners.get(event);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(event);
    };
  }

  async emit(event: string, payload?: unknown): Promise<void> {
    const set = this.listeners.get(event);
    if (!set) return;
    const frame = { event, id: this.nextEventId++, payload };
    // Copy first: a listener may unsubscribe while the set is being walked.
    for (const listener of [...set]) {
      try {
        listener(frame);
      } catch (error) {
        console.error(`listener for "${event}" threw:`, error);
      }
    }
  }
}
