//! Branch-checkout helpers shared by the remote-snapshot and local-worktree
//! commands in `project_git.rs`. Split out to keep that file under the
//! repo's file-size ratchet, mirroring the existing `project_git_*.rs`
//! sibling-file convention (`project_git_push.rs`, `project_git_branches.rs`,
//! etc.).

use super::project_git::first_output_line;
use super::project_git_exec::{run_git, GitAuthConfig};

/// Clones `clone_url` into `repo_path`, checking out `branch` when given.
/// Never silently retries without `--branch` on failure and hands back the
/// default branch's content under the requested branch's name — that's
/// indistinguishable from "switching branches doesn't work" to the caller.
/// The failure is surfaced instead; it may mean the branch hasn't been
/// pushed yet, not just a transient clone error.
pub(crate) fn clone_repo_at_branch(
    clone_url: &str,
    repo_path: &str,
    branch: Option<&str>,
    auth: &GitAuthConfig,
) -> Result<(), String> {
    let mut clone_args = vec!["clone", "--filter=blob:none"];
    if let Some(branch) = branch {
        clone_args.push("--branch");
        clone_args.push(branch);
    }
    clone_args.push(clone_url);
    clone_args.push(repo_path);
    run_git(&clone_args, None, auth)
        .map(|_| ())
        .map_err(|error| match branch {
            Some(branch) => format!(
                "Branch '{branch}' could not be found on the remote. It may not have been pushed yet. ({error})"
            ),
            None => error,
        })
}

/// Switches the persistent local worktree to `branch` if it isn't already
/// checked out there, so selecting a different branch in the "local" source
/// actually shows that branch's content instead of silently reading
/// whatever happened to be on disk. Tries a plain checkout first (covers
/// branches that already exist locally); if that fails because the branch
/// only exists on the remote, fetches it and creates a local tracking
/// branch. Never forces — a plain `git checkout` already refuses to run
/// over uncommitted changes it would overwrite, and that refusal is
/// surfaced as an error rather than swallowed, so local edits are never
/// silently discarded.
pub(crate) fn ensure_worktree_on_branch(
    repo_dir: &std::path::Path,
    auth: &GitAuthConfig,
    branch: &str,
) -> Result<(), String> {
    let current = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], Some(repo_dir), auth)
        .ok()
        .and_then(|output| first_output_line(&output));
    if current.as_deref() == Some(branch) {
        return Ok(());
    }

    if run_git(&["checkout", branch], Some(repo_dir), auth).is_ok() {
        return Ok(());
    }

    run_git(&["fetch", "origin", branch], Some(repo_dir), auth).map_err(|error| {
        format!(
            "Branch '{branch}' could not be found locally or on the remote. It may not have been pushed yet. ({error})"
        )
    })?;
    let remote_branch = format!("origin/{branch}");
    run_git(
        &["checkout", "-B", branch, &remote_branch],
        Some(repo_dir),
        auth,
    )
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::{clone_repo_at_branch, ensure_worktree_on_branch};
    use crate::commands::project_git_exec::{build_test_git_auth_config, run_git};

    fn commit(repo_dir: &std::path::Path, auth: &super::GitAuthConfig, file: &str, content: &str) {
        std::fs::write(repo_dir.join(file), content).expect("write fixture file");
        run_git(&["add", file], Some(repo_dir), auth).expect("stage fixture file");
        run_git(
            &[
                "-c",
                "user.name=Buzz Test",
                "-c",
                "user.email=test@example.com",
                "commit",
                "-m",
                &format!("commit {file}"),
            ],
            Some(repo_dir),
            auth,
        )
        .expect("commit fixture file");
    }

    /// A bare `origin` remote with `main` (default) and `feature` branches,
    /// each carrying distinct content, plus the seed checkout used to build
    /// it (kept alive so the tempdir isn't dropped).
    struct Fixture {
        _root: tempfile::TempDir,
        remote_path: String,
    }

    fn seed_remote_with_two_branches() -> Fixture {
        let auth = build_test_git_auth_config().expect("build test git config");
        let root = tempfile::tempdir().expect("create test directory");
        let remote = root.path().join("remote.git");
        let seed = root.path().join("seed");
        let remote_path = remote.to_str().expect("remote path").to_string();
        let seed_path = seed.to_str().expect("seed path");

        run_git(&["init", "--bare", "--", &remote_path], None, &auth).expect("init remote");
        run_git(&["init", "--", seed_path], None, &auth).expect("init seed checkout");
        run_git(
            &["symbolic-ref", "HEAD", "refs/heads/main"],
            Some(&seed),
            &auth,
        )
        .expect("set default branch");
        commit(&seed, &auth, "README.md", "main content\n");
        run_git(&["checkout", "-b", "feature"], Some(&seed), &auth).expect("create feature branch");
        commit(&seed, &auth, "FEATURE.md", "feature content\n");
        // Also change a file that exists on both branches, so a working-tree
        // edit made while on `main` genuinely conflicts with `feature`'s
        // version of the same file (not just a no-op fast-forward).
        commit(&seed, &auth, "README.md", "feature branch changed this\n");
        run_git(
            &["remote", "add", "origin", &remote_path],
            Some(&seed),
            &auth,
        )
        .expect("add remote");
        run_git(&["push", "origin", "main", "feature"], Some(&seed), &auth)
            .expect("push both branches");

        Fixture {
            _root: root,
            remote_path,
        }
    }

    #[test]
    fn clone_repo_at_branch_checks_out_the_requested_branch() {
        let auth = build_test_git_auth_config().expect("build test git config");
        let fixture = seed_remote_with_two_branches();
        let dest_root = tempfile::tempdir().expect("create dest directory");
        let dest = dest_root.path().join("clone");
        let dest_path = dest.to_str().expect("dest path");

        clone_repo_at_branch(&fixture.remote_path, dest_path, Some("feature"), &auth)
            .expect("clone the feature branch");

        assert_eq!(
            run_git(&["branch", "--show-current"], Some(&dest), &auth)
                .expect("read checked-out branch")
                .trim(),
            "feature"
        );
        assert!(dest.join("FEATURE.md").exists());
    }

    #[test]
    fn clone_repo_at_branch_errors_with_the_branch_name_instead_of_silently_using_the_default() {
        let auth = build_test_git_auth_config().expect("build test git config");
        let fixture = seed_remote_with_two_branches();
        let dest_root = tempfile::tempdir().expect("create dest directory");
        let dest = dest_root.path().join("clone");
        let dest_path = dest.to_str().expect("dest path");

        let error = clone_repo_at_branch(&fixture.remote_path, dest_path, Some("missing"), &auth)
            .expect_err("branch does not exist on the remote");

        assert!(
            error.contains("missing"),
            "error should name the missing branch, got: {error}"
        );
        // No silent fallback: nothing was left behind under the requested path.
        assert!(!dest.exists());
    }

    #[test]
    fn ensure_worktree_on_branch_fetches_and_checks_out_a_remote_only_branch() {
        let auth = build_test_git_auth_config().expect("build test git config");
        let fixture = seed_remote_with_two_branches();
        let checkout_root = tempfile::tempdir().expect("create checkout directory");
        let checkout = checkout_root.path().join("checkout");
        let checkout_path = checkout.to_str().expect("checkout path");

        // A checkout that only knows about `main` locally — mirrors an
        // ordinary clone that never fetched `feature`.
        clone_repo_at_branch(&fixture.remote_path, checkout_path, Some("main"), &auth)
            .expect("clone main");
        assert!(!checkout.join("FEATURE.md").exists());

        ensure_worktree_on_branch(&checkout, &auth, "feature")
            .expect("switch to the remote-only branch");

        assert_eq!(
            run_git(&["branch", "--show-current"], Some(&checkout), &auth)
                .expect("read checked-out branch")
                .trim(),
            "feature"
        );
        assert!(checkout.join("FEATURE.md").exists());
    }

    #[test]
    fn ensure_worktree_on_branch_is_a_no_op_when_already_on_the_branch() {
        let auth = build_test_git_auth_config().expect("build test git config");
        let fixture = seed_remote_with_two_branches();
        let checkout_root = tempfile::tempdir().expect("create checkout directory");
        let checkout = checkout_root.path().join("checkout");
        let checkout_path = checkout.to_str().expect("checkout path");

        clone_repo_at_branch(&fixture.remote_path, checkout_path, Some("main"), &auth)
            .expect("clone main");

        ensure_worktree_on_branch(&checkout, &auth, "main").expect("stay on main");

        assert_eq!(
            run_git(&["branch", "--show-current"], Some(&checkout), &auth)
                .expect("read checked-out branch")
                .trim(),
            "main"
        );
    }

    #[test]
    fn ensure_worktree_on_branch_does_not_discard_conflicting_uncommitted_changes() {
        let auth = build_test_git_auth_config().expect("build test git config");
        let fixture = seed_remote_with_two_branches();
        let checkout_root = tempfile::tempdir().expect("create checkout directory");
        let checkout = checkout_root.path().join("checkout");
        let checkout_path = checkout.to_str().expect("checkout path");

        clone_repo_at_branch(&fixture.remote_path, checkout_path, Some("main"), &auth)
            .expect("clone main");
        // Dirty README.md in a way that conflicts with `feature`'s own
        // history (both branches diverge on tracked files vs. this
        // uncommitted edit), so a plain `git checkout` must refuse to
        // switch rather than overwrite it.
        std::fs::write(checkout.join("README.md"), "uncommitted local edit\n")
            .expect("dirty the working tree");

        let result = ensure_worktree_on_branch(&checkout, &auth, "feature");

        assert!(result.is_err(), "checkout must refuse to discard the edit");
        assert_eq!(
            std::fs::read_to_string(checkout.join("README.md")).expect("read README"),
            "uncommitted local edit\n",
            "the uncommitted edit must survive the failed switch"
        );
        assert_eq!(
            run_git(&["branch", "--show-current"], Some(&checkout), &auth)
                .expect("read checked-out branch")
                .trim(),
            "main",
            "the working tree must stay on its original branch"
        );
    }

    #[test]
    fn ensure_worktree_on_branch_errors_when_the_branch_exists_nowhere() {
        let auth = build_test_git_auth_config().expect("build test git config");
        let fixture = seed_remote_with_two_branches();
        let checkout_root = tempfile::tempdir().expect("create checkout directory");
        let checkout = checkout_root.path().join("checkout");
        let checkout_path = checkout.to_str().expect("checkout path");

        clone_repo_at_branch(&fixture.remote_path, checkout_path, Some("main"), &auth)
            .expect("clone main");

        let error = ensure_worktree_on_branch(&checkout, &auth, "does-not-exist")
            .expect_err("branch exists neither locally nor on the remote");
        assert!(
            error.contains("does-not-exist"),
            "error should name the missing branch, got: {error}"
        );
    }
}
