/**
 * Deep-link queue command handlers.
 *
 * Desktop's `buzz://` deep links are delivered by the OS opening the native
 * app; Rust queues them (`src-tauri/src/deep_link.rs`,
 * `PendingNavigationDeepLinks`/`PendingCommunityDeepLinks`, in-memory
 * `VecDeque`s) until the frontend is ready to drain them. A browser tab has
 * no equivalent OS-level delivery mechanism — nothing can hand this page a
 * `buzz://` URL at launch — so the queue is always empty here. That's a
 * faithful "no pending deep link" answer, not a stub standing in for missing
 * behavior: `desktop/src/shared/deep-link.ts` already treats an empty queue
 * as the normal no-op case on desktop too.
 *
 * These are invoked unconditionally during community init
 * (`useCommunityInit.ts`'s `resetCommunityState`) on every community switch,
 * including ones React's StrictMode double-invokes in dev — leaving them
 * unimplemented turned a harmless reset step into a permanent
 * "Could not safely switch communities" failure that blocked onboarding
 * entirely.
 */
import type { CommandHandler } from "@web/platform/adapter";

const take_pending_navigation_deep_link: CommandHandler<null> = () => null;
const acknowledge_pending_navigation_deep_link: CommandHandler<boolean> = () =>
  false;
const clear_pending_navigation_deep_links: CommandHandler<void> = () => {};

const take_pending_community_deep_link: CommandHandler<null> = () => null;
const acknowledge_pending_community_deep_link: CommandHandler<boolean> = () =>
  false;

export const DEEP_LINK_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  take_pending_navigation_deep_link:
    take_pending_navigation_deep_link as CommandHandler,
  acknowledge_pending_navigation_deep_link:
    acknowledge_pending_navigation_deep_link as CommandHandler,
  clear_pending_navigation_deep_links:
    clear_pending_navigation_deep_links as CommandHandler,
  take_pending_community_deep_link:
    take_pending_community_deep_link as CommandHandler,
  acknowledge_pending_community_deep_link:
    acknowledge_pending_community_deep_link as CommandHandler,
};
