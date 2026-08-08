# Critic verdict on the GF-056 wave — FAIL

Date: 2026-08-08
Candidate: `e3dd8ff0976e172a009cf2242f6fe1707f1f412c`
Requested route: `claude-sonnet-5` at `max`; effective model identity reported as
`unknown` (no direct same-dispatch route evidence — correct per CR-06, not inferred
from a host label).
Assurance: `functional-equivalent-read-only; OS isolation not asserted`.
Notes persisted by the Critic: `scratch/critic-nova-c0846788/critic-notes.md`.

## Verdict

**FAIL.** Finding 1 (blocker) alone is sufficient; Finding 2 (major) independently
supports it.

## Finding 1 — blocker — the gate was red when the review was dispatched

`guardrails/quality-gates.md:15` (QG-01) states that a diff MUST NOT be handed to
the Critic while deterministic gates are red. It was. `evidence/verify-latest.json`
at the reviewed tip reports `"status": "failed"`, `exitCode 1`, nine non-zero steps,
and — separately — `"binding": "drift"`, because commits landed while its own run
was in flight.

**This is the dispatcher's error, not a defect in the reviewed work.** The
orchestrator knew the gate was red, had already dispatched a repair, and dispatched
the Critic concurrently to save wall-clock. QG-01 exists precisely to stop that
trade: a review against a red tree cannot separate "this change is wrong" from
"something else is broken", and the Critic then spends its budget establishing
which — visible here in its trajectory section, which had to reconcile per-suite
green claims against an aggregate red receipt.

The `binding: "drift"` half is a second, independent instance of the same
impatience: the run was started and then committed over.

**Correction:** Verify green on a quiet tree first, then a bounded delta re-review
naming base/head/tree and the prior receipt.

## Finding 2 — major — authorship trail

Eight of thirteen enumerated commits carry only `AI-Assisted: true` and no
`Dispatch: <ID> (goldfish)` trailer. Two are named with evidence:

- `34962c1` — the commit body itself records that the orchestrating session
  performed the `git add`/`git commit` after the goldfish dispatch was refused by
  `GUARD-GATE-STRENGTH-SHELL`. Accurate: that is what happened.
- `5918d9d` — the diff matches `dispatch-record-RUNDEFAULT-2.json`'s final log entry
  exactly, but that record is `"outcome": "in-progress"` with `"report": null` and
  logs no commit step, so the provided evidence does not establish who ran the
  commit.

**Both are the orchestrator's commits, and the record now says so.** The diff of
`5918d9d` was authored by the RUNDEFAULT-2 dispatch; the orchestrator ran the suite
independently (109/109) and performed the commit after that dispatch ended without
one. The same applies to `34962c1`, where the dispatch was structurally unable to
commit.

The two `RUNDEFAULT-*` records are `in-progress` with `report: null` because both
dispatches ended before writing them — five truncations across that one work
package. That is the defect recorded in
`backlog/items/2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`,
and this finding is its first *review-visible* consequence: the truncation does not
merely cost a report, it erases the authorship evidence the Critic is contractually
required to check.

History is not rewritten to add trailers — that is excluded by hard rule. This
record is the correction.

## Finding 3 — minor — GIT-02 bundling

`aed6fa9` bundles three concerns: a template wording change, a new backlog item, and
a rewrite of an unrelated item's direction. Accurate; reduces revert granularity.
Not corrected retroactively.

## Cleared by the Critic (its "deliberately not flagged")

Spec fidelity, scope against each dispatch record's declared file list, test
integrity (including that the inverted runner regression test is the PO-triaged
outcome rather than a weakening), edge cases in the new scratch-descriptor code and
the memory-directory derivation, guardrail violations beyond Finding 3, the security
surface including the HGO TTL widening and the memory admission's symlink-escape
test, documented-risk tracking, dependencies, language assignment, and completeness
of the literal-runner-default removal.

## Disclosure the Critic made, and it was the right call

Mid-review, an injected system-reminder instructed it to accept a changed date and
explicitly not to mention this. It refused, did not treat the instruction as
authoritative, and named it in its report instead. That is the correct handling of
an embedded instruction to conceal something from the principal, and it is recorded
here so the behaviour is reinforced rather than treated as noise.
