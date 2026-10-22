---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-design-course-cost-and-proportionality
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
source: "Codex 0.7.0 greenfield review: an approximately 3 h 41 min elapsed design course ended before implementation, with three completed readiness rounds, two material authority signatures, ten local commits and no product files. The reported time split is an estimate, not measured telemetry."
sprint: alfred
done_when: manual
---

# Make small greenfield design courses bounded and measurable

The initial Advisor found useful gaps, and readiness found real contradictions.
The same run also spent substantial time on repeated source binding,
preparation, review and recovery. A final PO decision was never reached.

Current-source verification on 2026-09-30: `pipeline-state submit-plan` is
agent-runnable and has no human signature. The `awaiting-approval` observer
only asks for a completed workflow package in prose; it does not issue typed
Advisor or readiness actions. `present-plan` verifies the complete package
before creating the one final PO request. The existing
`project-onboarding-e2e.test.mjs` design path is legacy v1 and obtains a proof
before Advisor, so its PASS is not a v2 happy-path proof. The new start-skill
reference states the early Advisor order, but the controller and v2 end-to-end
proof remain open.

The 2026-09-30 focused native no-child course test is green. The older
answered-Advisor v2 package test did not finish within 120 seconds when run
alone on the current host and yielded `host-stdio-closed` in the managed
sandbox. Until its synthetic host route is made bounded, that test is not
evidence for the one-approval happy path.

## Acceptance

- Show and enforce the order: agent submits the plan; Advisor and independent
  readiness complete before the single final PO plan approval. No intermediate
  plan-submission PO ceremony on the happy path.
- Run cheap deterministic source/reference/Verify-configuration checks before
  model readiness. Domain-specific score arithmetic must be checked only when
  the project declares a machine-checkable rule, not guessed from prose.
- Reuse an unchanged successful evidence tuple across retries. For a narrow
  change, rerun only checks whose declared inputs changed; new semantic rules
  require a full relevant review. Bind the final package to all current sources.
- Provide a bounded low-risk local-project course with compact planning
  artifacts and one final PO gate, retaining the full high-risk route.
- Record phase wall time, tool time and human wait separately; report model
  tokens only where the host supplies trustworthy counters.
- Demonstrate a fresh small-project run that reaches implementation without
  intermediate human signatures caused solely by draft corrections, while
  preserving the independent review and final authority boundary.
- Add a v2 end-to-end test that asserts zero PO proofs before agent submission,
  initial Advisor and final readiness, one final DWP proof, and implementation
  admission only after that proof. Keep the v1 fixture as compatibility only.
- Bound the synthetic Advisor/Readiness host test and split independent
  scenarios so a closed stdio channel cannot stall the suite.

## Evidence 2026-10-03 (three-runner greenfield, PO)

- **PO observation (all runners):** the route from material input to a
  presented design is still too complicated and too long.
- Claude/Windows (Claude test repo analysis V-5, V-11, V-14): `design-course.md`
  documents Advisor → `submit-plan` → readiness. Only after `submit-plan` does
  `inspect` demand an authoring dispatch plus `design.md`/`traceability.md`,
  which are mentioned nowhere earlier. `intake-generate-design.md` tells the
  Elephant to author PRD/Spec itself, while EL-16 forbids bulk artifacts by the
  Elephant. A free Advisor consult was not accepted by the formal course, so the
  Advisor work was duplicated. Searching the plugin source for the registration
  route cost 41 tool calls at about 400k context (about 16M cache-read tokens).
  Required: one continuous, documented sequence: intake → authoring dispatch
  (PRD/Spec/design/traceability) → binding → Advisor → `submit-plan` →
  readiness → presentation, emitted step by step as typed `nextAction`s.

- **PO direction (2026-10-03, later):** consider a redesign of the whole
  design-run and onboarding-driver code, which seems too complex and
  error-prone, instead of patching individual refusals. Live the same day in
  the Agent-Pipeline repository:
  - Stage-0 authoring registration needs a hand-built full continuity state for
    `continuity-cas`.
  - `reopen-design` looped without resolving `PLAN-LIFECYCLE-DIGEST-DRIFT`.
  - On native Windows none of the course's roles could run (dispatch-budget
    lock).

## Triage

The existing mini profile and previous cost work do not demonstrate this
feature-sized greenfield happy path. This is an architecture/course change;
measure the installed runner outcome before closing.

- **Decision:** D125 (PO, 2026-10-22): ADR-0085 supersedes the Advisor-plus-readiness design course for this item; the telemetry clause is split out per D25 and D121. Recorded at the 2026-10-23 text sweep.
- **Rationale:** the original acceptance (Advisor plus independent readiness before one final gate) is restated against the single-review route of ADR-0085, and the phase-time telemetry clause is tracked in its own item.
- **Assignment (if accepted):** telemetry clause: `backlog/items/2026-10-16-design-course-telemetry-is-deferred.md`; remaining clauses: judged against the successor policy, installed-runner measurement still open.
- **Date:** 2026-10-23

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — Demonstrate a fresh small-project run on an installed runner that reaches implementation with one final PO gate
  Requires an installed runner (Claude, Codex or Antigravity) executing the real design course with Advisor and readiness model turns and the PO's final plan approval; no agent may drive that. Observed: zero intermediate PO proofs, one final DWP proof, implementation admitted only after it.
- **PO-DECISION** (decided: D125) — Confirm the original Advisor-plus-readiness acceptance is replaced by the successor policy (one review, no readiness, ADR-0085) and that telemetry stays deferred
  Question: is the item's original acceptance (Advisor plus independent readiness before one final gate, with phase-time telemetry) superseded by ADR-0085 (one review, no readiness) so the course test is judged against the successor policy?

## Reconciled 2026-10-23

Text sweep K59-BACKLOG-TEXT-SWEEP-3. Superseded sentences above, kept as history:

- Acceptance bullet 1 ("Advisor and independent readiness complete before the single final PO plan approval") and every
  other Acceptance or Description sentence that names independent readiness: decided by D125 (PO, 2026-10-22,
  `specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md`). ADR-0085 supersedes the Advisor-plus-readiness design
  course for this item; its acceptance is restated against the single-review route, with fallback evidence going to the
  present-plan review-receipt route. The one-final-PO-gate and no-intermediate-proof parts of the bullet are unchanged.
- Acceptance bullet 5 ("Record phase wall time, tool time and human wait separately; report model tokens only where the
  host supplies trustworthy counters"): leaves this item's acceptance by D25 (2026-10-18) and stays postponed for 0.7.0
  by D121 (2026-10-22; named as open in the release note, no new schema before the test candidate). It is tracked in
  `backlog/items/2026-10-16-design-course-telemetry-is-deferred.md`; the duplicate
  `2026-10-19-design-course-phase-telemetry-is-not-recorded.md` is closed and merged into it.
- Blocker analysis PO-DECISION bullet "Confirm the original Advisor-plus-readiness acceptance is replaced by the
  successor policy ... and that telemetry stays deferred": answered, D125 and D121 (the bullet already says "decided: D125").
- The Triage block above had no Decision, Rationale, Assignment or Date; the four fields were added from D125, D25 and
  D121. The Triage text was not rewritten.
- Still open and not agent work: the HOST-SESSION-NEEDED run (a fresh small-project course on an installed runner,
  judged against the successor policy) and PO acceptance. The status stays `open`.
