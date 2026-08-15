/** Stands in for `@tauri-apps/api/event`. */
import { getAdapter } from "@web/platform/registry";
import type { UnlistenFn } from "@web/platform/adapter";

export type { UnlistenFn };

export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}

export type EventCallback<T> = (event: Event<T>) => void;

export function listen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return getAdapter().listen<T>(event, handler);
}

/** One-shot `listen`. */
export async function once<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  const unlisten = await listen<T>(event, (payload) => {
    unlisten();
    handler(payload);
  });
  return unlisten;
}

export function emit(event: string, payload?: unknown): Promise<void> {
  return getAdapter().emit(event, payload);
}

export function emitTo(
  _target: string,
  event: string,
  payload?: unknown,
): Promise<void> {
  return getAdapter().emit(event, payload);
}
