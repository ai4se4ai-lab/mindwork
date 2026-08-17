import * as React from "react";
import { toast } from "sonner";

import type { Project, Repository } from "@/features/projects/hooks";
import { buildRemoveRepoPrompt } from "@/features/projects/lib/projectAgentConversation";
import { projectRepositoryRemovalMode } from "@/features/projects/lib/projectsViewHelpers";
import { useRemoveProjectRepositoryMutation } from "@/features/projects/useRemoveProjectRepository";
import type { UserProfileLookup } from "@/features/profile/lib/identity";

/**
 * Removing a repo from a project's member list: a direct patch when the
 * viewer signed the project themselves, or a routed request to the agent
 * that owns it (a human can't re-sign an agent-signed `kind:30621`). Split
 * out of `ProjectsView.tsx` to keep that file under the repo's file-size
 * ratchet.
 */
export function useRemoveRepositoryHandler(
  currentPubkey: string | undefined,
  profiles: UserProfileLookup | undefined,
  goProjects: (options: { askAgentPrompt?: string }) => Promise<unknown>,
) {
  const removeRepositoryMutation = useRemoveProjectRepositoryMutation();

  const handleRemoveRepository = React.useCallback(
    async (project: Project, repository: Repository) => {
      const mode = projectRepositoryRemovalMode(
        project,
        currentPubkey,
        profiles,
      );
      if (mode === "agent") {
        void goProjects({
          askAgentPrompt: buildRemoveRepoPrompt(project, repository),
        });
        return;
      }
      if (mode !== "direct") return;
      try {
        await removeRepositoryMutation.mutateAsync({ project, repository });
        toast.success(`Repository "${repository.name}" removed.`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to remove the repository",
        );
      }
    },
    [currentPubkey, goProjects, profiles, removeRepositoryMutation],
  );

  return {
    handleRemoveRepository,
    removeDisabled: removeRepositoryMutation.isPending,
  };
}
