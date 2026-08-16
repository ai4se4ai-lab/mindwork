import { useQuery } from "@tanstack/react-query";

import { getIdentity } from "@/shared/api/tauriIdentity";

export function useIdentityQuery() {
  return useQuery({
    queryKey: ["identity"],
    queryFn: getIdentity,
    staleTime: Number.POSITIVE_INFINITY,
    // Once this has errored, a second component mounting its own observer
    // (e.g. WelcomeSetup alongside MachineBootstrap) must not silently
    // re-trigger a fetch: react-query's default retryOnMount treats a
    // never-succeeded query as always eligible to (re)load on mount, which
    // resets fetchFailureCount and flips status back to "pending". Consumers
    // that gate on `status === "error"` (useMachineOnboardingState) then flip
    // back to blocking, unmount, and the cycle repeats forever — an infinite
    // boot loop that never surfaces on desktop (get_identity essentially
    // never errors there) but is the steady state for a browser session with
    // no NIP-07 extension installed. A caller can still retry explicitly via
    // `refetch()`.
    retryOnMount: false,
  });
}
