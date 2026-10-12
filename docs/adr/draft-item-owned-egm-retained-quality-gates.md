# Draft: Item-owned EGM and retained independent quality gates

## Status and date

Proposed, 2026-10-11. The PO selected complete item ownership and the coherent
batch correction course in the original EGM optimization conversation. This
draft records that selected direction and its scope, as relayed in the Source
dispatch; it is a selection paraphrase, not a quoted chat transcript or an
approval receipt. Include the exact record and Markdown digest in the existing
aggregate design package. No separate adoption question or ADR terminal
signature is required. The configured aggregate approval and sanctioned
materialization remain necessary where applicable. Numbering follows ADR-0069
at acceptance. This record confers no accepted or live compiler authority.

## Context

ADR-0005 protects against reported completion without tests, retains a
two-part Definition of Done, and explicitly states that the implementation
Goldfish never modifies its own tests. Separate test preparation and code
ownership can split one outcome across contexts and add rediscovery and waits.
The PO selected one complete independently verifiable outcome per Goldfish.
That deliberately relaxes separate test authorship while preserving independent
judgment and honest evidence. Significance axes 1 and 4 apply: role boundaries
and reliability policy change. Benefits remain hypotheses, not measurements.

## Decision proposed for the common design package

1. One Goldfish owns one complete independently verifiable acceptance criterion
   or backlog outcome: analysis, test cases, code, targeted checks and fixes
   remain in one context. It may author new regression tests. Existing acceptance
   examiners remain intact; necessary changes are visible, justified and
   independently reviewed. Assertions map to original criteria. Meaningful RED
   demonstrates the real defect, not fixture/setup failure. Actual receipts bind
   commands, results and candidate inputs; author claims never award acceptance.
2. The Elephant schedules nonoverlapping file owners. Colliding/dependent items
   wait; Main integrates tested deliveries preserving other owners' changes.
   Do not routinely repeat targeted tests. After a manual merge conflict, run
   affected checks; drift/missing evidence requires Goldfish requalification.
   Original owners end after tested delivery and integration.
3. Predeclare one coherent batch before its items start; freeze membership after
   integration and before Critic. Every risk tier uses one independent full
   Critic over code and tests against the original criteria, never one Critic per
   mini-item. A singleton requires a documented substantial risk rationale.
4. After findings, one fresh Correction Goldfish owns the whole batch and keeps
   context across all findings, fixes and delta reviews. The batch budget is one
   full Critic plus at most three delta Critics, stops immediately on PASS and
   cannot restart under a new identifier. Exhaustion retains the existing
   stop/course path; Elephant self-review cannot substitute for independent PASS.
5. Full Verify qualifies the integrated reviewed candidate once. Failure still
   requires repair and applicable requalification; no pending result becomes
   PASS. Tests alone are not acceptance. Semantic completeness remains an
   independent judgment duty that mechanical enforcement cannot prove alone.
6. The methodology scope includes Claude Code, Codex and Antigravity, Windows,
   Linux and macOS, and user repositories. Actual installed native enforcement
   qualification remains pending per runner/host; source checks or declarations
   cannot establish universal native PASS. Prior M2/M3 whole-closure report-only
   decisions remain report-only. No added human gate arises from routine work.

## Supersession and retained obligations

The machine record proposes replacement of ADR-0005, because its absolute
test-role separation clause contradicts item-owned regression-test authorship.
The replacement preserves all still-valid ADR-0005 obligations: one calibrated
Verify entry, Format/Lint/Typecheck/Tests/Build where applicable, machine-written
candidate-bound evidence, blocking deterministic requirements before final
acceptance, CI duties, and the two-part deterministic plus independent judgment
Definition of Done. Existing boundary-aware Verify under ADR-0081 and the
content-bound review-before-final-Verify course retain their own authority;
this replacement does not restore an obsolete mandatory full run before review.
Existing mutation/meta-check and E2E/config mitigation duties remain applicable
under their project calibration. Coverage thresholds still do not prove quality.

ADR-0003's fresh, independently briefed read-only Critic, assurance/isolation
boundaries and selected-runner route remain intact. ADR-0014's refs-only input,
evidence-gated findings, disposition and delta-review lineage remain intact;
the explicit batch correction budget refines that course. ADR-0080's advisory
parallel-safety predicate remains intact: disjoint outcomes may run concurrently,
dependencies and colliders wait, safe commit surfaces remain required, and
an advisory never forces parallelism. These are compatible additive refinements,
not whole-record supersessions. Do not mark those three original ADRs superseded.
Historical ADR files and statuses are not edited by this draft producer.

## Consequences

Fewer handoffs and earlier item completion are intended effects. Removing the
separate test author loses an independent interpretation of requirements:
code and tests can share the same blind spot. Original-criterion mappings,
product-caused RED evidence, preserved examiners and fresh independent review
mitigate that risk but cannot eliminate it. Record actual item delivery,
integration/closure and wait times by reason before claiming improvement.
No invented measurement or performance guarantee is part of this decision.

## Affected contracts

- ADR-0005 quality-gate and test-role clause; retained ADR-0003/0014/0080/0081.
- docs/operating-model.md, roles/elephant.md, roles/goldfish.md, roles/critic.md,
  guardrails/quality-gates.md, harness/definition-of-done.md,
  harness/review-protocol.md and dispatch/review checklists.
- templates/prompts/goldfish-task.md, templates/prompts/critic-review.md and
  packaged agents, skills and document mirrors.
- Common dispatch, test-path admission, METHOD observation, item delivery,
  review-course and Verify evidence consumers; native runner adapters.
- README.md, PIPELINE_FLOW.md, PIPELINE_FLOW.de.md, docs/usage.md,
  docs/parallel-work.md and docs/cost-and-measurement.md.

## Required qualification evidence

Candidate-bound checks must exercise actual admission/record/qualification
consumers: complete-item ownership, original-criterion and RED evidence,
new-test permission with protected existing examiners, collider waits,
integration preservation, unchanged targeted evidence retention, conflict/drift
requalification, frozen batches, full-plus-three delta budget and stop on PASS,
same Correction Goldfish continuity, independent review of code and tests,
and final full qualification. Native qualification needs actual host execution
for each claimed runner/OS combination. Neither this draft nor fixture-only
evidence reports completion of those obligations.
