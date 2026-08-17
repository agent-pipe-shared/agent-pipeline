---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-consent-is-requested-before-the-readiness-preflight
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-17
closure_repository: self
closure_commit: 6ba4e5884e14a5e3ff08361603fb3a5eb07bffbf
closure_evidence: backlog/items/2026-08-17-advisor-consent-is-requested-before-the-readiness-preflight.md
created: 2026-08-17
source: "Second, independent Codex happy-path test (PO, project 'Rune_Test1_Codex_055_50' / 'ruinen-browsergame', 2026-08-17), relayed as an AI-authored forensic report and independently re-verified against this checkout's own current source and the raw rollout transcripts before being filed."
---

# The Advisor consent ceremony runs before the readiness preflight, so a human can approve a transfer that then immediately fails

## Description

The PO was asked for, and granted, explicit consent to transfer 3 design
documents to the external Advisor. The actual Advisor call then failed
immediately with `PORG-NOT-READY` — confirmed in the raw transcript: consent
requested/granted, then the very next step (`codex-advisory-bootstrap.mjs`)
failing with that exact code. Source confirms the ordering gap:
`requireProjectOnboardingReady()` is the first statement inside the
bootstrap script itself (~lines 85-92), but the pre-dispatch trigger gate in
`plugins/pipeline-core/skills/advisor-consult/SKILL.md` (~lines 15-45) has
no readiness step of its own — nothing forces a readiness check to happen
BEFORE the agent asks the human for consent, only after.

This spends a real human decision (a specific, file- and destination-bound
consent, correctly scoped per its own design) on a call that the code could
have already known would fail.

## Affected artifact

`plugins/pipeline-core/skills/advisor-consult/SKILL.md` (the pre-dispatch
trigger gate, ~15-45) and/or the consent-request site that precedes it in
whatever caller invokes it; `codex-advisory-bootstrap.mjs`'s own
`requireProjectOnboardingReady()` call (~85-92) as the readiness check that
needs to move earlier in the sequence.

## Proposal

Not designed here. Direction: run the readiness preflight (the same check
`codex-advisory-bootstrap.mjs` already performs internally) BEFORE
requesting consent from the human, not after — so a not-ready state is
surfaced as "the Advisor isn't reachable right now" rather than as a wasted
consent followed by an immediate failure.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope — confirmed live ordering gap,
  genuine (a human decision spent on a call known-failable in advance).
- **Rationale:** independently re-verified against this checkout's own
  current source and the raw transcript before filing; not trusted from the
  relayed report alone.
- **Assignment (if accepted):** goldfish-implementor (skill/script
  reordering, no in-task design latitude beyond sequencing), plus Critic
  review before considered done.
- **Date:** 2026-08-17

## Closure (2026-08-17)

Fixed via goldfish-implementor dispatch NVA-ADVREADY-1 — a new Trigger Gate
step 1 in `advisor-consult/SKILL.md` requires confirming project-onboarding
readiness (naming `requireProjectOnboardingReady`/`PORG-NOT-READY` by name)
BEFORE requesting or recording Advisor-export consent; prior steps 1-4
renumbered to 2-5, content otherwise unchanged. Documentation-only change
(no executable test suite for a skill file); verified by re-reading the
edited section and confirming no other file references the old step
numbers. Commit `6ba4e5884e14a5e3ff08361603fb3a5eb07bffbf`.

Still needs the Critic review noted in Assignment above before being
considered fully done — not yet scheduled.
