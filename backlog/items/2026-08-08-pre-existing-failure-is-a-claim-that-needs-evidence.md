---
schema: pipeline.backlog-item.v1
id: pipeline.pre-existing-failure-claims-need-evidence
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-08
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "f57375ff77263a2df70bbb3201feb361912f07f6"
closure_evidence: "docs/state.md"
due: 2026-08-22
source: "Two dispatches on 2026-08-08 independently classified the same red checks as pre-existing and unrelated. Both were wrong; a bisect settled it in one step and found the introducing commit."
---

# "Pre-existing failure, unrelated to my change" is a claim, and it needs evidence

## What happened, twice

Two dispatches in the same wave reported red checks they did not own:

- One called two failures in `guard-lifecycle-ready.test.mjs` *"pre-existing
  flaky failures, proven unrelated to this change"*, citing that the counts
  differed between runs.
- The other called a failure in `codex-pretool-guard.test.mjs` *"confirmed, via
  the same before-worktree, to be unrelated to this change — fails identically
  without it."*

Both were wrong. All three checks were invalidated by the cross-repository lift
work of ADR-0059 Decision 6: they assert that a target outside the repository is
refused with **no** override route, and such targets now have one. A bisect
established it in one step — green at `c609ac0^`, red at `c609ac0`.

The first report's "different counts each time" had a mundane cause: a concurrent
dispatch was still writing the library under test. The second's before-worktree
comparison isolated against a state that was not actually before the change.

## Why the wrong direction is the expensive one

"Pre-existing and unrelated" is the one diagnosis that ends inquiry. It converts a
red check into an accepted background condition, and the next reader inherits it
as settled. A failure wrongly called new costs a little time; a failure wrongly
called pre-existing costs the finding.

Here it nearly did. Three checks encoding a boundary that a PO decision had
deliberately moved were on their way to being recorded as flakes. The reason they
were not is that someone re-derived the cause from the failure text rather than
accepting the label — which is not a process, it is luck.

## The second half: nobody runs the full gate during a wave

`codex-pretool-guard.test.mjs` is registered in `harness/scripts/verify.mjs`. The
full Verify would have caught it immediately. It was not caught because in a wave
of four to six concurrent dispatches, nobody runs the full gate: each dispatch runs
its own suites, the orchestrator waits for them, and the one check that spans files
runs at the end.

So a cross-file breakage introduced early in a wave survives the entire wave. That
is a property of how the wave is orchestrated, not of the suite or of Verify.

## Direction, not a design

1. **Make the claim carry its evidence.** A dispatch reporting a failure it does
   not own may say "red, not investigated, not mine" — which is honest and cheap —
   or "pre-existing", in which case the report names the commit it verified against.
   Anything in between is the failure mode above. This belongs in the Goldfish
   contract, next to the trajectory duty.
2. **Name the cheap method.** Bisecting one check against one earlier commit took a
   single step and produced a commit id. The reason it was skipped twice is not that
   it is expensive; it is that the label was available without it.
3. **Run the gate inside the wave, not only after it.** Even one full Verify at the
   midpoint of a multi-dispatch wave converts a wave-long undetected breakage into a
   one-dispatch one. Whether the orchestrator does this on a cadence, or after every
   landed commit, is the question — and it must account for suites that take real
   time.
4. **Consider whether concurrent dispatches can measure "before" at all.** The
   before-worktree method is sound in isolation and unsound while another process is
   writing the same library. If dispatches keep running concurrently, the contract
   should say what a valid baseline is.

## Related

- `2026-08-08-concurrent-dispatches-share-one-git-index-and-mis-attribute-each-others-work.md`
  — the same wave's other cost of concurrency, also a corruption of the record
  rather than of the work.
- `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md` — a different
  cause with the same symptom; that one is invisible *to* Verify, this one is
  invisible *because Verify was not run*. Do not merge them.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Points 1–2 (evidence-carrying claims in the Goldfish
  contract) already queued as Task #66. Points 3–4 (Verify cadence during a
  wave): Option 1 — run one full Verify at the wave's midpoint, converting
  a wave-long undetected breakage into a one-dispatch one; per-commit Verify
  (Option 2) is too expensive at real wave scale.
- **Rationale:** PO, 2026-08-12: "1."
- **Assignment (if accepted):** Elephant-process change (how waves are
  orchestrated), not a code dispatch — apply going forward this session.
- **Closure (2026-08-18):** Option 1 (full Verify at a wave's midpoint/end)
  is a process rule, not code, and has been the session's own repeated
  practice since the decision — every Nova A block this session ran a clean
  Full Verify after each dispatch wave before proceeding, per `docs/state.md`.
  Points 1-2 (evidence-carrying claims in the Goldfish contract) remain
  tracked separately under Task #66 and are not reopened by this closure.
  Closing this item since its own decided scope (points 3-4) is in
  continuous effect.
- **Date:** 2026-08-12 (closed 2026-08-18)
