/**
 * Stands in for `@tauri-apps/api/window`.
 *
 * Window chrome has no browser equivalent, so most methods are no-ops. The two
 * with real web analogues are wired: `setBadgeCount` uses the Badging API where
 * available, and `requestUserAttention` falls back to a title flash.
 */
export enum UserAttentionType {
  Critical = 1,
  Informational = 2,
}

type NavigatorWithBadge = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

class WebWindow {
  async isFullscreen(): Promise<boolean> {
    return document.fullscreenElement !== null;
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
}

const currentWindow = new WebWindow();

export function getCurrentWindow(): WebWindow {
  return currentWindow;
}
