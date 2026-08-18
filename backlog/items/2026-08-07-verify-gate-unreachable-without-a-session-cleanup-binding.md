---
schema: pipeline.backlog-item.v1
id: pipeline.verify-gate-unreachable-without-a-session-cleanup-binding
type: defect
owner: pipeline
status: closed
created: 2026-08-07
source: Elephant diagnosis while dispositioning Critic finding F1 on PHX-R2-THREATMODEL-rework (2026-08-07). The symptom was already recorded in docs/state.md as an unexplained infra gap; this item records the measured cause.
due: 2026-09-06
---

# The verify gate aborts at its first step whenever the session has no cleanup binding

## Description

`node harness/scripts/verify.mjs` — the project's single configured verify entry
point (`.claude/pipeline.json:4`, QG-02) — **cannot be run at all in this
session**, in either checkout topology. Measured, not inferred:

- **Primary checkout:** stops at `VERIFY-CANDIDATE-PREFLIGHT` ("Commit or stash
  tracked changes before Verify; no suite was started"). `.claude/settings.json`
  is a tracked file that is permanently modified in this working copy, so the
  preflight can never be clean here.
- **Detached worktree at the exact candidate commit** (the documented workaround
  for the above): stops at the **first** step, `verify-journal`, with
  `VERIFY-CLEANUP-REGISTRATION-REQUIRED`. **Zero suites run.**

The cause is `plugins/pipeline-core/scripts/verify-journal.mjs:163-169`:

```js
function registerBoundVerifyRun({ repoRoot, runId, runPath }) {
  let binding;
  try { binding = readOnboardingSessionCleanupBinding({ rootDir: repoRoot }); }
  catch { throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED"); }
  if (binding.status !== "bound" || binding.sessionCleanup === null) {
    throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED");
  }
```

`runVerifyJournal` takes this automatic path whenever no `registerRun` callback
is supplied (`:398`), which is the ordinary CLI path. So a verify run requires a
**bound onboarding session cleanup**, and this session does not have one: its
own validated continuity projection reports `"runtime": { …,
"sessionCleanup": null }`.

## Why this matters beyond one dispatch

QG-01 states that verify and its evidence are invariant on all rigor levels —
"there is no path around the deterministic gates, not even for one-line fixes".
In practice every dispatch in this session has substituted one or two
hand-picked checker scripts for the gate, and a Critic correctly recorded that
as a major finding (`specs/sprint-phoenix-epic/evidence/phx-r2-threatmodel-rework-critic-review-ad5d185.md`,
F1). The finding is right about the evidence contract, but no dispatch could
have satisfied it: the gate is unreachable, not skipped.

That distinction is the reason this item exists. Left unrecorded, the same
finding will recur against every future dispatch, each one will be told to run
the gate, each one will fail for a reason none of them can fix, and the honest
conclusion — "the gate is broken for this session" — will keep being
rediscovered instead of repaired.

**The evidence-artifact contract itself is not the defect.** The aborted
worktree run still wrote a correct `pipeline.verify-evidence.v0` artifact with
`commit`, `tree`, `candidate.start`/`candidate.finish` both `clean`, and
`"binding": "exact"`. Whatever is wrong, it is upstream of the artifact writer.

## Triggering situation

2026-08-07. Attempting to answer Critic finding F1 by actually running the gate
rather than dispositioning it in prose. The failure at
`VERIFY-CLEANUP-REGISTRATION-REQUIRED` in a plain checkout had already been
recorded in `docs/state.md` as a known gap; what was missing was the reason,
which this item supplies.

## Affected artifact

`plugins/pipeline-core/scripts/verify-journal.mjs` (`registerBoundVerifyRun` at
`:163-183`, its call site at `:398-401`), the onboarding session-cleanup binding
it reads, and `harness/scripts/verify.mjs` as the entry point that surfaces the
abort. Also `.claude/settings.json`, whose permanent dirtiness independently
closes the primary-checkout preflight.

## Proposal

**Owner: PO.** Two independent blockers; both must clear before the gate is
usable, and they are worth separating because the fixes are unrelated.

1. **The session-cleanup binding.** Establish why this session has
   `sessionCleanup: null` — whether the binding is supposed to be created during
   the ordinary bootstrap and is not, whether it is created but not readable
   from a detached worktree (note `readOnboardingSessionCleanupBinding` is
   called with `rootDir: repoRoot`, which in a worktree is the worktree, not the
   primary checkout), or whether a session legitimately may have none and the
   requirement is too strict. These have different fixes and the difference is
   not guessable from the code alone — it needs one observation of a session
   that *does* have a binding.
2. **The permanently dirty tracked config.** `.claude/settings.json` being both
   tracked and locally modified makes the primary-checkout preflight
   structurally unsatisfiable. Either the local modification belongs in the
   commit, or the file should not be tracked, or the preflight should exclude a
   declared set of local-state paths. This is a small decision with a large
   effect: it is what forces the worktree detour in the first place.

Do not "fix" this by weakening the preflight or the registration check. Both
exist to make a verify run bindable to an exact candidate and cleanable
afterwards; a gate that runs but proves nothing is worse than one that refuses.

Until it is repaired, dispatches should **disclose that the gate is unreachable
and why**, and name the specific checker scripts they ran instead — rather than
presenting a subset as if it were the gate. That is a reporting rule, not a
substitute for the fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Close. Both blockers Proposal items 1 and 2 asked about have
  been answered, not by weakening the preflight/registration check (the thing
  this item explicitly asked not to do), but by establishing and routinely
  using the detached-worktree procedure the item itself named as the
  "documented workaround": run Layers 2/3 (Verify, security-scan) against a
  clean detached worktree checked out at the exact candidate commit, which
  gets its own bound session-cleanup independent of the primary checkout's
  permanently-dirty tracked config, then copy the evidence artifacts back.
- **Rationale:** Item 1 (why does a session have `sessionCleanup: null`, and
  is that fixable or a legitimate state) is answered: an ad hoc primary-tree
  session legitimately has no binding — the fix was never "give every session
  one," it was "run verify from a session/worktree that does." `docs/state.md`
  records multiple full, completed Verify runs via exactly this route reaching
  382/383 suites green (commits `d202633c` and `334f7cf7`), proving the gate
  is reachable and the evidence-artifact contract this item already vouched
  for (`binding: "exact"`) holds end to end, not just up to the abort. Item 2
  (`.claude/settings.json` permanently dirty) is resolved the same way: the
  primary checkout is allowed to stay dirty by design (3 local-state files,
  documented convention), and the preflight is satisfied by running against
  the clean detached worktree instead of by excluding paths from the check —
  exactly the "small decision with a large effect" the item asked for, just
  decided as "use a worktree" rather than "carve an exception into the
  preflight." Re-verified today (2026-08-18) rather than assumed:
  `git status --porcelain -- .claude/settings.json` is empty in the primary
  checkout right now. The one remaining Full-Verify red (`guard-testpath-
  override-tests`, OT09/TP-7, tracked separately in `docs/state.md`) is an
  unrelated, already-tracked defect in one suite's own logic, not a
  reachability problem — it is exactly the kind of specific, nameable failure
  this item's "the gate is unreachable, not skipped" distinction was trying to
  make visible, and now it is.
- **Assignment (if accepted):** none — resolved by established procedure, no
  code change needed under this item.
- **Date:** 2026-08-18
