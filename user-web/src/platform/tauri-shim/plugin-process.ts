/** Stands in for `@tauri-apps/plugin-process`. A reload is the web relaunch. */
export async function relaunch(): Promise<void> {
  window.location.reload();
}

export async function exit(_code?: number): Promise<void> {
  window.close();
}
