import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The web build reuses the desktop feature code verbatim.
 *
 * Two alias groups make that possible without editing `desktop/src`:
 *
 * 1. `@` resolves into `desktop/src`, so every `@/features/...` /
 *    `@/shared/...` import in the reused tree keeps working.
 * 2. Every `@tauri-apps/*` entry point resolves to a shim under
 *    `src/platform/tauri-shim/`. The ~70 desktop files that import Tauri
 *    therefore bind to the WebAdapter at build time and never learn they are
 *    running in a browser.
 *
 * Keep this list in sync with the Tauri entry points desktop actually imports
 * (`grep -rhoE 'from "@tauri-apps/[^"]+"' ../desktop/src | sort -u`). An
 * unaliased entry point fails loudly at build time rather than at runtime,
 * which is the behaviour we want.
 */
const desktopSrc = path.resolve(__dirname, "../desktop/src");
const shim = (name: string) =>
  path.resolve(__dirname, `./src/platform/tauri-shim/${name}.ts`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@tauri-apps/api/core", replacement: shim("core") },
      { find: "@tauri-apps/api/event", replacement: shim("event") },
      { find: "@tauri-apps/api/window", replacement: shim("window") },
      { find: "@tauri-apps/api/webview", replacement: shim("webview") },
      { find: "@tauri-apps/api/app", replacement: shim("app") },
      { find: "@tauri-apps/api/path", replacement: shim("path") },
      { find: "@tauri-apps/api/mocks", replacement: shim("mocks") },
      { find: "@tauri-apps/plugin-opener", replacement: shim("plugin-opener") },
      {
        find: "@tauri-apps/plugin-notification",
        replacement: shim("plugin-notification"),
      },
      {
        find: "@tauri-apps/plugin-process",
        replacement: shim("plugin-process"),
      },
      {
        find: "@tauri-apps/plugin-updater",
        replacement: shim("plugin-updater"),
      },
      // Web-local modules win over the desktop tree.
      { find: "@web", replacement: path.resolve(__dirname, "./src") },
      { find: "@features-manifest", replacement: path.resolve(__dirname, "../preview-features.json") },
      { find: "@", replacement: desktopSrc },
    ],
  },
  server: {
    port: parseInt(process.env.VITE_PORT || "5273", 10),
    strictPort: true,
  },
});
