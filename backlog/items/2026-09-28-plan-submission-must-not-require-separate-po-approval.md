---
schema: pipeline.backlog-item.v1
id: pipeline.plan-submission-must-not-require-separate-po-approval
type: requirement
owner: pipeline
status: open
created: 2026-09-28
source: "PO explicitly requires autonomous agent plan submission and at most one happy-path design-to-implementation approval, after Advisor and readiness."
sprint: none
done_when: manual
---

# Agent submits the plan; PO approves the final package once

## PO requirement and source finding

The agent submits the plan and presents the complete package autonomously.
The happy path is design, one Advisor cycle, disposition and correction,
independent readiness, then one final PO approval before implementation.
There must be no separate PO approval or content acknowledgement granting
permission merely to submit a plan.

Current `scripts/pipeline-state.mjs` still contains a submit-plan stop requiring
the PO's own acknowledgement that the plan is content-sound. Submission and
presentation next-action descriptors also mark mechanical mutations as
requiring confirmation. This is distinct from the final package decision
and can produce the unwanted two-step human approval sequence.

## Acceptance

- Agent-authored submission and complete-package presentation need no new
  human acknowledgement or signature; returned actions state that clearly.
- Preserve genuine onboarding/configuration authority and source integrity;
  removing this extra checkpoint cannot fabricate approved plan state.
- Advisor and final independent readiness precede the final PO presentation.
- Final chat or signature approval binds the complete current package once;
  submission/presentation cannot grant implementation authority.
- A proposed unavailable-Advisor exception is included in that same final
  decision where possible and cannot waive readiness.
- Exercise the actual sanctioned writer and returned actions in both approval
  modes, with no pre-submission content acknowledgement, and verify that
  implementation remains refused until the final decision.
- Retain negative checks for stale/forged profile authority, source drift,
  incomplete packages and replayed final approvals.

This is an open PO requirement, not a current guarantee or completed fix.
