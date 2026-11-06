# C19I-W241-SPAWNS: fewer git and PowerShell process starts, every answer unchanged

Slice C19I-W241-SPAWNS, closest accepted criterion AC-108 (Spec and PRD unchanged). Held patch:
`w241-custody-inspection-and-private-state-checks-spawn-git-and-powershell-once-per-unchanged-object.patch`, developed in the
shared clone at 79899694d (candidate 19h applied), four commits, `apply --check` against the repository: exit 0.
Touches only `plugins/pipeline-core/lib/`.

## Found (from the 19h CPU profile of one warm Windows dispatch)

| Path | Starts in the profile | What starts them |
|---|---|---|
| guard-dispatch, git via `runGit` (`worktree-lifecycle.mjs`) | at least 853, 29.7 s | `inspectSignedDescriptorCustodyRepository` -> `custodyCandidate` (`git rev-parse HEAD HEAD^{tree}` on every inspection) and `custodyTopology` -> `discoverRepository` (three git starts), memoized only inside one registry boundary |
| guard-dispatch, git via `defaultGitSpawn` (`onboarding-continuity.mjs`) | at least 85, 3.4 s | `git rev-parse --path-format=absolute --git-common-dir`, asked twice per private-state resolution (`resolveOnboardingPrivateState` -> `readGitCommonDirectory`) |
| guard-dispatch, private-state ACL batch (`prefetchPrivateTree`) | at least 32, 13.1 s | one PowerShell start per object outside the first 128-entry window of a `.git/agent-pipeline` tree, and again for entries the 256-entry memo had evicted |
| SubagentStop | git at least 1398 (`runGit` at least 1233), private-state 13.8 s | same sites |
| PostToolUse | private-state 12.0 s | same site |

## What it changes

1. `custodyCandidate` resolves HEAD from the files git itself reads (HEAD, the loose branch ref, `packed-refs`) on EVERY inspection
   and keeps a per-process (common directory, commit) -> tree map. Git starts only when the resolved commit is new, and then runs
   the unchanged `rev-parse HEAD HEAD^{tree}` and takes BOTH values from it. Falls over to the original git calls for: a
   `reftable` directory, a `refs/replace` directory, any `refs/replace/` entry in `packed-refs`, a symlinked or non-regular HEAD or
   ref, a symbolic ref chain, a branch name outside a plain safe set, a ref in neither place (unborn), a malformed or unreadable
   file, a `packed-refs` that moved while it was read.
2. `custodyTopology` keeps the repository topology for the process (it was one boundary entry), keyed by physical start and
   `GIT_CEILING_DIRECTORIES`. Each use re-validates, as before, that the common directory and the primary root are the physical
   directories observed, and additionally compares a witness: the identity (device, inode, type) of the directory, its `.git`
   and its `HEAD` for every directory from the start up to the primary root. `withCustodyTopologyScope` stays as the
   registry's entry point and is now a pass-through.
3. `prefetchPrivateTree`: the first miss of a private-tree root observes the first window as before. When that window left
   entries out of an unchanged root, the NEXT miss of the same root observes the rest of the tree once (up to 512 entries,
   6 levels, in native chunks of 256) instead of one start per object outside the window. The per-root record is dropped when
   the root's identity changes and by `hardenWindowsPrivateDirectory` (this module's own DACL write); the memo limit rose from
   256 to 1024 entries so a wide tree is not evicted again. Row validation, the identity re-check before memoizing, the
   single-path fallback and `fresh: true` are untouched.
4. `defaultGitSpawn` replays only `git rev-parse --path-format=absolute --git-common-dir` (exact argv, `cwd` given, no `env`)
   while the root's physical path and the identity (device, inode, owner) of the root, its `.git` DIRECTORY and that directory's
   `HEAD` are unchanged, no `commondir` redirect exists, and neither a discovery-redirecting nor a changed discovery-tuning GIT_*
   variable is set. The other git questions this module asks (`git show <commit>:<path>`, `git config --get user.email`,
   `git check-ignore`) are not provably stable and keep the real spawn.

## Why every answer is unchanged

- HEAD and the tree: the commit is read from the same files git reads, on every call, so a commit, reset, `pack-refs`, detach or
  `update-ref` made in this process is visible to the very next inspection. A commit's tree never changes, so the map cannot go
  stale, except through a replace ref, which turns the whole file path off (checked on every call, loose and packed).
- Topology: a replaced or vanished directory, a changed identity anywhere between the start and the primary root (a nested
  repository created below a memoized start) or a different ceiling drops the memo and takes the full rediscovery, which throws
  as before.
- ACL batch: every memoized row still comes from a native observation with an unchanged lstat identity before and after; the
  wide pass only observes objects earlier than the old code would have. The accepted memo semantics are untouched (identity
  key, `fresh: true` bypass, no memo for an injected `run`/`environment`, no caching of failures).
- Common directory: replayed text is git's own earlier stdout for the same unchanged `.git` directory; any doubt takes the spawn.

## Checks (run in the clone, one suite at a time)

- `plugins/pipeline-core/lib/custody-inspection-spawns.test.mjs`: 13/13. RED on the original, run before the first production
  edit: W241-01, -02 (git-start expectations), -05, -08; the other cases are equivalence guards that also pass on the original.
  W241-13 (step 4) was written AFTER its production change, not before: its "before" count of 2 starts per resolution comes from
  a probe of the original code, not from a RED run.
- `plugins/pipeline-core/lib/worktree-lifecycle.test.mjs`: exit 0 (D91-01 restated in place, see below).
- `plugins/pipeline-core/lib/windows-private-state.test.mjs` and `windows-private-state-observation-memo.test.mjs`: exit 0 (15
  Windows-only cases skip on Linux).
- `plugins/pipeline-core/lib/onboarding-continuity.test.mjs`: 327/327.
- `node --test` of the `.check.test.mjs`: 2/2.

Start counts, measured by the cases through the `spawnSync` seam (Linux, fake fixed PowerShell for the Windows branch):

| Path | Before | After |
|---|---|---|
| five custody inspections, HEAD unchanged | 20 git starts (4 each) | 0 |
| inspection after a new commit | 4 | 1 |
| revisit of a commit seen earlier (reset) | 4 | 0 |
| two identical `--git-common-dir` questions in one resolution | 2 | 1 cold, 0 warm |
| 300 objects of one private tree, each assessed | 175 PowerShell starts | at most 4 (3 by construction: one first window, two chunks of the wide pass); 0 on the second pass |

Restated existing case (QG-04, extended not weakened): D91-01 in `worktree-lifecycle.test.mjs` asserted the old counts
(three discoveries outside a scope, HEAD read from git on every inspection, nothing remembered after a scope). Those counts are
exactly what the briefing removes; the case now asserts the new counts (one discovery, zero starts for an unchanged HEAD, inside
a scope, a nested scope and outside) and keeps the equality of every returned binding. D91-02 (a commit inside a scope is visible
to the next inspection) and D91-03 (a vanished repository is refused) pass unchanged.

## New case ids (the Elephant registers them; none is registered by this patch)

Test file `plugins/pipeline-core/lib/custody-inspection-spawns.test.mjs` (node:test): W241-01 to W241-13, listed by name in the file.
This is a new file and needs registration in the Verify suite list. Restated in place: D91-01 in
`plugins/pipeline-core/lib/worktree-lifecycle.test.mjs`.

## Not changed, not proven

- No Windows run. The Windows branch is exercised on Linux through a fake fixed PowerShell (a file with the literal system path in
  a temporary working directory plus the `spawnSync` wrapper); real DACL behaviour, real NTFS inode reuse and real timing are
  unmeasured. The wide pass is a structural reduction (objects outside the first window, evicted entries), not a measured one:
  the profile gives the start count, not the object ages, so starts caused by objects whose identity changes (an atomic
  rewrite creates a new inode) are NOT reduced; they need a native observation by design.
- `assessWindowsPrivatePaths` (git-hook-runtime-snapshot callers) is untouched: it has no memo today and its callers are fresh
  security checks of hook files.
- Tree map hit assumes the commit object still exists; a HEAD manually set to a commit that was pruned after being seen would
  be answered where git would fail (needs deleting a reachable-then-pruned object and re-pointing HEAD at it by hand).
- `git show`, `git config`, `git check-ignore` in `onboarding-continuity.mjs` and every other `runGit` caller (worktree list,
  `status`, `symbolic-ref`) are unchanged.
- Other `runGit` starts in the profile (853 minus the custody inspections) are not attributed beyond the custody path; whatever
  remains after this patch needs a fresh profile.
