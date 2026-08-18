import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { useOptimisticProjectBranches } from "./useOptimisticProjectBranches.ts";

async function withRenderHook(run) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });
  const { act, cleanup, renderHook } = await import("@testing-library/react");
  try {
    await run({ act, renderHook });
  } finally {
    cleanup();
    dom.window.close();
  }
}

// Regression coverage for the "branch switcher only shows the default
// branch" bug: branches discovered directly from a repo snapshot's own git
// clone (which sees every branch on the remote right now) are fed through
// `rememberBranch`, the same "optimistic" bucket used for branches created
// during this session — this is what makes them show up in the switcher
// without waiting on the relay's NIP-34 repo-state indexer to catch up.
test("rememberBranch surfaces a branch the repo-state event hasn't observed yet", () => {
  return withRenderHook(async ({ act, renderHook }) => {
    const { result } = renderHook(() =>
      useOptimisticProjectBranches({
        defaultBranch: "main",
        observedBranches: [{ name: "main", commit: "a".repeat(40) }],
        projectId: "project-1",
        referencedBranches: [],
      }),
    );

    assert.deepEqual(result.current.branchOptions, ["main"]);

    act(() => {
      result.current.rememberBranch({
        name: "feature-a",
        commit: "b".repeat(40),
      });
    });

    assert.deepEqual([...result.current.branchOptions].sort(), [
      "feature-a",
      "main",
    ]);
    assert.ok(
      result.current.managedBranches.some(
        (branch) =>
          branch.name === "feature-a" && branch.commit === "b".repeat(40),
      ),
    );
  });
});

test("rememberBranch does not duplicate a branch already tracked", () => {
  return withRenderHook(async ({ act, renderHook }) => {
    const { result } = renderHook(() =>
      useOptimisticProjectBranches({
        defaultBranch: "main",
        observedBranches: [],
        projectId: "project-1",
        referencedBranches: [],
      }),
    );

    act(() => {
      result.current.rememberBranch({
        name: "feature-a",
        commit: "b".repeat(40),
      });
    });
    act(() => {
      result.current.rememberBranch({
        name: "feature-a",
        commit: "b".repeat(40),
      });
    });

    assert.deepEqual(
      result.current.managedBranches.filter(
        (branch) => branch.name === "feature-a",
      ).length,
      1,
    );
  });
});

test("a remembered branch drops out once the repo-state event catches up", () => {
  return withRenderHook(async ({ act, renderHook }) => {
    const { result, rerender } = renderHook(
      (props) => useOptimisticProjectBranches(props),
      {
        initialProps: {
          defaultBranch: "main",
          observedBranches: [{ name: "main", commit: "a".repeat(40) }],
          projectId: "project-1",
          referencedBranches: [],
        },
      },
    );

    act(() => {
      result.current.rememberBranch({
        name: "feature-a",
        commit: "b".repeat(40),
      });
    });
    assert.deepEqual([...result.current.branchOptions].sort(), [
      "feature-a",
      "main",
    ]);

    rerender({
      defaultBranch: "main",
      observedBranches: [
        { name: "main", commit: "a".repeat(40) },
        { name: "feature-a", commit: "b".repeat(40) },
      ],
      projectId: "project-1",
      referencedBranches: [],
    });

    assert.deepEqual([...result.current.branchOptions].sort(), [
      "feature-a",
      "main",
    ]);
  });
});
