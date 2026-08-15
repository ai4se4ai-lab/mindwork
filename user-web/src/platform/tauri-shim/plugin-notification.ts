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

/**
 * Desktop registers a handler for clicks on native notifications. The browser
 * delivers those through the `Notification` instance instead, so activation is
 * wired where the notification is created; this stays a no-op unsubscribe.
 */
export async function onAction(
  _handler: (notification: unknown) => void,
): Promise<() => void> {
  return () => {};
}
