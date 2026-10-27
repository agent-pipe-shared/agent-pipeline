# W7 G9b: pin that an older runner view keeps its bytes across a normal second refresh (test-only)

Candidate 4abb332db07310f185de2cc96aec2362c550d696. Work done in scratch `git clone --shared` clones at the candidate (clone, clone2); the repository tree was not edited. Patch: `w7-g9b-view-byte-pin.patch` (git diff --binary against the candidate, one file, +21 lines).

## Cause

The recon gap (re-verified: the existing continuity cases at the pin file compare directory names and `removed`, not bytes) means nothing pinned that the older Antigravity runner view keeps its content when a second refresh installs a new content-addressed view. `refreshAntigravityGlobalFromRunnerView` (install-agy.mjs) calls `pruneRunnerViewsAfterInstall`, which only reports `AGV-PRUNE-LIVENESS-UNOBSERVABLE` and removes nothing; this slice pins the byte consequence.

## Changed lines

Only `plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs`: one new case inserted before `bounded storage: a view nothing references any more is removed...`:
`runner continuity: after a normal second refresh the older view keeps every byte it was installed with, and the second view is a different content-addressed directory`. It reuses `storageWorld`, `installView`, `fakeCli`, `reviseSource`, `files` (existing fixtures): reads every file of the first view (Buffer), runs a second refresh after a source revision, asserts the second view sha differs and its directory exists, the older directory exists, holds exactly the same file names, and each file is byte-identical (`Buffer.compare`). No production edit, no new file, no existing case changed.

## Evidence (logs in scratch/agent-out/w7w/, untracked)

- GREEN at once (pins existing behaviour): clone, whole file, exit 0, tests 35, pass 35, fail 0 (log `green.*`, repeated after mutation revert as `green2.*`).
- RED proof: clone mutated once (`pruneRunnerViewsAfterInstall` removed every sibling `view-*` directory) gave exit 1; the new case failed (assertion `existsSync(oldRoot)` actual false, expected true), as did the two existing continuity cases that also need the older view (log `red.*`). Mutation then reverted fully; `git diff --stat` against the candidate shows only the test file.
- Baseline (clone2, unchanged candidate): exit 0, tests 34, pass 34, fail 0. Failing-name sets: baseline empty, patched empty (identical; the only difference is the 1 added passing case, 34 to 35).
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.
- The reporter is not TAP; counts read from the printed tail.

## NOT done (open, need a Spec decision)

- Slice B: the explicit digest-list prune route.
- Propagation of a throwing injected prune in install-agy.mjs (line 275 calls the injected prune without try/catch; the AGV-PRUNE-UNAVAILABLE catch exists only in the default prune).
- Hook cwd, managed-copy survival and per-view liveness are native-host-only and cannot be pinned here.
- An unreadable-registry case (AGV-PRUNE-UNCERTAIN) remains unreachable (host refuses first), see `w7-g9b-view-pins.notes.md`.

## Proposed commit message

`test(pipeline): pin older runner view bytes across a normal second refresh`

## Operator flow

Apply the diff (`git apply` the patch), `git add -u` with a path limit to the pin test file, `--no-verify` commit, stamp, install.

## Protected-path classification observed

The pin test file matches none of TP-1..TP-13; no protected path is touched.

## Review

An independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance are pending. Targeted delivery: green.
