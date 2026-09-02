---
schema: pipeline.backlog-item.v1
id: pipeline.a-tree-snapshot-races-gits-own-background-maintenance-lock
type: defect
owner: pipeline
status: open
created: 2026-09-02
source: "GitHub Actions run 33595311782 (push to main, commit 6262d408), job verify, suite codex-onboarding-capabilities-tests, test 12"
sprint: nova-b
---

# A test's tree snapshot races git's own background maintenance lock, and reports it as leftover bytes

## Description

`codex-onboarding-capabilities-tests` exited 1 in CI run `33595311782`. One of its 23 tests failed —
`root and Git-control write probes map to distinct closed statuses and leave no bytes` — and it failed
inside the test's own snapshot helper rather than in any assertion about the code under test:

```
ENOENT: no such file or directory, lstat
  '/tmp/codex onboarding capabilities control read only with spaces-Xj1jxt/.git/objects/maintenance.lock'
  at visit  (plugins/pipeline-core/lib/codex-onboarding-capabilities.test.mjs:94:20)
  at treeSnapshot (…:103:3)
  at TestContext.<anonymous> (…:501:25)
```

This closes a question the earlier item
`pipeline.three-onboarding-suites-pass-locally-and-fail-in-ci` left open. That item recorded this suite
as "intermittent, cause not identified", because the CI reporter kept only a log tail and the failing
assertion fell into the omitted head. Commit `e066a1b7` fixed the reporter; this is the first red run
since, and it named the failure exactly as intended. The candidate cause filed alongside it
(`pipeline.inode-identity-decides-deletion-in-a-second-rollback-path`) is **not** the cause here and
should not be closed on the strength of this item.

## Triggering situation

`treeSnapshot(root)` (line 88) walks a directory with `readdirSync`, then calls `lstatSync` on each name
it saw:

```js
function visit(directory) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const rel = relative(root, path);
    const info = lstatSync(path);          // ← line 94
    …
  }
}
```

Between the `readdirSync` and the `lstatSync`, git's own background maintenance created and removed
`.git/objects/maintenance.lock` in the fixture repository. The entry existed when the directory was
listed and was gone when it was stat'ed. Nothing about the code under test is involved.

The intermittency is fully explained by this shape: the window is a few microseconds wide and depends on
whether git's auto-maintenance happens to fire during the walk, which is why the suite is red in one CI
run and green in a re-run of the identical commit, and green locally under an ordinary `PATH`, the
synthetic `PATH`, tmpfs and ext4 alike.

## Affected artifact

- `plugins/pipeline-core/lib/codex-onboarding-capabilities.test.mjs`, `treeSnapshot` (lines 88–105),
  used by the before/after comparison at line 501

## Proposal

Two defects hide behind one symptom, and fixing only the visible one leaves the suite flaky.

1. **The crash.** `lstatSync` must tolerate a vanished entry: catch `ENOENT` (and `ENOTDIR`) and skip the
   row rather than throwing. A file that disappeared during the walk is, for the purposes of "leave no
   bytes", a file that is not there.

2. **The comparison, which the crash currently masks.** This helper exists to compare a snapshot taken
   before an operation with one taken after. Even with the crash fixed, a transient lock file that
   appears in exactly one of the two snapshots makes the two differ, and the test fails with a confusing
   "leftover bytes" message instead of a stack trace. The snapshot must therefore also exclude git's own
   transient control files. Scope that exclusion narrowly and by name — `*.lock` directly under
   `.git/` and `.git/objects/` is the observed shape — rather than excluding `.git/` wholesale, since
   the assertion that a probe leaves no bytes inside the Git control directory is part of what this test
   is for.

Both changes belong to the test helper. Nothing in the product changes.

Worth checking in the same pass: whether any other suite in this repository builds a before/after
filesystem snapshot the same way over a live Git repository. If so it carries the identical latent race
and should be fixed together, not one red CI run at a time.

## Acceptance

1. `treeSnapshot` no longer throws when an entry disappears between `readdirSync` and `lstatSync`, with a
   regression test that injects exactly that race rather than relying on git's timing.
2. A transient `.git` lock file present in one snapshot and absent in the other no longer makes the
   before/after comparison fail, with a test covering it.
3. The suite reports `=0` in an actual CI run.
4. The sweep for other snapshot helpers with the same shape is done or explicitly deferred with a reason.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
