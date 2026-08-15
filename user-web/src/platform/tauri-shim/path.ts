/**
 * Stands in for `@tauri-apps/api/path`. There is no filesystem in the browser;
 * callers use `homeDir` only to render paths, so a marker value is enough.
 */
export async function homeDir(): Promise<string> {
  return "~";
}
