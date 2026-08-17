import { resolveTeamPersonas } from "@/features/agents/lib/teamPersonas";
import { rememberSelectedAgentPubkeys } from "@/features/agents/lib/agentAutocompleteEligibility";
import { repositoryDisplayPath } from "@/features/projects/lib/projectRepoHost";
import type { MentionSuggestion } from "@/features/messages/ui/MentionAutocomplete";
import type {
  AgentPersona,
  AgentTeam,
  ChannelRole,
  UserSearchResult,
} from "@/shared/api/types";
import { buildRepoLink } from "@/shared/lib/entityLink";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";
import { trimMapToSize } from "@/shared/lib/trimMapToSize";

export function formatSearchUserDisplayName(user: UserSearchResult) {
  return user.displayName?.trim() || user.nip05Handle?.trim() || null;
}

export function formatSearchUserSecondaryLabel(user: UserSearchResult) {
  const displayName = user.displayName?.trim();
  const nip05Handle = user.nip05Handle?.trim();
  return displayName && nip05Handle ? nip05Handle : null;
}

export function appendUniqueName(current: string[], name: string): string[] {
  return current.some(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  )
    ? current
    : [...current, name];
}

export type TeamMentionMember = {
  displayName: string;
  kind: "identity" | "persona";
  personaId?: string;
  pubkey?: string;
};

export type MentionCandidate = {
  kind: "identity" | "persona" | "team";
  pubkey?: string;
  personaId?: string;
  teamId?: string;
  teamMembers?: TeamMentionMember[];
  displayName: string | null;
  avatarUrl?: string | null;
  isMember: boolean;
  role?: ChannelRole | null;
  personaName?: string | null;
  secondaryLabel?: string | null;
  ownerPubkey?: string | null;
  isAgent: boolean;
  isManagedAgent?: boolean;
  isGlobalSearchResult?: boolean;
};

export function mentionCandidateLabel(candidate: MentionCandidate) {
  return (
    candidate.displayName ??
    (candidate.pubkey ? truncatePubkey(candidate.pubkey) : "agent")
  );
}

export function globalSearchIdentityKey(candidate: MentionCandidate) {
  if (
    !candidate.isGlobalSearchResult ||
    candidate.isMember ||
    candidate.isAgent
  ) {
    return null;
  }

  const label = candidate.displayName?.trim().toLowerCase();
  if (!label) return null;

  const secondaryLabel = candidate.secondaryLabel?.trim().toLowerCase() ?? "";
  return `global-person:${label}:${secondaryLabel}`;
}

function findTeamMemberTarget(
  persona: AgentPersona,
  candidates: readonly MentionCandidate[],
): TeamMentionMember | null {
  const linked = candidates
    .filter(
      (candidate) =>
        candidate.kind !== "team" && candidate.personaId === persona.id,
    )
    .sort((left, right) => {
      const rank = (candidate: MentionCandidate) => {
        if (candidate.kind === "identity" && candidate.isMember) return 0;
        if (candidate.kind === "identity" && candidate.isManagedAgent) return 1;
        if (candidate.kind === "identity") return 2;
        return 3;
      };
      return rank(left) - rank(right);
    })[0];

  if (linked) {
    return {
      displayName: linked.displayName?.trim() || persona.displayName,
      kind: linked.kind === "identity" ? "identity" : "persona",
      personaId: linked.personaId,
      pubkey: linked.pubkey,
    };
  }

  return persona.isActive
    ? {
        displayName: persona.displayName,
        kind: "persona",
        personaId: persona.id,
      }
    : null;
}

/** Build autocomplete entries for editable, locally owned teams. */
export function buildTeamMentionCandidates(
  teams: readonly AgentTeam[],
  personas: AgentPersona[],
  candidates: readonly MentionCandidate[],
): MentionCandidate[] {
  return teams.flatMap((team) => {
    if (team.isBuiltin || !team.name.trim()) return [];

    const resolution = resolveTeamPersonas(team, personas);
    if (!resolution.isUsable) return [];

    const teamMembers = resolution.resolvedPersonas
      .map((persona) => findTeamMemberTarget(persona, candidates))
      .filter((member): member is TeamMentionMember => member !== null);
    if (teamMembers.length !== resolution.resolvedPersonas.length) return [];

    const mentionNames = new Set<string>();
    for (const member of teamMembers) {
      const mentionName = member.displayName.trim().toLowerCase();
      if (mentionNames.has(mentionName)) return [];
      mentionNames.add(mentionName);
    }

    return [
      {
        kind: "team" as const,
        teamId: team.id,
        teamMembers,
        displayName: team.name.trim(),
        isMember: false,
        isAgent: true,
      },
    ];
  });
}

export function formatTeamMention(
  teamName: string,
  members: readonly TeamMentionMember[],
) {
  return `${teamName}(${members.map((member) => `@${member.displayName}`).join(" ")}) `;
}

type MentionableRepository = {
  dtag: string;
  name: string;
  owner: string;
  repoAddress: string;
  cloneUrls: string[];
};
type MentionableProject = {
  name: string;
  repositories: MentionableRepository[];
};

/**
 * Repo `@`-mention matches, ranked independently of the identity/persona/team
 * pipeline: a repo isn't a pubkey to notify, so it's matched by a simple
 * name substring instead of `rankMentionCandidates`, and selecting one
 * inserts a `buzz://repo?...` entity link (`mentionInsertTextForRepo`)
 * rather than a `@name` mention.
 */
export function buildRepoMentionSuggestions(
  projects: readonly MentionableProject[],
  query: string,
  relayOrigin: string | null | undefined,
  limit: number,
): MentionSuggestion[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const seen = new Set<string>();
  const matches: MentionSuggestion[] = [];
  for (const project of projects) {
    for (const repository of project.repositories) {
      if (matches.length >= limit) return matches;
      if (seen.has(repository.repoAddress)) continue;
      if (!repository.name.toLowerCase().includes(needle)) continue;
      try {
        buildRepoLink({ owner: repository.owner, dtag: repository.dtag });
      } catch {
        continue;
      }
      seen.add(repository.repoAddress);
      matches.push({
        kind: "repo",
        displayName: repository.name,
        repoOwner: repository.owner,
        repoDtag: repository.dtag,
        repoPathLabel:
          repositoryDisplayPath(repository, relayOrigin) ?? project.name,
      });
    }
  }
  return matches;
}

/** Text inserted for a selected repo mention suggestion — the repo's
 * `buzz://repo?...` entity link, or the plain name if the link can't be
 * built (still better than inserting a broken link). */
export function mentionInsertTextForRepo(
  suggestion: Pick<MentionSuggestion, "displayName" | "repoOwner" | "repoDtag">,
): string {
  if (!suggestion.repoOwner) return `${suggestion.displayName} `;
  try {
    return `${buildRepoLink({
      owner: suggestion.repoOwner,
      dtag: suggestion.repoDtag ?? "",
    })} `;
  } catch {
    return `${suggestion.displayName} `;
  }
}

/**
 * Records a selected identity/persona/team mention suggestion in the
 * mention-map bookkeeping (`p`-tag tracking, agent-notify tracking, the
 * selected-names lists) and returns the `@name` text to insert. Pulled out
 * of `useMentions`'s `insertMention` callback purely to keep that file
 * under the repo's file-size ratchet — this only touches the passed-in
 * refs/setters, not React state directly, so it's safe to call from an
 * event handler (not during render).
 */
export function recordIdentityMentionSelection(
  suggestion: MentionSuggestion,
  context: {
    mentionMap: Map<string, string>;
    personaMentionMap: Map<string, string>;
    knownAgentPubkeys: ReadonlySet<string>;
    selectedAgentMentionPubkeys: Set<string>;
    setSelectedMentionNames: (updater: (current: string[]) => string[]) => void;
    setSelectedAgentMentionNames: (
      updater: (current: string[]) => string[],
    ) => void;
    selectedAgentMentionNamesRef: { current: string[] };
  },
): string {
  const displayName = suggestion.displayName;
  const teamMembers =
    suggestion.kind === "team" ? suggestion.teamMembers : null;
  const insertText = teamMembers
    ? formatTeamMention(displayName, teamMembers)
    : `@${displayName} `;

  const selectedMentions = teamMembers ?? [suggestion];
  for (const selected of selectedMentions) {
    if (selected.kind === "persona" && selected.personaId) {
      context.personaMentionMap.set(selected.displayName, selected.personaId);
      context.mentionMap.delete(selected.displayName);
    } else if (selected.pubkey) {
      context.mentionMap.set(selected.displayName, selected.pubkey);
      context.personaMentionMap.delete(selected.displayName);
    }
  }
  context.setSelectedMentionNames((current) =>
    appendSelectedNames(current, selectedMentions),
  );

  const isAgentMention =
    suggestion.kind === "persona" ||
    suggestion.kind === "team" ||
    suggestion.isAgent === true ||
    (suggestion.pubkey
      ? context.knownAgentPubkeys.has(normalizePubkey(suggestion.pubkey))
      : false);
  rememberSelectedAgentPubkeys(
    context.selectedAgentMentionPubkeys,
    selectedMentions,
    isAgentMention,
  );
  if (isAgentMention) {
    context.setSelectedAgentMentionNames((current) => {
      const next = appendSelectedNames(current, selectedMentions);
      context.selectedAgentMentionNamesRef.current = next;
      return next;
    });
  }
  trimMapToSize(context.mentionMap, 200);
  trimMapToSize(context.personaMentionMap, 200);
  return insertText;
}

function appendSelectedNames(
  current: readonly string[],
  selected: readonly { displayName: string }[],
): string[] {
  const known = new Set(current.map((name) => name.toLowerCase()));
  return [
    ...current,
    ...selected
      .map((entry) => entry.displayName)
      .filter((name) => !known.has(name.toLowerCase())),
  ];
}
