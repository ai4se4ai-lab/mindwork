/**
 * Installs the WebAdapter before anything renders.
 *
 * Must run before the first React render: the reused desktop modules call
 * `invoke` during module initialisation in places, and `getAdapter()` throws if
 * nothing is installed.
 */
import { detectWebCapabilities } from "@web/platform/capabilities";
import { RelayHttpClient } from "@web/platform/relay-http";
import { Nip07Signer } from "@web/platform/signer";
import { setAdapter } from "@web/platform/registry";
import { WebAdapter } from "@web/platform/web-adapter";
import { RELAY_COMMAND_HANDLERS } from "@web/platform/handlers/relay";

export function installWebAdapter(relayUrl: string): WebAdapter {
  const signer = new Nip07Signer();
  const relay = new RelayHttpClient(relayUrl, signer);

  const adapter = new WebAdapter({
    relay,
    signer,
    capabilities: detectWebCapabilities(),
    handlers: RELAY_COMMAND_HANDLERS,
  });

  setAdapter(adapter);
  return adapter;
}

/** Relay this build talks to. Overridable per deployment. */
export function resolveRelayUrl(): string {
  if (import.meta.env.VITE_RELAY_URL) return import.meta.env.VITE_RELAY_URL;

  // Dev server (Vite on 5273) and relay (3000) are different ports on the
  // same host, and that host varies by how the page was reached — localhost,
  // or a LAN IP when opened from another device. `host.docker.internal` (or
  // any other value baked in at server-start time) can't account for that:
  // it's shipped once to every client regardless of origin. Target the
  // relay's fixed dev port on whatever hostname actually served this page.
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  // Production default: relay serves this bundle same-origin (see web/'s
  // identical fallback), so no port override is needed or correct.
  return `${window.location.protocol}//${window.location.host}`;
}
