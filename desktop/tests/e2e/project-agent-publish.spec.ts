import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

// The projects surface is a preview feature — opt in before the app mounts.
// Must run before installMockBridge so React reads the override on mount.
async function enableProjectsFeature(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "buzz-feature-overrides-v1",
      JSON.stringify({ projects: true }),
    );
  });
}

test("creating a project works, and repos are only ever added by asking an agent", async ({
  page,
}) => {
  await enableProjectsFeature(page);
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-projects-view").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" }),
  ).toBeVisible();

  // ── Bug 1 regression guard: project creation still works end to end ──
  await page.getByTestId("projects-create-menu").hover();
  await page.getByRole("menuitem", { name: "Project" }).click();
  await expect(page.getByTestId("create-project-dialog")).toBeVisible();
  // A qualifying channel is auto-selected once loaded; the empty-state
  // guidance must not be showing when one is available.
  await expect(
    page.getByTestId("create-project-no-channels"),
  ).not.toBeVisible();
  await page.getByTestId("create-project-name").fill("agent-publish-demo");
  await expect(page.getByTestId("create-project-submit")).toBeEnabled();
  await page.getByTestId("create-project-submit").click();
  await expect(page.getByTestId("create-project-dialog")).toBeHidden();

  const projectCard = page
    .locator(
      '[data-testid="project-card-agent-publish-demo"], [data-testid="project-row-agent-publish-demo"]',
    )
    .first();
  await expect(projectCard).toBeVisible();

  // ── Bug 2, entry point A: the toolbar "Ask an agent" flow is mounted
  // and reachable — it previously existed as a component but nothing in
  // the app rendered it.
  await page.getByTestId("projects-create-menu").hover();
  await page.getByTestId("projects-ask-agent").click();
  await expect(
    page.getByRole("heading", { name: "Ask an agent about your projects" }),
  ).toBeVisible();
  await page.getByTestId("projects-agent-prompt-back").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" }),
  ).toBeVisible();

  // ── Bug 2, entry point B: adding a repo to an existing project routes
  // through the same agent flow instead of publishing directly with the
  // human's own key. The direct "create repository" dialog must be gone.
  await projectCard.click();
  await page.getByTestId("add-project-repository").click();
  await page.getByTestId("create-project-repository").click();

  await expect(
    page.getByRole("heading", { name: "Ask an agent about your projects" }),
  ).toBeVisible();
  await expect(page.getByTestId("add-project-repository-dialog")).toHaveCount(
    0,
  );
  const composer = page.locator(".rich-text-composer");
  await expect(composer).toContainText(
    'Please create and publish a new repository for the "agent-publish-demo" project.',
  );
});

test("a published repo can be found and mentioned with @ in a channel", async ({
  page,
}) => {
  await enableProjectsFeature(page);
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-projects-view").click();

  // Bootstrap a project with its initial repo — the one remaining direct
  // publish path (see the plan's scope note) — so there's a repo to find.
  await page.getByTestId("projects-create-menu").hover();
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByTestId("create-project-name").fill("mentionable-repo");
  await page.getByTestId("create-project-submit").click();
  await expect(page.getByTestId("create-project-dialog")).toBeHidden();

  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");

  const input = page.getByTestId("message-input");
  await input.fill("Check out @mentionable-re");

  const autocomplete = page
    .getByTestId("message-composer")
    .getByTestId("mention-autocomplete");
  await expect(autocomplete).toBeVisible();
  const repoSuggestion = autocomplete.locator("button", {
    hasText: "mentionable-repo",
  });
  await expect(repoSuggestion).toBeVisible();
  await repoSuggestion.click();

  await expect(input).toContainText("buzz://repo?owner=");
  await expect(input).toContainText("&d=mentionable-repo");
});
