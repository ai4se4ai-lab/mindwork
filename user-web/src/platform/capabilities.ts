/**
 * Capability detection for the browser session.
 *
 * The seven local-machine capabilities are constant `false` on web — no
 * browser API reaches a PTY, a spawned process, an on-disk checkout, a local
 * model server, or a local OAuth callback listener. They are modelled as data
 * rather than hardcoded at each call site so the same feature components can
 * render a handoff prompt instead of an error.
 */
import type { Capabilities } from "@web/platform/adapter";

/** Custom-scheme probe is unreliable; assume a desktop install may exist. */
function desktopHandoffAvailable(): boolean {
  return typeof window !== "undefined";
}

export function detectWebCapabilities(): Capabilities {
  return {
    terminal: false,
    localAgents: false,
    localGit: false,
    meshLlm: false,
    // Capture works via getUserMedia, but selecting an OS output device does
    // not — huddles run, device pickers do not.
    audioDevices: false,
    devicePairing: false,
    hostedCommunities: false,
    desktopHandoff: desktopHandoffAvailable(),
  };
}
