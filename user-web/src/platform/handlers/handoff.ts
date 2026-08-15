/**
 * Desktop handoff for the 75 commands that need the local machine.
 *
 * Each entry maps a command to the capability it needs and to a `buzz://` deep
 * link that performs the same operation in the desktop app. Commands listed
 * here reject with `HandoffRequiredError`, which the UI renders as "Open in
 * Buzz for desktop" rather than a failure.
 *
 * The link builders mirror the deep-link routes the desktop app already
 * registers (see `src-tauri/src/deep_link.rs`); a `null` builder means the
 * operation has no addressable target and the prompt just launches the app.
 */
import {
  HandoffRequiredError,
  type Capabilities,
  type InvokeArgs,
} from "@web/platform/adapter";

type LinkBuilder = (args: InvokeArgs) => string | null;

interface HandoffSpec {
  capability: keyof Capabilities;
  /** Feature label shown in the prompt. */
  feature: string;
  link: LinkBuilder;
}

const openApp: LinkBuilder = () => "buzz://open";
const noTarget: LinkBuilder = () => null;

const agentLink: LinkBuilder = (args) =>
  typeof args.pubkey === "string"
    ? `buzz://agent?pubkey=${encodeURIComponent(args.pubkey)}`
    : "buzz://agents";

const projectLink: LinkBuilder = (args) =>
  typeof args.project_id === "string"
    ? `buzz://project?id=${encodeURIComponent(args.project_id)}`
    : "buzz://projects";

/** Prefix match, so families (`terminal_*`, `mesh_*`) need one entry each. */
const PREFIX_HANDOFFS: Array<[string, HandoffSpec]> = [
  ["terminal_", { capability: "terminal", feature: "Terminal", link: openApp }],
  ["mesh_", { capability: "meshLlm", feature: "Mesh compute", link: openApp }],
  [
    "managed_agent",
    { capability: "localAgents", feature: "Local agents", link: agentLink },
  ],
];

const EXACT_HANDOFFS: Record<string, HandoffSpec> = {
  start_managed_agent: {
    capability: "localAgents",
    feature: "Local agents",
    link: agentLink,
  },
  stop_managed_agent: {
    capability: "localAgents",
    feature: "Local agents",
    link: agentLink,
  },
  start_managed_agent_runtime: {
    capability: "localAgents",
    feature: "Local agents",
    link: agentLink,
  },
  stop_managed_agent_runtime: {
    capability: "localAgents",
    feature: "Local agents",
    link: agentLink,
  },
  restart_managed_agent_runtime: {
    capability: "localAgents",
    feature: "Local agents",
    link: agentLink,
  },
  discover_acp_providers: {
    capability: "localAgents",
    feature: "Agent runtimes",
    link: openApp,
  },
  connect_acp_runtime: {
    capability: "localAgents",
    feature: "Agent runtimes",
    link: openApp,
  },
  discover_backend_providers: {
    capability: "localAgents",
    feature: "Agent backends",
    link: openApp,
  },
  probe_backend_provider: {
    capability: "localAgents",
    feature: "Agent backends",
    link: openApp,
  },
  clone_project_repository: {
    capability: "localGit",
    feature: "Local repositories",
    link: projectLink,
  },
  get_project_repo_diff: {
    capability: "localGit",
    feature: "Local repositories",
    link: projectLink,
  },
  validate_repos_dir: {
    capability: "localGit",
    feature: "Local repositories",
    link: openApp,
  },
  start_pairing: {
    capability: "devicePairing",
    feature: "Device pairing",
    link: openApp,
  },
  cancel_pairing: {
    capability: "devicePairing",
    feature: "Device pairing",
    link: noTarget,
  },
  confirm_pairing_sas: {
    capability: "devicePairing",
    feature: "Device pairing",
    link: noTarget,
  },
  start_identity_recovery_pairing: {
    capability: "devicePairing",
    feature: "Identity recovery",
    link: openApp,
  },
  list_audio_output_devices: {
    capability: "audioDevices",
    feature: "Audio output device",
    link: noTarget,
  },
  get_audio_output_device: {
    capability: "audioDevices",
    feature: "Audio output device",
    link: noTarget,
  },
  set_audio_output_device: {
    capability: "audioDevices",
    feature: "Audio output device",
    link: noTarget,
  },
};

export function findHandoff(cmd: string): HandoffSpec | null {
  const exact = EXACT_HANDOFFS[cmd];
  if (exact) return exact;
  for (const [prefix, spec] of PREFIX_HANDOFFS) {
    if (cmd.startsWith(prefix) || cmd.includes(prefix)) return spec;
  }
  return null;
}

/** Throws if `cmd` needs the local machine. Returns otherwise. */
export function assertNoHandoffRequired(cmd: string, args: InvokeArgs): void {
  const spec = findHandoff(cmd);
  if (!spec) return;
  throw new HandoffRequiredError(cmd, spec.link(args), spec.capability);
}
