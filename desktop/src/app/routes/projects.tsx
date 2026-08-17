import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { usePreviewFeatureWarning } from "@/shared/features";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const ProjectsScreen = React.lazy(async () => {
  const module = await import("@/features/projects/ui/ProjectsScreen");
  return { default: module.ProjectsScreen };
});

export const Route = createFileRoute("/projects")({
  component: ProjectsRouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    askAgentPrompt:
      typeof search.askAgentPrompt === "string"
        ? search.askAgentPrompt
        : undefined,
  }),
});

function ProjectsRouteComponent() {
  usePreviewFeatureWarning("projects");
  const { askAgentPrompt } = Route.useSearch();
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <ProjectsScreen askAgentPrompt={askAgentPrompt} />
    </React.Suspense>
  );
}
