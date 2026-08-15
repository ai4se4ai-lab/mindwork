/** Stands in for `@tauri-apps/api/app`. */
export async function getVersion(): Promise<string> {
  return import.meta.env.VITE_APP_VERSION ?? "0.0.0-web";
}
