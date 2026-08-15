/**
 * Holds the process-wide adapter the Tauri shims delegate to.
 *
 * Kept separate from `web-adapter.ts` so the shims depend on an interface, not
 * an implementation — tests install a fake here without pulling in the relay
 * transport.
 */
import type { PlatformAdapter } from "@web/platform/adapter";

let adapter: PlatformAdapter | null = null;

export function setAdapter(next: PlatformAdapter): void {
  adapter = next;
}

export function getAdapter(): PlatformAdapter {
  if (!adapter) {
    throw new Error(
      "No platform adapter installed. Call setAdapter() before rendering.",
    );
  }
  return adapter;
}

export function hasAdapter(): boolean {
  return adapter !== null;
}
