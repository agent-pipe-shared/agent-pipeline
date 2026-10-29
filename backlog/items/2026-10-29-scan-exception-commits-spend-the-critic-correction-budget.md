---
schema: pipeline.backlog-item.v1
id: pipeline.scan-exception-commits-spend-the-critic-correction-budget
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover (PF-99 part d), 2026-10-29; Elephant triage 2026-10-29; raised to P1/0.7.0 the same evening: the Toolbox consumer feature is blocked at its push gate by exactly this budget (N10, see Update)"
done_when: manual
---

# A scan-exception commit counts as a Critic correction commit and can exhaust the course budget

## Evidence

`lib/critic-course-admission.mjs` counts every non-evidence commit after a consumed round as a correction commit, cumulatively, and refuses further review with `CCA-REVIEW-BUDGET-EXHAUSTED` once `CRITIC_DISPATCH_LIMITS.correctionCommits` (3) is reached. A commit that only adds a reviewed scanner exception (for example a `.gitleaksignore` entry) is a non-evidence commit and spends one of the three, although it changes no reviewed behaviour. The order of scan, correction budget and evidence commits is not described anywhere.

## Wanted

Either such commits do not count (a closed, typed class with its own proof), or the intended order (scan exceptions after the last review round) is documented where a consumer meets it. Design latitude, 0.7.1, PO design review first. Not a hard blocker for 0.7.0: the consumer can commit the exceptions after the last round.

## Update 2026-10-29 (evening): no longer only scan exceptions, and a blocker

A consumer feature (Toolbox) is blocked at its push gate. Its Critic course has one consumed round (R1, failed) and the correction-commit budget (3) is spent. By the consumer's count more than ten commits since R1 were forced by the Pipeline itself (documentation, spec addendum, state, the rebind after the spec addendum, review receipts); real code changes since R1 are close to zero. Reported blockers, as the consumer numbered them:

- **N10:** count only commits that change code toward the correction budget. Today everything except the exact manifest-registration commit counts.
- **N11:** Windows path spelling in `check-critic-bound-verify.mjs`; fixed in `6c72f7408`, shipped with the stamp installed 2026-10-29.
- **N12:** a PO verb for "course closed, residual findings accepted": the PO decided it in chat, the Pipeline cannot take it. It needs a command that binds the decision to the candidate and that the push gate accepts as the qualification.
- **N13 (message):** the `push-init` refusal sends the user into a "Critic preflight with the merge base" chain that always ends at the budget; it should say "budget exhausted, PO decision needed".

The consumer's own handover file is not in this repository; the four points above are the PO's relay. Analysis and the fix design are in the 0.7.0 work list; `CCA-REVIEW-BUDGET-EXHAUSTED` is already in the `PO_DECIDES` set of `lib/critic-course-admission.mjs`, so the open question is whether a sanctioned decision route exists at all (checked in the same pass).

## Status 2026-10-29 (late): the fix chain is held patches, not yet applied

The PO replaced the N10 counting class with a budget model (D190, `specs/sprint-alfred-epic/plans/po-decisions-2026-10-29.md`): one full Critic round, then delta rounds until PASS or a PO exception, and no round or correction-commit count may refuse a delta round by itself. All of it goes into the next candidate; nothing below is applied yet (kernel files, so the PO applies the patches under a Guard Maintenance Window, in this order):

1. **Budget model** (N10, superseded by D190): `held-patches/w7-d190-critic-delta-rounds-are-not-capped.patch`, slices 1 to 3 combined (delta rounds past the old limits, any non-negative correction step between rounds, one named history bound of 4096). Whole suites green in the patch clone; the revert proof and the baseline failing-name comparison for slice 3 are recorded as not run in its notes.
2. **PO acceptance of residual findings** (N12; minor only, authorized in the configured `gates.push_approval` mode): `held-patches/w7-d190-accept-residual-critic-findings.patch`. Built so far: the lifecycle branch, `residualFindingId`, record v3 labelled as resting on an acceptance, five cases green. In progress: the authorization function through the existing critical-action route and the readiness wiring. Still to do after that: the `authorize-critical` and `pipeline-state` command surface for the new kind, and the one added closing sentence of the `push-init` refusal (N13).
3. **Briefing by file reference** (D183, not a consumer blocker): `held-patches/w7-d183-briefing-file-reference.patch`; design, the reference module and six RED cases exist, the guard seam and the generator pointer are still to do.

N11 is shipped. Independent Critic review and Full Verify of this repository are suspended by PO decision until the PO judges the local candidate good enough.

## Not covered here

The gitleaks course-key exemption is done separately; the osv waiver and consumer-defined exceptions have their own items.
