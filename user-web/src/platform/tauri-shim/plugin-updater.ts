/**
 * Stands in for `@tauri-apps/plugin-updater`. The web app is always current on
 * reload, so `check` reports no update rather than pretending to install one.
 */
export interface Update {
  version: string;
  currentVersion: string;
  body?: string;
  downloadAndInstall(onEvent?: (progress: unknown) => void): Promise<void>;
}

export async function check(): Promise<Update | null> {
  return null;
}
