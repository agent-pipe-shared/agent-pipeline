---
schema: pipeline.backlog-item.v1
id: pipeline.new-docs-file-needs-governance-registry-rule-has-no-repo-level-home
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch (an ADR-0064-registration incident and a matching self-inflicted OG-DOC-UNCLASSIFIED gap hit again this same session on docs/state-archive/...). Finding surfaced by a read-only research fork, corroborated independently by this session's own experience."
---

# "A new `docs/**` file must be registered in `governance/observation-doc-governance.json` or `check-observation-governance.mjs` refuses it" has no repo-committed rule — only personal AI cross-session memory

## Description

`docs/state.md`'s second rotation batch records a self-inflicted
`OG-DOC-UNCLASSIFIED` gap when ADR-0064 was added without registering it in
`governance/observation-doc-governance.json`; the entry notes the lesson was
captured only in a personal AI cross-session memory file
(`feedback-new-docs-file-needs-the-governance-registry-in-scope.md`), not
in any repo-committed artifact a different agent or a future session could
read. This session independently hit the exact same class of gap again
while rotating `docs/state.md` content into `docs/state-archive/` (the new
archive file failed `check-doc-contracts`/`check-observation-governance`
until registered) — confirming this recurs across sessions and is not
self-evident from the code alone.

For that one specific case (handover-rotation archive files) this session
already fixed the root cause mechanically (`handover-rotate.mjs` now
auto-registers new archive files, see the commit hardening it). This
finding is about the GENERAL rule — any new `docs/**` file, not just
handover-rotation archives — which still has no repo-level home.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). Checked
`guardrails/quality-gates.md` and `CLAUDE.md` — neither mentions this rule.

## Affected artifact

`guardrails/quality-gates.md` (a natural home, alongside other QG-numbered
checklist items) or `docs/operating-model.md` §3 (SDLC) — not yet decided.

## Proposal

Not yet designed in detail. Likely a short, cheap addition: a QG-numbered
guardrail entry stating that adding a new `docs/**` file requires a
matching entry in `governance/observation-doc-governance.json`'s
documentation inventory, with a pointer to `check-observation-governance.mjs`
as the mechanical check that enforces it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** cheap, low-risk documentation addition; the specific
  handover-rotation instance of this gap is already fixed mechanically
  this session, but the general rule still deserves a repo-level home so
  it stops recurring across sessions/agents.
- **Date:** 2026-08-18
