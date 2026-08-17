import * as React from "react";

import { useProjectsQuery } from "@/features/projects/hooks";
import { useRelayOrigin } from "@/shared/lib/useRelayOrigin";
import type { MentionSuggestion } from "@/features/messages/ui/MentionAutocomplete";
import { buildRepoMentionSuggestions } from "./mentionCandidates";

const MENTION_REPO_SUGGESTION_LIMIT = 5;

/**
 * Repo `@`-mention matches for the current query, kept entirely separate
 * from `useMentions`'s identity/persona/team pipeline — a repo isn't a
 * pubkey to notify, so it's matched by a simple name substring
 * (`buildRepoMentionSuggestions`) rather than `rankMentionCandidates`.
 * Split into its own hook to keep `useMentions.ts` under the repo's
 * file-size ratchet.
 */
export function useRepoMentionSuggestions(
  mentionQuery: string | null,
  mentionSearchQuery: string,
): MentionSuggestion[] {
  const projectsQuery = useProjectsQuery();
  const relayOrigin = useRelayOrigin();

  return React.useMemo<MentionSuggestion[]>(() => {
    if (mentionQuery === null) return [];
    return buildRepoMentionSuggestions(
      projectsQuery.data ?? [],
      mentionSearchQuery,
      relayOrigin,
      MENTION_REPO_SUGGESTION_LIMIT,
    );
  }, [mentionQuery, mentionSearchQuery, projectsQuery.data, relayOrigin]);
}
