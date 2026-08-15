# Buzz for the web (`user-web/`)

Browser build of the Buzz client. Reuses the desktop feature tree verbatim and
swaps the backend at the Tauri IPC seam.

- **[docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md)** — what works on web, at what level of support.
- **[docs/DESKTOP_HANDOFF.md](docs/DESKTOP_HANDOFF.md)** — the 75 local-machine features and how handoff is prompted.

## How it works

`vite.config.ts` aliases every `@tauri-apps/*` entry point to a shim in
`src/platform/tauri-shim/`, and `@` to `../desktop/src`. The ~70 desktop files
that import Tauri therefore bind to the `WebAdapter` at build time — the other
~1,300 files are untouched and unaware.

```
desktop feature code (unmodified)
      │  invoke / listen / Channel
      ▼
tauri-shim/*  ──►  WebAdapter
                      ├── plugin:websocket|*  ──►  browser WebSocket
                      ├── registered handler  ──►  relay HTTP + NIP-07 signer
                      ├── local-machine cmd   ──►  HandoffRequiredError
                      └── otherwise           ──►  UnimplementedCommandError
```

`UnimplementedCommandError` is deliberately distinct from
`HandoffRequiredError`, so "not ported yet" is never mistaken for "needs the
desktop app".

## Develop

```bash
pnpm install
VITE_RELAY_URL=http://localhost:3000 pnpm dev
```
