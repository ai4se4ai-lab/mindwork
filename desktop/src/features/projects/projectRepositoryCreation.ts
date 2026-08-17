import type { RelayEvent } from "@/shared/api/types";
import type { Repository } from "@/features/projects/hooks";
import {
  isValidProjectChannelId,
  MAX_PROJECT_MEMBERS,
  validateProjectEventEnvelope,
} from "@/features/projects/projectModels";
import {
  KIND_PROJECT_ANNOUNCEMENT,
  KIND_REPO_ANNOUNCEMENT,
} from "@/shared/constants/kinds";
import type { ProjectEventTemplate } from "./projectCreation";

/**
 * Creates a project-replacement event template from a live, signed raw head
 * (fetched immediately before the mutation). Only the `a` membership tags are
 * patched; every other tag and the `content` field are preserved verbatim,
 * satisfying NIP-MP's extension-tag preservation rule and preventing a cached
 * UI projection from silently erasing unknown tags.
 *
 * Performs full NIP-MP envelope validation on the patched output via the shared
 * `validateProjectEventEnvelope` validator — the same checks applied by the
 * read parser — so Desktop's write path agrees with its read path on which
 * heads are valid regardless of the relay in use.
 */
function buildProjectPatchTemplate({
  liveHead,
  ownerPubkey,
  repositoryAddresses,
}: {
  liveHead: RelayEvent;
  ownerPubkey: string;
  repositoryAddresses: string[];
}): ProjectEventTemplate {
  const normalizedOwner = ownerPubkey.trim().toLowerCase();
  if (normalizedOwner !== liveHead.pubkey.toLowerCase()) {
    throw new Error("Only the project owner can add repositories.");
  }
  if (repositoryAddresses.length > MAX_PROJECT_MEMBERS) {
    throw new Error(
      `A project cannot contain more than ${MAX_PROJECT_MEMBERS} repositories.`,
    );
  }
  if (new Set(repositoryAddresses).size !== repositoryAddresses.length) {
    throw new Error("A project cannot contain duplicate repositories.");
  }
  if (
    repositoryAddresses.some(
      (address) => !/^30617:[0-9a-f]{64}:.+$/.test(address),
    )
  ) {
    throw new Error("Repository address is invalid.");
  }

  // Replace all existing `a` tags with the new set, preserving everything else
  // (d, name, description, buzz-channel, buzz-visibility, relay hints embedded
  // in `a` tags, and any future/unknown tags).
  const nonMemberTags = liveHead.tags.filter((tag) => tag[0] !== "a");
  const existingHints = new Map<string, string>();
  for (const tag of liveHead.tags) {
    if (tag[0] === "a" && tag[1] && tag[2]) {
      existingHints.set(tag[1], tag[2]);
    }
  }
  const memberTags = repositoryAddresses.sort().map((address): string[] => {
    const hint = existingHints.get(address);
    return hint ? ["a", address, hint] : ["a", address];
  });

  const patchedTags = [...nonMemberTags, ...memberTags];
  const content = liveHead.content;

  // Validate the full patched envelope against NIP-MP rules. This catches
  // nonconforming live heads (e.g., from a relay that accepted a malformed
  // event) before we sign and re-submit, and pins the write path to the same
  // spec the read parser enforces: duplicate `d`, duplicate/oversized
  // metadata, malformed member arity, and the 64-member boundary.
  validateProjectEventEnvelope(patchedTags, content);

  return {
    kind: KIND_PROJECT_ANNOUNCEMENT,
    content,
    tags: patchedTags,
  };
}

export { buildProjectPatchTemplate };

export function buildRepositoryChannelBindingTemplate({
  channelId,
  ownerPubkey,
  repository,
}: {
  channelId: string;
  ownerPubkey: string;
  repository: Repository;
}): ProjectEventTemplate {
  const normalizedChannelId = channelId.trim();
  if (ownerPubkey.trim().toLowerCase() !== repository.owner.toLowerCase()) {
    throw new Error("Only the repository owner can repair its access.");
  }
  if (!isValidProjectChannelId(normalizedChannelId)) {
    throw new Error("Repository access channel is invalid.");
  }
  if (!repository.eventTags) {
    throw new Error(
      "Repository metadata is unavailable. Refresh and try again.",
    );
  }

  return {
    kind: KIND_REPO_ANNOUNCEMENT,
    content: repository.eventContent ?? repository.description,
    tags: [
      ...repository.eventTags
        .filter((tag) => tag[0] !== "buzz-channel")
        .map((tag) => [...tag]),
      ["buzz-channel", normalizedChannelId],
    ],
  };
}
