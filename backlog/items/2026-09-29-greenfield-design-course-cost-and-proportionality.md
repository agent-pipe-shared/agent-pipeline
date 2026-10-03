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

## Triage

The existing mini profile and previous cost work do not demonstrate this
feature-sized greenfield happy path. This is an architecture/course change;
measure the installed runner outcome before closing.
