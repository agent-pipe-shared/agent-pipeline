# w258: an Antigravity native Goldfish runs isolated in its own branch worktree, in parallel, and the Elephant takes its result over (candidate 20, G20-8 B follow-up of w255, AC-108)

Base: `a3e4ddb89` (the candidate-20 chain incl. w255). Built in the slice clone `scratch/agent-out/s-agyiso`. One held patch, three commits in
the clone (red pins, implementation, reference). Closest criterion: AC-108 (PRD and Spec unchanged). The measured facts that bind this patch
are the PO-run M4b findings (`scratch/agy-m4b-findings.md`, outside the repository's tracked tree); they supersede the M-items of the w255
notes below.

## M-items of w255, restated to the measured facts

| w255 item | Status after M4b |
|---|---|
| M4b: `Workspace` `branch`/`share` in a git workspace | MEASURED: both create a real git worktree of the same repository below `<home>/.gemini/antigravity-cli/worktrees/<parentId>/subagent-<...>` on a new branch cut from the parent's COMMITTED HEAD; uncommitted parent changes are not in it; a child's commit lands at once in the shared object database; nothing is merged back; two writers in parallel did not conflict. Used: `branch`. |
| descriptor state a finished child carries | MEASURED: stays `SUBAGENT_STATE_ALIVE`. The alive-count rule is removed. |
| child hook payload | MEASURED: `workspacePaths` = `[worktree, parent repository]`. Used for the governance resolution. |
| exact spelling of `modelName` (M10) | NOT measured; the w255 model check is kept as it was. |
| descriptor state of a killed or failed child (M11), descriptor timing (M12), a hook at a child's end (M14) | NOT measured, not assumed. |
| one or two hook firings per child tool call with a Pipeline (global) hook install | NOT measured (the probe repository carried hooks in both workspaces). The guard is idempotent per call, so a double firing would only repeat verdicts. |

## What

- `lib/agy-native-goldfish.mjs`
  - `evaluateNativeGoldfishParentCall`: every code writer (`goldfish-implementor|mechanic|deep`) must carry `Workspace: "branch"`
    (`AGY-NATIVE-WORKSPACE-NOT-ISOLATED`, repair names the value; absent, `inherit` and `share` are refused). Several writers per call and
    several calls in parallel are admitted. Removed: `AGY_NATIVE_SERIALIZE_CODE_WRITERS`, `AGY-NATIVE-CODE-WRITER-ONE-PER-CALL`,
    `AGY-NATIVE-CODE-WRITER-ALIVE`, `AGY-NATIVE-WORKSPACE-UNMEASURED`, `AGY-NATIVE-PARENT-UNIDENTIFIED` (it existed only to count children).
    Added: `AGY-NATIVE-WORKTREE-UNCOMMITTED` (refuse, repair "commit first") when `git status --porcelain --untracked-files=no` in the parent
    workspace lists tracked changes, because the worktree starts at the committed HEAD.
  - `nativeBrainWriteRefusal`: protects only the host-owned parts (`brain/`, `config/`, `.system_generated/`, anything else below
    `antigravity-cli/` except `worktrees/`). A path is normalized first (`worktrees/../brain/..` lands in `brain/` and is refused; backslash
    spellings are covered); free command text that climbs (`..`) near the host directory is refused.
  - `resolveNativeChildGovernance(input)`: `governed` only when `workspacePaths[0]` is a REGISTERED worktree of exactly one repository: its `.git`
    file points into `<repo>/.git/worktrees/<name>`, that administrative directory's `gitdir` points back at this very worktree (what
    `git worktree list` reads), and a second `workspacePaths` entry, when present, is that repository. A worktree-shaped directory that fails
    this is `unregistered` (a forged `.git` file, a worktree of another repository, a mismatched pair); a plain directory or a submodule `.git`
    file is `not-worktree`. No `git` process is spawned for this.
  - `nativeChildWriteRefusal` (`AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE`): a governed child's `Edit`/`Write` target and `run_command` `Cwd` must
    be inside its own worktree (physical path, symlinks resolved, relative paths resolve there).
  - `projectNativeChildInput`: a copy of the payload with every absolute path below the worktree mapped to the same relative path in the
    repository and the repository first in `workspacePaths`.
- `hooks/antigravity-pretool-guard.mjs`: before the governance admission, a `governed` child is confined and then judged as the repository
  (projected payload); `unregistered` is refused (`AGY-NATIVE-WORKTREE-UNREGISTERED`, repair: kill the child, dispatch again with `Workspace:
  "branch"`). Measured with the OLD adapter on a real worktree fixture: a child in its worktree was allowed everything, including
  `git push origin main`, because the worktree is outside the project and carries no governance marker; the new pin case replays that.
- `scripts/agy-native-integrate.mjs` (new) + `lib/guard/constants.mjs` (`AGY_NATIVE_INTEGRATE_SCRIPT`) + `lib/guard/command-catalogue.mjs`
  (`sanctionedAgyNativeIntegrateArgs`): the Elephant's take-over. `plan --root --branch subagent-<...> --allowed-path <p>...` is read-only;
  `apply` with `--expect-sha256 <plan digest>` writes the branch's NET change (merge base to tip, binary-safe) into the working tree only,
  uncommitted and unstaged, via `git apply` (all-or-nothing, so a refusal leaves no state). It refuses: a branch that is not `subagent-*` or
  unknown, no `--allowed-path`, a changed path outside the briefed scope, a path with local changes, merge commits or no commits, a change that
  no longer applies (`AGYI-*`, each with a repair), and a moved HEAD/branch between plan and apply. The commit is the EXISTING recovery route
  (`goldfish-host-commit-recover.mjs plan|apply`), which the pin runs against the result. The guard admits exactly that argv (no raw
  cherry-pick, merge or checkout is admitted anywhere).
- `references/antigravity-native-dispatch.md`: serialization paragraph replaced by isolation, governance and integration; the unmeasured items
  listed.
- Pins (`antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs`, 3 cases restated in place with an M4b
  comment, 7 added, 12/12; 10 of the 12 RED against the original code first, the other 2 unchanged): restated: the flat-call case now dispatches with `Workspace: "branch"`
  (a quoted Workspace is decoded), the serialization case became the isolation case (the same inputs, the opposite verdicts, as measured),
  the brain-write case gained the `worktrees/` allowance and the traversal/Windows refusals. Added: uncommitted-parent refusal, registered
  versus forged/foreign/mismatched worktrees (real `git worktree` fixtures), confinement and projection, the adapter governing a child (push
  denied like the parent's, write into the parent tree refused by name, write in own worktree not a brain write, unregistered refused),
  take-over plan/apply with the recovery plan, take-over refusals, guard admission of the exact argv.

## Why

M4b measured that `branch` isolation works and exposed two defects in w255 (finished children stay ALIVE, so the alive rule would refuse every
later writer; the brain-write pattern covered `worktrees/`, so a child could not write its own worktree). The worktree is outside the project,
so a child there was ungoverned. The integration route had to exist because nothing is merged back, and it had to be a closed grammar the
guard can admit: a single plan/apply script whose output feeds the recovery route already admitted for host commits.

## Not changed

- `hooks/hook-governance-admission.mjs`, `hooks/native-goldfish-host.mjs`, `lib/path-spelling.mjs`, the separator-sweep sites, the model check
  (M10), the registry. The governance lever is the call site in the Antigravity adapter (inside the permitted surfaces).
- Untracked files of the parent are not part of the commit-first check (a briefing that depends on one fails visibly in the child; a modified
  tracked file would be silently stale, which is what the check prevents).
- The worktree and branch the host created are left to the host (no removal here).
- The w255 notes themselves (outside this patch's write scope): the table above restates their M-items.
- Nothing registered in `harness/verify-suites.json` or the inventory; no new test file (the cases extend the registered pin).

## Not proven

Full Verify of the applied chain, Critic review, PO acceptance, any run on a real Antigravity host after this change, Windows/macOS execution.
Specific risks the fixtures cannot show:

- The union guards run with the repository as root and a projected payload; the git-state-sensitive command guards (for example the commit
  guard) therefore read the REPOSITORY's index, not the child's worktree index. Which verdict a child's own `git commit` gets in a real session
  is not measured; if the commit guard refuses it, the child leaves the result uncommitted in its worktree and the take-over needs a commit
  there first. This needs one measured run.
- Lifecycle readiness is keyed by the hook's session identity; a child has its own conversation id. Whether a child inherits the parent's
  readiness is not changed by this patch and not measured here.
- Reads of a governed child are judged at the mapped project path too (a pin reads and lists a file that exists only in the worktree and is
  admitted; it passes with and without a read special case, so none was added). `view_file` operands are `AbsolutePath`/`file_path`.
- `AGY-NATIVE-WORKTREE-UNREGISTERED` fires before the governance scope is known: in an ungoverned Antigravity project a worktree moved without
  `git worktree repair` is refused too (the repair is named in the message).
- The long guard suite (`antigravity-pretool-guard.test.mjs`, 1 top-level test) ran green on the clone at commit 40a12ce9; the one
  later clone commit changed only a pin case and a comment in `projectNativeChildInput` (no executed code). The pin was re-run on the final code.
- A child's shell command text that names an absolute path in the project tree (not its `Cwd`, not an Edit/Write target) is not confined.
- `git status` in the parent workspace is the only check of "committed HEAD"; if git cannot answer, the check passes.
- A `..` in free command text that also names the host directory is refused conservatively, which can refuse a legitimate relative `cd`.

## Needs the Coordinator

- Apply the chain in order (this patch follows w255), run the final Verify, and a measured Antigravity run (one branch child that commits,
  then `agy-native-integrate.mjs plan|apply`, then the recovery commit) to settle the commit-guard question above.
- The w255 notes' M-items may be replaced by the table above in the chain's integrated notes.
