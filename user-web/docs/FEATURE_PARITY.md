# Buzz Web — Feature Support Matrix

How each desktop feature behaves in `user-web/`, the browser build.

Derived from a full audit of `desktop/src` (1,374 files / ~280k LOC) and
`desktop/src-tauri` (311 Tauri commands, **239 actually called** from the
frontend, plus 21 event channels).

## Support levels

| Level | Meaning |
|:--|:--|
| ✅ **Full** | Behaves the same as desktop. No user-visible limitation. |
| 🟡 **Partial** | Works, with a named limitation stated in the row. |
| 🔵 **Handoff** | Needs the local machine. Web shows a prompt to open the desktop app — see [DESKTOP_HANDOFF.md](DESKTOP_HANDOFF.md). |
| ⚪ **N/A** | Has no meaning in a browser; silently absent, not an error. |

**Headline:** of the 239 commands the frontend calls, **164 (69%) are reachable
from a browser** and cover the entire collaboration product. The remaining
**75 (31%)** are bound to the local machine and route to desktop handoff.

---

## Messaging & channels

| Feature | Level | Explanation |
|:--|:--|:--|
| Channel list, create, update, archive | ✅ Full | Relay-backed (kind:39000/39001/39002) via `POST /query` + `POST /events`. |
| Join / leave / membership roles | ✅ Full | Relay membership events; same NIP-29 `h`-tag scoping as desktop. |
| Send / edit / delete messages | ✅ Full | Signed in-browser, submitted to `POST /events`. |
| Threads & replies | ✅ Full | `reply_count` / `descendant_count` are materialised relay-side, so the browser reads the same counters. |
| Reactions | ✅ Full | Relay events. |
| Realtime delivery, typing, presence | ✅ Full | Native browser `WebSocket` replaces the Tauri websocket plugin; the entire ~2,000-line relay client (auth, replay, backoff, stall watchdog) runs unchanged. |
| Direct messages | 🟡 Partial | Works with NIP-07 extensions exposing `nip44`. Extensions without NIP-44 support cannot decrypt DMs; the in-browser key mode always can. |
| Forum posts & comments | ✅ Full | Relay-backed. |
| Custom emoji | ✅ Full | kind:30030 emoji sets. |
| Message search | ✅ Full | NIP-50 `search` filters route to `buzz-search` automatically through `POST /query`. |
| Canvas | ✅ Full | Relay-backed. |
| Channel templates | ✅ Full | Relay-backed. |
| Drafts | ✅ Full | `localStorage`, same as desktop. |
| Pop-out channel windows | 🟡 Partial | Opens a browser tab instead of a native window; `get_channel_window` bounds are not restored. |

## Identity & authentication

| Feature | Level | Explanation |
|:--|:--|:--|
| Sign in with NIP-07 extension | ✅ Full | Alby / nos2x. The key never enters the page — stronger than desktop's keystore model. |
| In-browser key (encrypted) | 🟡 Partial | For users without an extension. Key is unlocked into page memory, so it is the weaker of the two modes; gated behind an explicit warning. |
| NIP-42 relay auth | ✅ Full | `create_auth_event` → kind:22242 signed in-browser. |
| NIP-98 HTTP auth | ✅ Full | kind:27235 header on every authed relay request. |
| Profile read / update | ✅ Full | kind:0 metadata. |
| Sign out | ✅ Full | Clears session and disconnects the relay. |
| Export nsec / ncryptsec backup | 🟡 Partial | Impossible under NIP-07 by design — the extension owns the key. Available only in in-browser-key mode. |
| Identity archive (multi-identity) | 🟡 Partial | In-browser-key mode only; NIP-07 identity switching is the extension's job. |
| Device pairing (NIP-AB) | 🔵 Handoff | Needs OS keychain + local pairing relay. |

## AI agents

| Feature | Level | Explanation |
|:--|:--|:--|
| Agent roster & profiles | ✅ Full | Relay-backed. |
| Agent conversation / turns | ✅ Full | Agents post to the relay; the browser reads the same events. |
| Agent observer frames | ✅ Full | NIP-44 self-decryption; same constraint as DMs. |
| Agent memory (engrams) | ✅ Full | Relay-backed. |
| Personas | ✅ Full | kind:30078 persona events. |
| Teams | ✅ Full | Relay-backed. |
| Agent / team snapshot export & import | ✅ Full | Encoded and sent as relay events. |
| Approvals (grant / deny) | ✅ Full | Relay-backed. |
| **Start / stop a local agent** | 🔵 Handoff | Spawns a process on the machine. |
| Agent runtime discovery (ACP) | 🔵 Handoff | Probes local binaries and PATH. |
| Agent model discovery | 🔵 Handoff | Reads local provider config and env. |
| Agent card minting | 🔵 Handoff | Uses a locally stored provider key. |
| Managed agent logs | 🔵 Handoff | Local process stdio. |
| **Remote agents** | ✅ Full | Agents deployed to a substrate are relay-native — the browser reaches them exactly like desktop does. See `VISION_REMOTE_AGENTS.md`. |

## Workflows

| Feature | Level | Explanation |
|:--|:--|:--|
| List / create / update / delete | ✅ Full | Relay-backed. |
| Trigger & run history | ✅ Full | Relay-backed. |
| Webhooks | ✅ Full | Server-side (`/hooks/{id}`); nothing client-local. |

## Projects, repos & git

| Feature | Level | Explanation |
|:--|:--|:--|
| Repo browsing (tree, blobs, refs, commits) | ✅ Full | Relay git smart HTTP + `isomorphic-git`; already proven in the existing `web/` client. |
| Project announcements, PRs, issues, patches | ✅ Full | Relay events (kind:30617 / 1617 / 1621 …). |
| PR review & status signing | ✅ Full | Signed in-browser. |
| **Clone / pull / push a local repo** | 🔵 Handoff | Needs a working tree on disk. |
| Local repo diff & snapshot | 🔵 Handoff | Reads the filesystem. |
| Merge a PR into a local checkout | 🔵 Handoff | Local git operation. |
| Project terminal | 🔵 Handoff | PTY. |

## Terminal

| Feature | Level | Explanation |
|:--|:--|:--|
| All terminal panes (`terminal_*`, 9 commands) | 🔵 Handoff | A PTY cannot be opened from a browser. Every terminal surface renders a handoff prompt. |

## Huddles, voice & audio

| Feature | Level | Explanation |
|:--|:--|:--|
| Join / leave a huddle, participants, state | 🟡 Partial | The relay hosts huddle audio over WebSocket at `/huddle/`, so the browser can join. Requires Web Audio + an Opus path. |
| Microphone capture | ✅ Full | `getUserMedia`. |
| Push-to-talk & mute | ✅ Full | Client-side. |
| Output device selection | 🟡 Partial | `setSinkId` is Chromium-only; other browsers use the system default. |
| Live transcription | 🔵 Handoff | Local STT pipeline. |
| Agent text-to-speech | 🔵 Handoff | Local TTS engine and voice models. |
| Pocket voices / voice model download | 🔵 Handoff | Downloads models to disk. |
| Huddle companion window | 🟡 Partial | Rendered as an in-page panel rather than a separate native window. |

## Media

| Feature | Level | Explanation |
|:--|:--|:--|
| Upload images, video, files | ✅ Full | Blossom `POST /media/upload`; native file picker replaced by `<input type="file">` and drag-and-drop. |
| Download / save media | ✅ Full | Browser download. |
| Image & video preview, galleries | ✅ Full | Same components. |
| Link previews | ✅ Full | Fetched relay-side. |
| Animated avatar / GIF processing | 🟡 Partial | Rust `upng`/transcode paths replaced by `<canvas>` + `WebCodecs`; heavier files are slower. |
| Screenshot capture | 🟡 Partial | `getDisplayMedia` — requires an explicit per-capture user gesture, unlike desktop. |
| Media proxy port | ⚪ N/A | Desktop-only loopback proxy; the browser fetches relay URLs directly. |

## Discovery & activity

| Feature | Level | Explanation |
|:--|:--|:--|
| Home feed | ✅ Full | Relay-backed. |
| Pulse | ✅ Full | Relay-backed. |
| Global search (messages, users) | ✅ Full | `buzz-search` via NIP-50. |
| Reminders | ✅ Full | kind:300xx reminder events. |
| User status | ✅ Full | kind:30315. |
| Social graph (contacts, likes, notes) | ✅ Full | Relay-backed. |
| Moderation (reports, audit, timeouts) | ✅ Full | Relay-backed. |
| Community members & roles | ✅ Full | Relay-backed. |
| Invites & join policy | ✅ Full | `/api/invites`, `/api/join-policy`. |

## Notifications & shell integration

| Feature | Level | Explanation |
|:--|:--|:--|
| In-app notifications | ✅ Full | Unchanged. |
| OS notifications | 🟡 Partial | Web Notification API. No action buttons, and delivery stops when the tab is closed unless a service worker is added. |
| Unread badge | 🟡 Partial | Badging API where supported; otherwise the tab title. |
| System tray | ⚪ N/A | No browser equivalent. |
| Window chrome, vibrancy, drag regions | ⚪ N/A | Browser owns the window. |
| Haptics | ⚪ N/A | Desktop-only. |
| Clipboard copy / read | ✅ Full | Clipboard API (read requires permission). |
| `buzz://` deep links | 🟡 Partial | Replaced by ordinary URL routes; inbound `buzz://` links still open the desktop app. |
| Auto-update | ⚪ N/A | A reload is always current. |
| Cmd +/− zoom | 🟡 Partial | Native browser zoom. The app's rem-based type scale keeps working; the pinned-webview trick does not apply. |

## Local storage & compute

| Feature | Level | Explanation |
|:--|:--|:--|
| Local event archive | 🔵 Handoff | Backed by an on-disk SQLite store. |
| Mesh compute (local LLM serving) | 🔵 Handoff | All six `mesh_*` commands run and serve local models. |
| Workspace switching | 🔵 Handoff | Maps to on-disk workspace directories. |
| Settings & preferences | ✅ Full | `localStorage`, same keys as desktop. |
| Community switching | ✅ Full | Same key-based remount boundary; `resetCommunityState()` applies unchanged. |

---

## Reading the numbers

| Bucket | Commands | Web disposition |
|:--|--:|:--|
| Relay-backed | 98 | ✅ Direct `/events` · `/query` · `/count` + WebSocket |
| Local-machine-bound | 75 | 🔵 Desktop handoff |
| Huddle & voice | 19 | 🟡 Audio joins; TTS/STT hand off |
| Native shell | 18 | 🟡 Web API equivalents, or ⚪ no-ops |
| Identity & crypto | 17 | ✅ NIP-07 / in-browser key |
| Media | 8 | ✅ Blossom HTTP |
| WebSocket plugin | 4 | ✅ Browser `WebSocket` |
