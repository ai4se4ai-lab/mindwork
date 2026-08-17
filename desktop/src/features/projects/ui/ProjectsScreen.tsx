import { ProjectsView } from "@/features/projects/ui/ProjectsView";

export function ProjectsScreen({
  askAgentPrompt,
}: {
  /** Pre-fills and opens the "ask an agent" flow, e.g. when routed here from
   * a repository's "Ask an agent to create/remove a repository" action. */
  askAgentPrompt?: string;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ProjectsView askAgentPrompt={askAgentPrompt} />
    </div>
  );
}
