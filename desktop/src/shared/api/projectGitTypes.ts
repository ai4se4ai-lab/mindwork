export type ProjectRepoCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
};

export type ProjectRepoFile = {
  path: string;
  kind: string;
  size: number | null;
  previewContent: string | null;
  lastChangedAt: number | null;
  latestCommit: ProjectRepoCommit | null;
};

export type ProjectRepoContributor = {
  name: string;
  email: string;
  commitCount: number;
  lastCommitAt: number;
};

export type ProjectRepoSnapshotBranch = {
  name: string;
  commit: string;
};

export type ProjectRepoSnapshot = {
  latestCommit: ProjectRepoCommit | null;
  commits: ProjectRepoCommit[];
  files: ProjectRepoFile[];
  contributors: ProjectRepoContributor[];
  /** Every branch that exists on the remote right now, read directly from
   * the snapshot's own clone rather than a possibly-stale relay repo-state
   * event. */
  branches: ProjectRepoSnapshotBranch[];
};

export type ProjectRepoDiffFile = {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  /** True when the patch was cut off at the backend's per-file line cap. */
  truncated: boolean;
};

export type ProjectRepoDiff = {
  files: ProjectRepoDiffFile[];
  additions: number;
  deletions: number;
  commitBody: string | null;
};

export type ProjectLocalRepoSnapshot = {
  path: string;
  snapshot: ProjectRepoSnapshot;
};

export type ProjectLocalRepository = {
  name: string;
  path: string;
};

export type ProjectRepoSyncStatus = {
  localPath: string | null;
  localBranch: string | null;
  localBranches: string[];
  localHead: string | null;
  localShortHead: string | null;
  remoteBranch: string | null;
  remoteHead: string | null;
  remoteShortHead: string | null;
  mergeBase: string | null;
  aheadCount: number;
  behindCount: number;
  hasUncommittedChanges: boolean;
  hasUntrackedFiles: boolean;
  canPush: boolean;
  pushBlockReason: string | null;
  canPull: boolean;
  pullBlockReason: string | null;
};

export type ProjectRepoPushResult = {
  pushed: boolean;
  message: string;
  branch: string;
  commit: string;
  mergeBase: string | null;
};

export type ProjectRepoPullResult = {
  pulled: boolean;
  message: string;
};

export type ProjectRepoCloneResult = {
  path: string;
  cloned: boolean;
  message: string;
};

export type ProjectRepoBranchResult = {
  branch: string;
  commit: string;
  message: string;
};

export type ProjectRepoMergeResult = {
  message: string;
  mergeCommit: string;
  statusEvent: string;
  statusPublicationError: string | null;
};
