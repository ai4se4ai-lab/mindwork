import React from "react";
import ReactDOM from "react-dom/client";
import { installWebAdapter, resolveRelayUrl } from "@web/platform/bootstrap";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@/shared/styles/globals.css";
import "@web/styles/tailwind-desktop-sources.css";

/**
 * Renders the real desktop `<App />` (the actual product, not the platform
 * readiness placeholder) inside the same provider tree desktop's own
 * `desktop/src/main.tsx` wraps it in.
 *
 * `installWebAdapter` must run before any reused desktop module is evaluated:
 * several call `invoke()` during module initialisation, and `getAdapter()`
 * throws until an adapter is installed. A static `import` of the desktop tree
 * is hoisted by the ES module spec and would evaluate before this file's own
 * top-level code — so the desktop tree is imported dynamically below,
 * strictly after `installWebAdapter` has already run.
 */
installWebAdapter(resolveRelayUrl());

const DEV_STATE_RESET_PARAM = "resetDevState";

function resetDevWebviewStateFromUrl() {
  if (!import.meta.env.DEV) {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(DEV_STATE_RESET_PARAM) !== "1") {
    return;
  }

  // Ported from desktop's WebKit-directory workaround; the origin-scoped
  // clear below is correct for any browser, not just WebKit.
  window.localStorage.clear();
  window.sessionStorage.clear();
  url.searchParams.delete(DEV_STATE_RESET_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

// Note: desktop's `configureDevE2eBridgeFromUrl` + `installE2eBridgeIfConfigured`
// (the `?e2e=mock` mock-Tauri-IPC bridge) are intentionally not ported here.
// `tauri-shim/mocks.ts` (the web build's stand-in for `@tauri-apps/api/mocks`)
// is inert by design — the web build's `invoke()` already routes straight to
// the WebAdapter, not through a `mockIPC` hook — so installing that bridge in
// this build would be a no-op that only risks confusing future readers into
// thinking `?e2e=mock` does something here. user-web's E2E strategy talks to
// the real relay instead (see user-web/tests, once added).

async function renderApp() {
  const [
    { App },
    { RootErrorBoundary },
    { NostrBindConsentDialog },
    { UpdaterProvider },
    { CommunitiesProvider },
    { huddleWindowChannelId },
    { CommunityOnboardingProvider },
    { ThemeProvider },
    { EmojiBurstProvider },
    { PoofBurstProvider },
    { Toaster },
    { TooltipProvider },
  ] = await Promise.all([
    import("@/app/App"),
    import("@/app/RootErrorBoundary"),
    import("@/features/profile/ui/NostrBindConsentDialog"),
    import("@/features/settings/hooks/UpdaterProvider"),
    import("@/features/communities/useCommunities"),
    import("@/features/huddle/lib/huddleWindow"),
    import("@/features/onboarding/communityOnboarding"),
    import("@/shared/theme/ThemeProvider"),
    import("@/shared/ui/EmojiBurstProvider"),
    import("@/shared/ui/PoofBurstProvider"),
    import("@/shared/ui/sonner"),
    import("@/shared/ui/tooltip"),
  ]);

  const root = document.getElementById("root");
  if (!root) throw new Error("#root is missing from index.html");

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      {/* block/buzz#5078 — catch any uncaught render error so a WebKit
          SecurityError from localStorage can't blank the whole window. */}
      <RootErrorBoundary>
        <CommunitiesProvider>
          <CommunityOnboardingProvider
            enabled={huddleWindowChannelId() === null}
          >
            <ThemeProvider defaultTheme="buzz">
              <TooltipProvider delayDuration={300}>
                <EmojiBurstProvider>
                  <PoofBurstProvider>
                    <UpdaterProvider>
                      <App />
                      <NostrBindConsentDialog />
                    </UpdaterProvider>
                    <Toaster />
                  </PoofBurstProvider>
                </EmojiBurstProvider>
              </TooltipProvider>
            </ThemeProvider>
          </CommunityOnboardingProvider>
        </CommunitiesProvider>
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}

async function bootstrap() {
  resetDevWebviewStateFromUrl();

  const [
    { recoverLocalStorageQuotaOnStartup },
    { startLocalStorageSweep },
    { migrateLegacyCommunityStorageBeforeRender },
  ] = await Promise.all([
    import("@/shared/lib/localStorageQuota"),
    import("@/shared/lib/localStorageSweep"),
    import("@/features/communities/legacyCommunityStorage"),
  ]);

  recoverLocalStorageQuotaOnStartup();
  startLocalStorageSweep();
  await migrateLegacyCommunityStorageBeforeRender();
  await renderApp();
}

void bootstrap();
