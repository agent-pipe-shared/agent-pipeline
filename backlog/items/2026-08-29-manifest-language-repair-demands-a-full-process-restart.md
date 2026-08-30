---
schema: pipeline.backlog-item.v1
id: pipeline.manifest-language-repair-demands-a-full-process-restart
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
done_when: manual
tracking: "Nova B (PO decision 2026-08-29) — low-severity UX friction, current restart-on-repair behavior is safe; investigate later, not a 0.6.0 blocker"
source: "Codex/WSL report, delivered inline in chat by the PO (priority 6 in that report), during the 2026-08-29 three-runner greenfield test."
---

# A pure manifest/language repair demands a full process restart, when restart should be reserved for genuine runtime-target changes

## What happened

Codex's report names, as its own priority-6 item, that a pure manifest or
language repair — a correction with no runtime-target implication — currently
demands a full process restart to take effect. The PO's own framing (recorded
in the triage) is that restart should be reserved for genuine runtime-target
changes, not routine data corrections.

## Where it is

`restart-required` is one of the statuses in
`PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES`
(`plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`, line 13),
confirmed to exist as a real, gating status in this repository's readiness
machinery. `plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
`plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, and
`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md` all
reference `restart-required`/related machinery per an earlier grep in this
same dispatch, but I did NOT trace, within this dispatch's tool budget, the
specific code path that decides a MANIFEST or LANGUAGE correction must go
through `restart-required` rather than a narrower, live-reload path. This item
records the PO's stated priority and the existence of the general
`restart-required` mechanism; it does not independently confirm which
specific repair operation(s) are routed through it, or why.

This may share a root cause with
`pipeline.projection-drift-fault-after-design-implementation-transition-forces-restart`
(F08) — both are instances of "a readiness fault that could plausibly be
resolved by re-reading current state instead resolves through a full process
restart" — worth investigating together rather than assuming they are
unrelated.

## Proposal

1. Trace which project-onboarding-v3.mjs code path is responsible for routing
   a manifest/language correction to `restart-required` rather than a narrower
   recovery (a live re-read of the corrected file, or a scoped
   re-initialization of only the affected subsystem).
2. Distinguish, in that routing logic, between faults that genuinely require a
   new process (a changed runtime target: different runner, different working
   directory, a capability that can only be established at process start) and
   faults that are pure data corrections readable from disk on the next
   check (a manifest field, a language setting).
3. For the latter class, add a narrower recovery status/path that re-reads the
   corrected data without a full restart.

## Acceptance

- The specific manifest/language repair scenario Codex hit is reproduced in
  this repository (a controlled repro, not only the chat-delivered report),
  and the exact code path routing it to `restart-required` is named with a
  file/line reference.
- A narrower recovery is implemented and tested for that scenario, verified to
  NOT require a process restart.
- A genuine runtime-target change (a different case) is verified, by a test,
  to still correctly require `restart-required` — this fix must not weaken the
  cases where restart really is necessary.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Explicitly named by the PO as a priority item in the Codex
  report; the general `restart-required` mechanism is confirmed to exist in
  this repository, though the specific manifest/language routing was not
  traced within this dispatch's budget. `manual` `done_when` because the
  falsifiable predicate depends on a repro and trace that have not happened
  yet.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's L
  group. Investigate alongside
  `pipeline.projection-drift-fault-after-design-implementation-transition-forces-restart`
  (F08) — both may share the same "restart over-used as default remedy" root
  cause.
- **Date:** 2026-08-29

## PO decision, 2026-08-29

**Decision:** leave current behavior as-is (restart on every manifest/
language repair); defer the actual investigation to Nova B.
**Rationale:** PO chose the low-risk, no-action-now option — current
behavior is safe even if possibly overcautious, and this is minor UX
friction, not a defect with real consequences.
**How to apply:** no code change now. Repoint `sprint: nova` to `sprint:
nova` with a Nova-B tag (matching this repo's established "Nova B" text
convention in `tracking`/Assignment, per other deferred items this session)
rather than leaving it implying a 0.6.0 blocker — the triage's own
"blocks the 0.6.0 candidate" line above is now superseded by this decision
and should not be trusted by a future dispatch without re-reading this
section.
