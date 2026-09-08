# CI editor-path re-verification — 2026-09-08

The workflow allowlists exactly node, git, bash, sh and openssl. That fact
alone does not establish the reported true defect: the existing lifecycle
test supplies a private executable shim for the exact continuation it exercises.

The source confirms rbTrueShimDir() writes an executable true with the
absolute running Node binary as interpreter. The rebwire req5-2 test prepends
only that owned directory to the continuation subprocess PATH. Its command
remains the guard's published git -c core.editor=true rebase --continue.

Re-verification ran that existing test under a locally constructed PATH with
exactly the five workflow tools. A preceding bare true spawn returned ENOENT,
establishing that the host PATH could not supply the missing editor. The test
passed, including completion of the real rebase in its disposable fixture.
The containing source repository was not rebased.

Machine capture: scratch/ci-true-shim-recheck-20260908.txt, exit 0, one existing
test executed. Driver: scratch/ci-true-shim-recheck-20260908.mjs. Examined source
commit: 0ac576416cb00bf9917d7634bf2a63cb6c3d5120; the workflow and lifecycle
test were unmodified during the run.

This corroborates the item's September 4 Route 2 triage and contradicts the
September 7 inference that an absent workflow symlink proves the code defect
remains. The current predicate names Route 1, despite the documented choice
and implementation of Route 2. It cannot measure the remaining actual CI-run
acceptance criterion. This reproduction supplies no reason to widen the
workflow allowlist.

The item remains open for its explicitly required actual CI evidence. No
GitHub Actions job was started or observed, no push or workflow change was
made, and local PATH-equivalent execution is not an actual CI run. The earlier
broader sweep retains its stated static-analysis limits.
