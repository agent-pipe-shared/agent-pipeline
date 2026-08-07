---
schema: pipeline.backlog-item.v1
id: pipeline.ledger-backed-plan-and-push-authority-absent-on-merged-base
type: defect
owner: pipeline
status: open
source: merge report section 4 findings 1/2/4/5/6/11 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
---

# The PHX-2 Human Governance Decision Ledger has no equivalent on the merged base

## Description

Merging `origin/main` 0.5.2 into `sprint_phoenix` (local commit `75b8361`,
not pushed) resolved 28 competing code conflicts to main's implementation per
PO direction (same guardrail/authority mechanism, independently
re-implemented on both sides — main wins, Phoenix's version documented as
lost). Six of those losses are one coherent subsystem, not six unrelated
ones: Phoenix's ledger-backed human-governance-decision authority for plan
approval and pushes.

Gone from the merged tree:
- `harness/lib/plan-spec-state-v2.mjs` — `bindPlanSpecApprovalWithHumanDecision`,
  ledger-first v3 plan approval bound to an independently-resolved
  human-decision reference.
- `harness/scripts/pipeline-state.mjs` — the Recovery Bridge / feature-package
  / continuity-authority-revision / human-decision-consumption governance-
  ledger subsystem (~1,400 lines on the Phoenix side).
- `plugins/pipeline-core/hooks/guard-devplan.mjs` —
  `hasLedgerBackedPlanApproval`, an external single-use governance-authority
  readback required before honoring `planApproved`; main trusts local
  content-hash verification only.
- `plugins/pipeline-core/hooks/guard-git.mjs` — override consumption scoped
  to `governance-authority.mjs` (bound to the exact guard file's own
  sha256), replaced by main's plain local-file ledger.
- `plugins/pipeline-core/hooks/guard-push.mjs` — `checkLedgerPushAuthority`,
  the actual enforcement mechanism for what CLAUDE.md's own Hard Rules
  described as the sole future remote-action exception path. **This is the
  single most consequential loss in the whole merge.**
- `plugins/pipeline-core/skills/pipeline-start/SKILL.md` — the agent-facing
  documentation of the PHX-2 fail-closed remote-authority contract, paired
  with the guard above.

Main instead governs pushes via `gates.push_approval` (ADR-0056, `signature`
or `chat` mode) — already implemented, and CLAUDE.md's Push Policy paragraph
was resolved to describe that mechanism during the merge (dropping the PHX-2
description). Since PHX-2 was never built on either side before the merge,
nothing regresses in practice — but every remaining "PHX-2" reference in this
repo's docs now names a mechanism the merged codebase does not implement.

## Triggering situation

`git merge origin/main` into `sprint_phoenix` (2026-08-07), PO-directed
integration of the real 0.5.2 release candidate. Full per-file loss
accounting and resolution policy in the merge report cited above.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs`, `guard-git.mjs`,
`guard-devplan.mjs`; `harness/lib/plan-spec-state-v2.mjs`;
`harness/scripts/pipeline-state.mjs`;
`plugins/pipeline-core/skills/pipeline-start/SKILL.md`; CLAUDE.md's Push
Policy paragraph (already repointed to ADR-0056 in the merge).

## Proposal

No proposal yet — this is the core finding for the redesign round the PO's
own merge procedure explicitly deferred to a later step. Needs an explicit
PO decision first: adopt main's signature/chat model as final (retire PHX-2
as a concept, scrub remaining references), or carry the PHX-2 ledger design
forward as new work designed against the merged base rather than resurrected
wholesale. Either way, whichever line is chosen should be the only one left
described in the repository's docs — the current post-merge state has two
named mechanisms, only one of which is implemented.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
