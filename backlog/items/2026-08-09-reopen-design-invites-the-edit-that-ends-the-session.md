---
schema: pipeline.backlog-item.v1
id: pipeline.reopen-design-invites-the-edit-that-ends-the-session
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Observed live in the PO's greenfield happy-path test of the 0.5.4 local candidate (Claude runner) on 2026-08-09, and reproduced at that moment with the Pipeline's own read-only inspection. The PO's report was 'claude hat sich wieder selber deadlocked'."
due: 2026-08-12
---

# `reopen-design` opens the design for editing, and the first edit ends the session

## What happens

`reopen-design` exists so a submitted plan can be worked on again. It sets the
phase back to `design`, clears `planApproved`, and records a `planInvalidation`.
It does **not** touch `continuity.authority`, which still carries the digests of
the PRD and spec as they were at submission time
(`plugins/pipeline-core/lib/plan-spec-state-v2.mjs:644-654` — the returned state
spreads `state` and reassigns only `activeFeature`, `planApproved` and
`planInvalidation`).

The agent then edits `spec.md`, which is the one action reopening the design
exists to enable. The spec's bytes no longer match
`continuity.authority.spec.sha256`, the continuity observation stops returning
`valid`, and the session loses readiness with no agent-executable exit.

## Observed, not reconstructed

Caught in the PO's live run at 07:48Z. `project/pipeline-state.json` recorded
`continuity.authority.spec.sha256 = 1eef6d57…` while `spec.md` on disk hashed to
`01042726…`. The Pipeline's own read-only inspection, run against that
repository at that moment:

```json
{
  "status": "continuity-observation-unavailable",
  "continuity": { "status": "unavailable", … },
  "nextAction": null,
  "diagnostics": [{
    "code": "continuity_observation_unavailable",
    "message": "continuity authority could not be observed safely",
    "guidance": "repair continuity read access before retrying"
  }]
}
```

Exit 1, `nextAction: null`. Six minutes later the same command returned `ready`,
and `spec.md` hashed to `1eef6d57…` again — the pre-edit value. The escape was to
put the old bytes back. On a greenfield repository with no commits there is no
`git restore` to do that with; it worked because the previous content was still
in the session.

## Three things make it a trap rather than a strict gate

**1. The refusal has no route.** `project-onboarding-v3.mjs:1908-1925` treats
`continuity.status !== "valid"` as a catch-all: no `nextAction`, and a guidance
line that names a cause — read access — which it never established. The
neighbouring `damaged` branch (`:1889`) does return a typed
`continuityRepairPlanAction`. Digest drift is not read failure and not damage; it
falls into the bucket that has neither.

**2. The rebind observation is never reached.** `observePoAuthorityRebind` is
called at `:1926`, after the unavailable branch has already returned. The one
mechanism that exists for "the authority digests no longer match the files" is
below the line that makes the session unable to act.

**3. Repairing it by hand needs two edits that invalidate each other.** The
PRD carries `<!-- technical-spec-sha256: 1eef6d57… -->`, so a genuinely changed
spec also needs the PRD's marker updated — and that changes the PRD's own digest,
which `continuity.authority.prd.sha256` binds. This is the same two-document
byte-binding that produced the 2026-08-08 kickoff deadlock
(`2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md`), reached
through a different door: that one was pre-approval, this one is post-submission.

## Why it survived the fixes that were aimed at it

GF-057 closed the kickoff-promotion instance and added `discard-feature` and the
typed reset as sanctioned ways to start over. Neither applies here: the feature
is legitimate, the design is legitimately reopened, and the agent is doing
exactly what the lifecycle told it to do. The state is *correct* and the session
is *stuck*, which is why no existing recovery matches it.

## Affected artifacts

- `plugins/pipeline-core/lib/plan-spec-state-v2.mjs:644-654` — `reopenPlanDesign`
  leaves `continuity.authority` bound to the submitted digests.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:1908-1925` — the routeless
  catch-all and its unestablished guidance.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs:1926` — the rebind
  observation, unreachable in this state.

## Direction, not a design

1. **Distinguish drift from unobservable.** A state whose artifacts are readable
   and whose digests disagree is a fourth typed class, not the "could not be
   observed safely" bucket. Its guidance must not assert a read-access cause.
2. **Decide what `reopen-design` means for the authority binding.** Either it
   releases the binding — the design is open, so the documents are editable and
   the digests are re-established at the next `submit-plan` — or it keeps the
   binding and the lifecycle must offer a rebind that works while unapproved.
   Today it does neither, and the gap is precisely where the agent is invited to
   work.
3. **Whatever is chosen, the refusal must reach it.** The rebind observation
   below the returning branch is the recurring shape this block has now hit five
   times: the assurance holds and the signpost points elsewhere.
4. A contract test driving the real inspection over a real reopened-and-edited
   project, asserting the returned `nextAction` is an action a guard admits.
   `guard-lifecycle-recovery-contract.test.mjs` is the pattern.

## Related

- `2026-08-08-a-permitted-edit-drops-the-session-into-an-unrecoverable-readiness-class.md`
  — the same readiness class, reached from the kickoff. This is a second door
  into it, after that one was closed.
- `2026-08-08-there-is-no-sanctioned-way-to-start-over.md` — closed by GF-057;
  its three legs do not cover this state, for the reason given above.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
