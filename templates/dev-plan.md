<!--
PROMPT/DOC TEMPLATE: Dev-Plan — implementation contract for the PO's Plan-Mode approval
(Dev-Plan-Gate) — Agent-Pipeline, AP1-P3 "DURIN".
Language: ENGLISH (share default; the PO is the primary reader in the hosted project).
Source of truth: docs/operating-model.md §3.2 Step 3b (booking statement).
Purpose: Plan-Mode substitute for Spec/PRD ceremony in sessions that use the PO's Session
Rule 1 ("Plan Mode + explicit plan approval") instead of the full Spec process — this
artifact is then the implementation contract against which the Dev-Plan-Gate
(plugins/pipeline-core/hooks/guard-devplan.mjs) checks whether the PO's approval has
already been recorded deterministically.
Location: `.claude/plans/<date>-<feature>.md` (the path is recorded as `planPath` when
the feature is set: `node harness/scripts/pipeline-state.mjs set-feature --id <id>
--plan-path .claude/plans/<date>-<feature>.md`).
-->

# <Feature/Topic> — Implementation Plan (CONTRACT)

> **Status: DRAFT** (placeholder — after the PO's "approved" change this to **APPROVED**
> here, with date/time) — this artifact is the session's implementation contract.
>
> **Approval booking:** After the PO's literal "approved", the approval is additionally
> recorded deterministically (docs/operating-model.md §3.2 Step 3b):
> ```
> node harness/scripts/pipeline-state.mjs set-feature --id <feature-id> --plan-path .claude/plans/<date>-<feature>.md
> node harness/scripts/pipeline-state.mjs approve-plan --by po-test
> ```
> Only after that does the Dev-Plan-Gate (guard-devplan.mjs) allow implementation edits
> outside the standard exceptions (`docs/`, `specs/`, `.claude/`, `backlog/`, this plan
> path itself). A revocation runs via `revoke-plan --by <name>`.

## Context
<Task/assignment, occasion, boundary against parallel sessions/topics; one paragraph.>

## Key decisions (with rationale)
<Numbered list: every material design/scope decision with a one-sentence why —
mirrors PRD "Alternatives considered" (solo-memory element).>

1. …
2. …

## Packages (implementation = implement-tier Goldfish, disjoint files per package)
<Per package: short name, affected files (disjoint from other packages), one-sentence scope.>

- **P0 — …:** …
- **P1 — …:** …

## Verification (DoD mapping)
<How completion is recognizable per package/overall; reference to the `verify`
command and any additional suites/evidence artifacts.>

## Risks / knowingly open
<Known risks, accepted gaps, topics explicitly NOT addressed in this session
(scope boundary, prevents silent scope creep).>

## Amendments (after approval, PO-sanctioned)
<Only fill in if a PO-sanctioned addendum is needed after approval — every amendment
entry numbered, with date and short rationale.>
