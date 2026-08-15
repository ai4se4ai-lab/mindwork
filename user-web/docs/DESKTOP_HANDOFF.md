# Desktop-Only Features & Handoff

The 75 commands that need the local machine, and how `user-web/` prompts the
user to continue in the desktop app.

A browser cannot spawn a process, open a PTY, read a working tree, bind an audio
device, or serve a local model. Rather than hide these features or fail with a
generic error, the web app **shows the feature, explains why it needs the
desktop app, and hands off with a `buzz://` deep link**.

---

## How handoff works

```
  feature component
        │  invoke("start_managed_agent", { pubkey })
        ▼
  WebAdapter.invoke()
        │  no handler registered
        ▼
  assertNoHandoffRequired()          src/platform/handlers/handoff.ts
        │  matches a local-machine command
        ▼
  throw HandoffRequiredError(command, deepLink, capability)
        │
        ▼
  <HandoffBoundary>  ──►  "Local agents run on your machine.
                            [ Open in Buzz for desktop ]  [ Get the app ]"
                                     │
                                     ▼
                          buzz://agent?pubkey=<hex>
```

Three pieces make this work:

1. **`Capabilities`** (`src/platform/capabilities.ts`) — six flags, all `false`
   on web: `terminal`, `localAgents`, `localGit`, `meshLlm`, `audioDevices`,
   `devicePairing`. Components read these to decide *ahead of time* whether to
   render an action as a handoff, so the common case never throws.
2. **`HandoffRequiredError`** (`src/platform/adapter.ts`) — carries the command,
   the target deep link, and the capability. Distinct from
   `UnimplementedCommandError`, so "needs desktop" is never confused with "not
   ported yet".
3. **The handoff table** (`src/platform/handlers/handoff.ts`) — maps commands to
   a capability, a user-facing feature label, and a deep-link builder.

### Prompt copy rules

Each prompt states **what** needs the desktop app and **why**, in one sentence,
then offers the link. It never blames the browser and never implies the feature
is broken.

| | |
|:--|:--|
| Title | The feature label — "Terminal", "Local agents", "Local repositories" |
| Body | Why it needs the machine — "Terminal sessions run a shell on your computer." |
| Primary | **Open in Buzz for desktop** → the `buzz://` link |
| Secondary | **Get the app** → download page, when no desktop install responds |

If the deep link builder returns `null` the operation has no addressable target
(e.g. `cancel_pairing`), so only the secondary action is shown.

---

## Deep-link targets

Mirrors the routes the desktop app already registers in
`src-tauri/src/deep_link.rs`.

| Link | Opens |
|:--|:--|
| `buzz://open` | The app, last location |
| `buzz://agents` | Agent roster |
| `buzz://agent?pubkey=<hex>` | One agent's detail view |
| `buzz://projects` | Project list |
| `buzz://project?id=<uuid>` | One project |
| `buzz://channel?id=<uuid>` | A channel |
| `buzz://message?channel=<uuid>&id=<hex>` | A specific message thread |

---

## The 75 commands, by feature

### Terminal — 9 commands · capability `terminal`

`terminal_attach` · `terminal_detach` · `terminal_input` · `terminal_resize` ·
`terminal_scroll` · `terminal_focus` · `terminal_close` · `terminal_ack` ·
`terminal_viewport_ready`

> **Why:** a pseudo-terminal is an OS construct. There is no browser API that
> allocates one.
>
> **Prompt:** "Terminal sessions run a shell on your computer." → `buzz://open`

### Local agents & runtimes — 20 commands · capability `localAgents`

`start_managed_agent` · `stop_managed_agent` · `delete_managed_agent` ·
`list_managed_agents` · `start_managed_agent_runtime` ·
`stop_managed_agent_runtime` · `restart_managed_agent_runtime` ·
`reconcile_managed_agent_runtimes` · `put_managed_agent_runtime_lifecycle` ·
`has_managed_agent_channel_message_marker` · `discover_acp_providers` ·
`connect_acp_runtime` · `discover_backend_providers` · `probe_backend_provider` ·
`discover_agent_models` · `get_agent_config_surface` ·
`put_agent_session_config` · `get_agent_usage_series` · `delete_custom_harness` ·
`check_pipeline_hotstart`

> **Why:** launching an agent spawns a child process and manages its stdio,
> config files, and lifecycle on the machine.
>
> **Prompt:** "Local agents run on your machine." → `buzz://agent?pubkey=…`
>
> **Escape hatch:** agents deployed remotely need no handoff at all — they are
> relay-native and fully usable from the browser. Where a user has remote agents
> available, the prompt offers **Deploy remotely** as the first action instead.

### Local repositories & git — 8 commands · capability `localGit`

`clone_project_repository` · `get_project_repo_diff` · `validate_repos_dir` ·
`publish_project_pull_request_merged_status` ·
`sign_project_pull_request_status` ·
`sign_project_pull_request_review_request` · `get_git_identity` ·
`apply_workspace`

> **Why:** these read and write a working tree on disk.
>
> **Prompt:** "Cloning and diffing repositories needs a working copy on your
> computer." → `buzz://project?id=…`
>
> **Note:** *browsing* a repo is fully supported on web through the relay's git
> smart HTTP — only operations against a local checkout hand off.

### Mesh compute — 6 commands · capability `meshLlm`

`mesh_start_node` · `mesh_stop_node` · `mesh_node_status` ·
`mesh_installed_models` · `mesh_model_catalog` · `mesh_serving_usage`

> **Why:** mesh compute serves local models from your GPU.
>
> **Prompt:** "Mesh compute serves models from your own hardware." → `buzz://open`

### Voice, TTS & audio devices — 11 commands · capability `audioDevices`

`speak_agent_message` · `push_audio_pcm` · `get_audio_output_device` ·
`set_audio_output_device` · `list_voice_registry` · `preview_pocket_voice` ·
`set_pocket_voice` · `get_tts_settings` · `set_tts_enabled` ·
`set_voice_input_mode` · `get_voice_input_mode`

> **Why:** text-to-speech and transcription run local engines and models, and
> output-device selection is an OS-level choice.
>
> **Prompt:** "Agent speech runs a voice engine on your computer." → no link;
> the setting is shown disabled with the explanation inline.
>
> **Note:** joining a huddle and speaking are **not** handoffs — the relay hosts
> huddle audio over WebSocket, so the browser participates normally. Only
> synthesis, transcription, and device pickers hand off.

### Device pairing & identity recovery — 4 commands · capability `devicePairing`

`start_pairing` · `cancel_pairing` · `confirm_pairing_sas` ·
`start_identity_recovery_pairing`

> **Why:** pairing runs an ephemeral local relay and writes to the OS keychain.
>
> **Prompt:** "Pairing a device uses your computer's secure storage." → `buzz://open`

### Local archive & observer indexing — 5 commands

`read_archived_events` · `index_observer_channel_id` ·
`observer_archive_default_enabled` · `agent_metric_archive_default_enabled` ·
`get_os_idle_seconds`

> **Why:** the archive is an on-disk SQLite database; idle detection is an OS
> signal.
>
> **Prompt:** "Your local archive is stored on your computer." → `buzz://open`

### Workspaces, build env & agent cards — 12 commands

`get_builderlab_auth` · `fetch_workspace_icon` · `get_baked_build_env` ·
`get_baked_build_env_keys` · `mint_agent_card` · `save_agent_card` ·
`load_agent_card` · `list_agent_cards` · `card_mint_key_status` ·
`card_mint_save_openai_key` · `set_prevent_sleep_active` ·
`list_builderlab_communities`

> **Why:** these read on-disk workspace state, build-time environment baked into
> the binary, or provider keys held in the OS keychain.
>
> **Prompt:** feature-specific, all → `buzz://open`

---

## What is *not* a handoff

Worth stating explicitly, because these are commonly assumed to need the
desktop app and do not:

| Assumed desktop-only | Actually works on web |
|:--|:--|
| Realtime messaging | Browser `WebSocket` to the relay |
| Signing events | NIP-07 extension, or an in-browser key |
| Media upload | Blossom `POST /media/upload` |
| Repo browsing | Relay git smart HTTP + `isomorphic-git` |
| Joining a huddle | Relay WebSocket audio at `/huddle/` |
| Search | `buzz-search` via NIP-50 `POST /query` |
| Remote agents | Relay-native — identical to desktop |
| Workflows | Relay events; webhooks are server-side |
