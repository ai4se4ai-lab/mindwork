import * as React from "react";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelsQuery } from "@/features/channels/hooks";
import type { Project, Repository } from "@/features/projects/hooks";
import { buildCreateRepoPrompt } from "@/features/projects/lib/projectAgentConversation";
import { useAttachProjectRepositoryMutation } from "@/features/projects/useAttachProjectRepository";
import { useBindProjectRepositoryChannelMutation } from "@/features/projects/useBindProjectRepositoryChannel";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { AttachProjectRepositoryDialog } from "./AttachProjectRepositoryDialog";
import { ProjectRepositoryPicker } from "./ProjectRepositoryPicker";

export function ProjectRepositoryManagement({
  identityPubkey,
  onChange,
  project,
  projects,
  repository,
}: {
  identityPubkey?: string;
  onChange: (repositoryId: string) => void;
  project: Project;
  projects: Project[];
  repository: Repository;
}) {
  const { goProjects } = useAppNavigation();
  const [attachOpen, setAttachOpen] = React.useState(false);
  const channelsQuery = useChannelsQuery();
  const attachMutation = useAttachProjectRepositoryMutation();
  const repairMutation = useBindProjectRepositoryChannelMutation();
  const canEdit = identityPubkey?.toLowerCase() === project.owner.toLowerCase();
  const accessChannels = React.useMemo(
    () =>
      (channelsQuery.data ?? []).filter(
        (channel) =>
          channel.isMember &&
          !channel.archivedAt &&
          channel.channelType !== "dm",
      ),
    [channelsQuery.data],
  );
  const canManageAccess =
    accessChannels.length > 0 &&
    identityPubkey?.toLowerCase() === repository.owner.toLowerCase();
  const attachCandidates = React.useMemo(() => {
    const currentAddresses = new Set(project.repositoryAddresses);
    const candidates = new Map<string, Repository>();
    for (const candidateProject of projects) {
      for (const candidate of candidateProject.repositories) {
        if (!currentAddresses.has(candidate.repoAddress)) {
          candidates.set(candidate.repoAddress, candidate);
        }
      }
    }
    return [...candidates.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [project.repositoryAddresses, projects]);

  return (
    <>
      <AttachProjectRepositoryDialog
        isAttaching={attachMutation.isPending}
        onAttach={async (candidate) => {
          const result = await attachMutation.mutateAsync({
            project,
            repository: candidate,
          });
          onChange(result.repository.id);
          toast.success(`Repository "${result.repository.name}" added.`);
        }}
        onOpenChange={setAttachOpen}
        open={attachOpen}
        project={project}
        repositories={attachCandidates}
      />
      <ProjectRepositoryPicker
        onAttach={canEdit ? () => setAttachOpen(true) : undefined}
        onChange={onChange}
        onCreate={
          canEdit
            ? () =>
                void goProjects({
                  askAgentPrompt: buildCreateRepoPrompt(project),
                })
            : undefined
        }
        project={project}
        repository={repository}
      />
      {canManageAccess ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-8 shrink-0 gap-1.5"
              disabled={repairMutation.isPending}
              size="sm"
              type="button"
              variant="outline"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {repairMutation.isPending ? "Updating…" : "Access"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>Repository access channel</DropdownMenuLabel>
            {accessChannels.map((channel) => (
              <DropdownMenuItem
                className="justify-between gap-4"
                key={channel.id}
                onSelect={() => {
                  if (channel.id === repository.channelId) return;
                  void repairMutation
                    .mutateAsync({
                      channelId: channel.id,
                      repository,
                    })
                    .then(() => {
                      toast.success(
                        `Repository access set to #${channel.name}.`,
                      );
                    })
                    .catch((error: unknown) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to update repository access.",
                      );
                    });
                }}
              >
                <span className="min-w-0 truncate">#{channel.name}</span>
                {channel.id === repository.channelId ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
