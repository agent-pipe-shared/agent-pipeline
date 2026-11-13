feat(design-review): record the reviewer model from the host, label runners without a route

Claude test run 3, finding L3, part 3. PO tiles 2026-11-13: the design
review receipt's reviewer model is host-observed where a route exists and
visibly labelled elsewhere; a Claude background review takes its model from
the child's host-written transcript, read by the hook so nothing of it
enters the agent's context. ADR-0085 is amended (D247).

- Hook: native-goldfish-host records the end of a Claude readiness-reviewer
  dispatch in the private control area (foreground PostToolUse: resolved
  model and returned text; background SubagentStop: the child transcript's
  models and the returned text), keyed by the text's digest. One line, never
  blocking; an ungoverned project and every other call are unchanged.
- design-review-receipt.mjs export-report writes the observed text as the
  report; create finds the observation by the report's digest (the original
  when sanitized) and stamps the optional closed field reviewerObservation
  and reviewer.model. Codex and Antigravity receipts say unobserved. A
  self-asserted identity stays refused (W7). The guard admits export-report.
- present-plan refuses a Claude round without an observation
  (PLAN-DESIGN-REVIEW-UNOBSERVED, every round of the chain, receipts made
  before this change too) and names the route: a fresh dispatch and a new
  initial receipt. Fallback receipts pass. The binding summary never carries
  the field, so approval bytes and stored-approval readers are unchanged.
- Docs: design course step 2, runbook, repair text, ADR-0085, register D247.
- Tests: the field's shape and binding rules, the hook spawned on a
  governed fixture, export-report choices, the e2e refusal (DABX016) and
  the whole route from hook to a presented plan (DABX017).

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
