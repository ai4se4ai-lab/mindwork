/** Stands in for `@tauri-apps/plugin-notification`, backed by the Web Notification API. */
export async function isPermissionGranted(): Promise<boolean> {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  return Notification.requestPermission();
}

export async function sendNotification(options: {
  title: string;
  body?: string;
  icon?: string;
}): Promise<void> {
  if (!(await isPermissionGranted())) return;
  new Notification(options.title, { body: options.body, icon: options.icon });
}

/** Mirrors the real plugin's `Options` shape closely enough for
 * `desktop/src/features/notifications/lib/desktop.ts`'s `notification.extra`
 * read. */
export interface NotificationActionPayload {
  extra?: Record<string, unknown>;
}

/** Mirrors `@tauri-apps/api/core`'s `PluginListener` shape. */
export interface PluginListener {
  unregister(): Promise<void>;
}

/**
 * Desktop registers a handler for clicks on native notifications. The browser
 * delivers those through the `Notification` instance instead, so activation is
 * wired where the notification is created; every call site in
 * `listenForDesktopNotificationActions` gates this behind `isTauri()`, which
 * this shim reports `false` for, so it is never actually invoked — this stays
 * a no-op unregister.
 */
export async function onAction(
  _handler: (notification: NotificationActionPayload) => void,
): Promise<PluginListener> {
  return { unregister: async () => {} };
}
