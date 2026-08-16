/**
 * Miscellaneous OS-adjacent command handlers that DO have a real browser
 * equivalent (unlike the bulk of desktop's local-machine surface, which goes
 * through `handoff.ts` instead).
 */
import type { CommandHandler } from "@web/platform/adapter";

// ---------------------------------------------------------------------------
// set_prevent_sleep_active
//
// Desktop prevents OS sleep while a locally-running agent is active
// (`features/agents/usePreventSleep.ts`). The Screen Wake Lock API is the
// closest browser equivalent — it only prevents the *screen* from sleeping
// (not full system suspend, and only while the tab is visible), which is a
// narrower guarantee than desktop's OS-level sleep inhibitor, but the same
// intent: keep the machine awake while an agent needs it running.
// ---------------------------------------------------------------------------

let activeWakeLock: WakeLockSentinel | null = null;

const set_prevent_sleep_active: CommandHandler<void> = async (args) => {
  const active = Boolean(args.active);

  if (!active) {
    if (activeWakeLock) {
      await activeWakeLock.release().catch(() => {});
      activeWakeLock = null;
    }
    return;
  }

  if (activeWakeLock || !navigator.wakeLock) return;
  try {
    activeWakeLock = await navigator.wakeLock.request("screen");
    activeWakeLock.addEventListener("release", () => {
      activeWakeLock = null;
    });
  } catch {
    // Wake Lock can reject (e.g. tab not visible) — sleep prevention is a
    // best-effort nicety on desktop too, not a correctness requirement.
    activeWakeLock = null;
  }
};

export const SYSTEM_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  set_prevent_sleep_active: set_prevent_sleep_active as CommandHandler,
};
