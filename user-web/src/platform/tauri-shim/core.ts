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

export function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  return getAdapter().invoke<T>(cmd, args);
}

/**
 * Desktop calls this to turn a bundled asset path into a loadable URL. In the
 * browser the value is already a URL, so it passes through.
 */
export function convertFileSrc(filePath: string): string {
  return filePath;
}

export const isTauri = false;
