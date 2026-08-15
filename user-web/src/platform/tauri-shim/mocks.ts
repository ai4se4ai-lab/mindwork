/**
 * Stands in for `@tauri-apps/api/mocks`, used only by `testing/e2eBridge.ts`.
 * The web build installs its own adapter, so these are inert.
 */
export function mockIPC(_handler: unknown): void {}
export function mockWindows(..._windows: string[]): void {}
