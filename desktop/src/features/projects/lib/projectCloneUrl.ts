/**
 * Deriving a default clone URL for a NIP-34 repo announcement that omits an
 * explicit `clone` tag.
 *
 * Buzz relays serve their own git repositories at a canonical path —
 * `<relay-origin>/git/<owner-pubkey>/<repo-id>` — which is exactly the shape the
 * Rust `validate_clone_url` gate enforces. When an announcement carries no
 * `clone` tag (e.g. it was created via `buzz repos create` without `--clone`),
 * the desktop would otherwise have no URL to fetch from, so the project detail
 * view comes up empty. Synthesizing the canonical relay-hosted URL lets those
 * repositories load while still deferring to any explicit clone URLs.
 */

/**
 * Builds the canonical relay-hosted clone URL for a repository, or `null` when
 * the inputs cannot produce a valid URL (unresolved relay origin, missing owner
 * pubkey, or missing repo id). Fails closed rather than emitting a broken URL.
 *
 * `relayOrigin` is expected to be a bare origin (scheme + host, e.g.
 * `https://relay.example`); a trailing slash is tolerated.
 */
export function deriveRelayCloneUrl(
  relayOrigin: string | null | undefined,
  owner: string,
  dtag: string,
): string | null {
  if (!relayOrigin || !owner || !dtag) return null;
  // The Rust validator requires a 64-char hex owner pubkey; anything else is
  // not a relay-hosted repo we can address, so decline rather than guess.
  if (!/^[0-9a-fA-F]{64}$/.test(owner)) return null;
  const origin = relayOrigin.replace(/\/+$/, "");
  return `${origin}/git/${owner.toLowerCase()}/${dtag}`;
}

/**
 * Whether `cloneUrl` points at this relay's own canonical git path
 * (`<relay-origin>/git/<owner-pubkey>/<repo-id>`) — the same shape enforced
 * by the Rust `validate_clone_url` gate. Shared by `projectRepoHost.ts` so
 * both files agree on what counts as "this relay's own repo."
 */
export function isBuzzCloneUrl(
  cloneUrl: string,
  relayOrigin: string | null | undefined,
): boolean {
  if (!relayOrigin) return false;
  try {
    const clone = new URL(cloneUrl);
    const relay = new URL(relayOrigin);
    const isBuzzPath = /^\/git\/[0-9a-f]{64}\/[^/]+\/?$/i.test(clone.pathname);
    return clone.origin === relay.origin && isBuzzPath;
  } catch {
    return false;
  }
}

/**
 * Returns the effective clone URLs for a project: the explicitly advertised
 * ones when present (reordered so a Buzz-relay-hosted URL sorts first, if
 * one is present among several), otherwise a single-element list holding the
 * derived relay-hosted default (or an empty list when no default can be
 * derived).
 *
 * Explicit `clone` tags always win — NIP-34 permits pointing `clone` at an
 * external host (e.g. GitHub), which must not be overridden. But when a
 * repo advertises *both* an external mirror and its own relay URL, every
 * consumer in this codebase takes `effectiveCloneUrls(...)[0]` as "the"
 * clone URL — so the relay-hosted one (the one this app can actually clone,
 * branch-switch, and push to) must be the one that sorts first, regardless
 * of publish order.
 */
export function effectiveCloneUrls(
  cloneUrls: string[],
  relayOrigin: string | null | undefined,
  owner: string,
  dtag: string,
): string[] {
  if (cloneUrls.length > 0) {
    if (cloneUrls.length === 1) return cloneUrls;
    const buzz = cloneUrls.filter((url) => isBuzzCloneUrl(url, relayOrigin));
    if (buzz.length === 0 || buzz.length === cloneUrls.length) {
      return cloneUrls;
    }
    const rest = cloneUrls.filter((url) => !isBuzzCloneUrl(url, relayOrigin));
    return [...buzz, ...rest];
  }
  const derived = deriveRelayCloneUrl(relayOrigin, owner, dtag);
  return derived ? [derived] : [];
}
