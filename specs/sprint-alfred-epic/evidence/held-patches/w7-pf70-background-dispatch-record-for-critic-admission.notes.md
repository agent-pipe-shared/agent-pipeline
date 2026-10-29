# W7-PF70 -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `dfc382eb7`. Patch: `w7-pf70-background-dispatch-record-for-critic-admission.patch` (2 paths, apply-check exit 0). Backlog item: `2026-10-26-report-05-consumer-findings` (PF-70).

## What it delivers (documentation only, no code)

PF-70 said: background launches never get a host-commit completion (`NGHF-PENDING-UNAVAILABLE`), and which record the Critic batch precheck needs is undocumented. The route existed only inside the `CPP-REVIEW-ADMISSION` refusal text (`scripts/check-critic-skip-coverage.mjs`). It is now written down where a dispatcher looks:

- `skills/critic-review/SKILL.md`, new section "Which record admits the first review (PF-70)": the admission reads dispatch records, not queue reservations; a foreground Goldfish leaves the host-written record, a background one leaves none; the Elephant writes an orchestrator-attested record with `dispatch-record-write.mjs --attested-request`; the closed request shape (`pipeline.dispatch-attested-request.v1`: `briefingPath`, `handbackPath`, `commits`), the path rule (`scratch/`, `evidence/`, `specs/`), the required-review `criticDecision` in the briefing, and the `attested-scope` refusal when a commit touches a path outside the briefed `allowedPaths`. It is admitted as weaker assurance.
- `skills/pipeline-start/references/workflow-dispatch.md`: a short pointer paragraph after the dispatch-record section.

Every statement was read from `scripts/dispatch-record-write.mjs` (`runAttestedRequest`) and `evaluateReviewAdmissionCore`; nothing was run against a real background dispatch.

## Checks (scratch clone)

- `lib/pins/greenfield-machine-output-and-skill-budget.test.mjs`, `harness/scripts/check-critic-contract-citations.test.mjs`, `lib/critic-course-admission.test.mjs`: all exit 0.

## NOT in this patch

- The cause is not fixed: a background launch still gets no host-commit completion. This only documents the existing route. Why `NGHF-PENDING-UNAVAILABLE` arises for background launches, and whether the completion should be produced, stays open.
- Claim from the consumer report, not verified here: the reservation of such a dispatch still settles as `integrated-by-commit` through the trailer.
- Full Verify, batch Critic and PO acceptance remain pending. The files are under `plugins/pipeline-core/`: the PO applies the patch in the same ceremony.
