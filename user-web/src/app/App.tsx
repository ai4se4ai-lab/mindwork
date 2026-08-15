/**
 * Platform readiness page.
 *
 * Placeholder shell for the reused desktop `<App />`. It exercises the adapter
 * end to end — signer detection, relay reachability, capability reporting,
 * handoff behaviour — so the seam is verifiable before the desktop feature tree
 * is mounted on top of it.
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HandoffRequiredError, type Capabilities } from "@web/platform/adapter";
import { hasNip07 } from "@web/platform/signer";

type Probe = { label: string; status: "ok" | "fail" | "handoff"; detail: string };

async function probeCommand(
  label: string,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<Probe> {
  try {
    const value = await invoke<unknown>(cmd, args);
    return { label, status: "ok", detail: String(value ?? "ok") };
  } catch (error) {
    if (error instanceof HandoffRequiredError) {
      return {
        label,
        status: "handoff",
        detail: error.deepLink ?? "desktop app required",
      };
    }
    return { label, status: "fail", detail: (error as Error).message };
  }
}

export function App({ capabilities }: { capabilities: Capabilities }) {
  const [probes, setProbes] = useState<Probe[] | null>(null);

  useEffect(() => {
    void Promise.all([
      probeCommand("Relay URL", "get_relay_http_url"),
      probeCommand("Relay WebSocket", "get_relay_ws_url"),
      probeCommand("Identity", "get_identity"),
      probeCommand("Terminal (expects handoff)", "terminal_attach"),
      probeCommand("Local agent (expects handoff)", "start_managed_agent"),
    ]).then(setProbes);
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Buzz for the web</h1>
      <p className="mt-2 text-sm opacity-70">
        WebAdapter installed. NIP-07 extension{" "}
        {hasNip07() ? "detected" : "not detected"}.
      </p>

      <h2 className="mt-8 text-base font-semibold">Adapter probes</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {probes?.map((probe) => (
          <li key={probe.label}>
            <span aria-hidden="true">
              {probe.status === "ok" ? "✅" : probe.status === "handoff" ? "🔵" : "❌"}
            </span>{" "}
            <strong>{probe.label}</strong> — {probe.detail}
          </li>
        )) ?? <li>Running…</li>}
      </ul>

      <h2 className="mt-8 text-base font-semibold">Capabilities</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {Object.entries(capabilities).map(([name, enabled]) => (
          <li key={name}>
            <span aria-hidden="true">{enabled ? "✅" : "🔵"}</span> {name}
          </li>
        ))}
      </ul>
    </main>
  );
}
