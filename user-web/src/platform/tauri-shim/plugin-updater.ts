/**
 * Stands in for `@tauri-apps/plugin-updater`. The web app is always current on
 * reload, so `check` reports no update rather than pretending to install one.
 *
 * `check()` always resolving `null` means desktop's `useUpdater` hook never
 * actually obtains an `Update` instance, so these methods are never called in
 * the web build — they exist only so the shim's shape matches the real
 * `@tauri-apps/plugin-updater` `Update` class closely enough for
 * `desktop/src/features/settings/hooks/use-updater.ts` to typecheck unmodified.
 */
export interface Update {
  version: string;
  currentVersion: string;
  body?: string;
  downloadAndInstall(onEvent?: (progress: unknown) => void): Promise<void>;
  download(onEvent?: (progress: unknown) => void): Promise<void>;
  install(): Promise<void>;
  close(): Promise<void>;
}

export interface CheckOptions {
  headers?: Record<string, string>;
  timeout?: number;
  proxy?: string;
  target?: string;
}

export async function check(_options?: CheckOptions): Promise<Update | null> {
  return null;
}
