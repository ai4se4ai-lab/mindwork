/**
 * Stands in for `@tauri-apps/api/core` in the web build.
 *
 * Aliased in `vite.config.ts`, so the ~30 desktop modules that
 * `import { invoke } from "@tauri-apps/api/core"` bind here instead.
 */
import { getAdapter } from "@web/platform/registry";
import type { AdapterChannel, InvokeArgs } from "@web/platform/adapter";

let nextChannelId = 1;

/**
 * Browser `Channel`. Tauri turns this into a handle the Rust side pushes
 * through; here the handler holds the object and calls `send` directly.
 *
 * `relayClientSession.ts` constructs one per connection attempt and passes it
 * as `onMessage` to `plugin:websocket|connect`, so the shape must match: a
 * constructor taking the message callback, plus an assignable `onmessage`.
 */
export class Channel<T = unknown> implements AdapterChannel<T> {
  readonly id: number;
  onmessage: (message: T) => void;

  constructor(onmessage?: (message: T) => void) {
    this.id = nextChannelId++;
    this.onmessage = onmessage ?? (() => {});
  }

  send(message: T): void {
    this.onmessage(message);
  }

  toJSON(): string {
    return `__CHANNEL__:${this.id}`;
  }
}

/**
 * Real Tauri's `invoke` additionally accepts raw binary bodies
 * (`number[] | ArrayBuffer | Uint8Array`) plus a third `InvokeOptions`
 * argument (e.g. `{ headers }`) for the raw-IPC transfer desktop's
 * `uploadMediaFile` (`shared/api/tauriMedia.ts`) uses to send file bytes
 * without JSON-inflating them. Every command handler in this build reads
 * `args` as a plain object, so raw-binary invokes aren't functionally
 * supported yet — they fall through to `UnimplementedCommandError`, same as
 * any other unported command — but the signature accepts the same shapes
 * real Tauri does so call sites built against the real type typecheck
 * unmodified.
 */
export function invoke<T>(
  cmd: string,
  args?: InvokeArgs | number[] | ArrayBuffer | Uint8Array,
  _options?: { headers?: Record<string, string> },
): Promise<T> {
  return getAdapter().invoke<T>(cmd, args as InvokeArgs);
}

/**
 * Desktop calls this to turn a bundled asset path into a loadable URL. In the
 * browser the value is already a URL, so it passes through.
 */
export function convertFileSrc(filePath: string): string {
  return filePath;
}

export function isTauri(): boolean {
  return false;
}
