import type { StoredProjectsAgentConversation } from "@/features/projects/lib/projectAgentConversationStorage";
import type { Channel } from "@/shared/api/types";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import { normalizePubkey } from "@/shared/lib/pubkey";

/**
 * Restores an inline Projects conversation strictly from a pointer this
 * feature persisted earlier. DM channels are reused across the app, so
 * inferring a conversation from "the most recent agent DM" would surface
 * unrelated chat history on the Projects page — never infer one here.
 */
export function restoreProjectsAgentConversation<
  Agent extends { pubkey: string },
>({
  stored,
  channels,
  candidates,
}: {
  stored: StoredProjectsAgentConversation | null;
  channels: readonly Channel[];
  candidates: readonly Agent[];
}): { channel: Channel; agent: Agent; visibleAfter: number } | null {
  // A zero cutoff would render the DM's full history; only pointers
  // anchored to a concrete Projects prompt are restorable.
  if (!stored || stored.visibleAfter <= 0) return null;
  const channel = channels.find(
    (candidate) => candidate.id === stored.channelId,
  );
  const agentPubkey = normalizePubkey(stored.agentPubkey);
  const agent = candidates.find(
    (candidate) => candidate.pubkey === agentPubkey,
  );
  if (!channel || !agent) return null;
  return { agent, channel, visibleAfter: stored.visibleAfter };
}

/**
 * Chat rows for the inline Projects thread: plain messages only, and nothing
 * sent before the conversation cutoff — the backing DM may hold unrelated
 * history from ordinary DM usage.
 */
export function visibleConversationMessages<
  Event extends { kind: number; created_at: number },
>(events: readonly Event[], visibleAfter: number): Event[] {
  return events
    .filter(
      (event) =>
        (event.kind === KIND_STREAM_MESSAGE ||
          event.kind === KIND_STREAM_MESSAGE_V2) &&
        event.created_at >= visibleAfter,
    )
    .sort((left, right) => left.created_at - right.created_at);
}

/**
 * Templated request sent to an agent to publish a new repository into a
 * project. Repositories are always published by an agent — never signed
 * directly with the human's own key — so this is the only "create a
 * repository" affordance in a project that already exists.
 */
export function buildCreateRepoPrompt(project: { name: string }): string {
  return `Please create and publish a new repository for the "${project.name}" project.`;
}

/**
 * Templated request sent to an agent to remove a repository from a project
 * it published. Only the agent that signed the project's `kind:30621`
 * membership list can re-sign an edited version of it — a human can't
 * produce that signature themselves, even when they own the agent.
 */
export function buildRemoveRepoPrompt(
  project: { name: string },
  repository: { name: string },
): string {
  return `Please remove the "${repository.name}" repository from the "${project.name}" project.`;
}
