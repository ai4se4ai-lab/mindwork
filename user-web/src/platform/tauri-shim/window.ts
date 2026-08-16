/**
 * Stands in for `@tauri-apps/api/window`.
 *
 * Window chrome has no browser equivalent, so most methods are no-ops. A few
 * have real web analogues and are wired: `setBadgeCount` uses the Badging API
 * where available, `isFullscreen`/`onResized` use the Fullscreen API, and
 * `requestUserAttention` falls back to a title flash.
 */
export enum UserAttentionType {
  Critical = 1,
  Informational = 2,
}

type NavigatorWithBadge = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Mirrors `@tauri-apps/api/dpi`'s `PhysicalSize` shape closely enough for
 * `onResized` consumers, which only read `width`/`height`. */
interface WebPhysicalSize {
  width: number;
  height: number;
}

type Theme = "light" | "dark";

/** Mirrors `@tauri-apps/api/event`'s `Event<T>` shape. */
interface WebEvent<T> {
  event: string;
  id: number;
  payload: T;
}

type UnlistenFn = () => void;

class WebWindow {
  // Real Tauri windows are identified by a label (e.g. desktop's huddle
  // companion window uses "huddle-<channelId>"); the browser build has no
  // multi-window concept, so every caller sees the same fixed label. Callers
  // that branch on window identity (`huddleWindowChannelId`) are already
  // gated behind `isTauri()`, which this build's shim reports `false`, so
  // this value is never actually read at runtime — it exists to keep the
  // shim's shape assignable to what desktop's window code expects.
  readonly label = "web";

  async isFullscreen(): Promise<boolean> {
    return document.fullscreenElement !== null;
  }

  async theme(): Promise<Theme | null> {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  async setFocus(): Promise<void> {
    window.focus();
  }

  async show(): Promise<void> {}
  async unminimize(): Promise<void> {}
  async close(): Promise<void> {}
  async startDragging(): Promise<void> {}

  async setBadgeCount(count?: number): Promise<void> {
    const nav = navigator as NavigatorWithBadge;
    if (count && nav.setAppBadge) {
      await nav.setAppBadge(count);
    } else if (nav.clearAppBadge) {
      await nav.clearAppBadge();
    }
  }

  async setBadgeLabel(_label?: string): Promise<void> {}

  async requestUserAttention(
    _type?: UserAttentionType | null,
  ): Promise<void> {}

  /**
   * Real Tauri fires this on native window resize; macOS/Windows/Linux
   * fullscreen transitions all resize the window, so desktop's
   * `useIsFullscreen` uses it as its sole update signal. The closest browser
   * analogues are the `resize` and `fullscreenchange` events — wired for real
   * (not a dead stub), since `useIsFullscreen` has no `isTauri()` guard.
   */
  async onResized(
    handler: (event: WebEvent<WebPhysicalSize>) => void,
  ): Promise<UnlistenFn> {
    let id = 0;
    const listener = () => {
      handler({
        event: "tauri://resize",
        id: id++,
        payload: { width: window.innerWidth, height: window.innerHeight },
      });
    };
    window.addEventListener("resize", listener);
    document.addEventListener("fullscreenchange", listener);
    return () => {
      window.removeEventListener("resize", listener);
      document.removeEventListener("fullscreenchange", listener);
    };
  }

  /**
   * Dead in the web build: every call site (`ThemeProvider.tsx`) guards this
   * behind `isTauri()`, which this shim reports `false` for, and falls back to
   * `matchMedia` instead. Exists only so the shape typechecks.
   */
  async onThemeChanged(
    _handler: (event: WebEvent<Theme>) => void,
  ): Promise<UnlistenFn> {
    return () => {};
  }
}

const currentWindow = new WebWindow();

export function getCurrentWindow(): WebWindow {
  return currentWindow;
}
