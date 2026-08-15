/**
 * Stands in for `@tauri-apps/api/webview`.
 *
 * Desktop pins the native webview zoom and drives Cmd +/- by scaling the root
 * font-size instead (see `useWebviewZoomShortcuts.ts`). Browsers own their own
 * zoom, so `setZoom` is a no-op — the rem-based text scaling the desktop app
 * already relies on keeps working unchanged.
 */
class WebWebview {
  async setZoom(_factor: number): Promise<void> {}
}

const currentWebview = new WebWebview();

export function getCurrentWebview(): WebWebview {
  return currentWebview;
}
