---
schema: pipeline.backlog-item.v1
id: pipeline.stale-plan-invalidation-reopens-the-authority-edit-lock
type: defect
owner: pipeline
status: open
created: 2026-10-21
sprint: alfred
source: "Alfred session incident 2026-10-21 (scratch/incident-report.md): an admitted Edit of the bound Spec dropped the session to readiness partial; no agent-runnable repair existed while the PO was remote."
done_when: manual
---

# A stale plan invalidation reopens the authority edit lock

## Description

The refusal `GUARD-LIFECYCLE-AUTHORITY-BOUND` (closed item
`pipeline.permitted-edit-drops-session-into-unrecoverable-readiness`, fix `0130513f`) is skipped by
`boundAuthorityDocumentPath()` (`lib/guard/denial-route.mjs`) whenever State carries any
`planInvalidation` object. approve-plan keeps the invalidation it supersedes on State (it binds it as
`priorInvalidationSha256`), so after any reopen-design followed by a re-approval the bound PRD and Spec
stay editable for good. Measured in this repository: invalidation 2026-10-12T11:37, re-approval
2026-10-12T16:02, the Spec editable until 2026-10-21. One Edit of the Spec then put readiness to
`partial`, which refuses every Bash, Edit and Write call including `git restore` of that file; the
only offered inspection action (`po-authority-decision-select --selection spec`) moves the feature
back to design. The session stayed blocked until the human ran `git restore` at the PC.

## Acceptance

- An invalidation releases the binding only while it is newer than the current submission and the
  current approval; a re-approved plan refuses an Edit of the bound PRD/Spec again (pin in
  `lib/plan-authority-staging-guard.test.mjs`).
- When the working-tree bytes of a bound authority document differ from its approved digest and the
  committed bytes match it, the agent has a sanctioned, digest-checked recovery that restores the
  approved bytes without a PO round trip (never-fully-blocking, D74); the partial-readiness
  refusal and the inspection name it.
- The inspection's PO-authority decision offers "restore the approved bytes" beside "accept the
  edited document and return to design".
