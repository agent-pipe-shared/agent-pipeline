---
schema: pipeline.backlog-item.v1
id: pipeline.language-selection-scope-is-unclear-and-arrives-too-late
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-09
source: "Live observation of the PO's private Claude+Pipeline and Codex+Pipeline 0.5.4 happy-path test runs (fifth local candidate), 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
---

# The bootstrap language question is scoped to documents only, but that scope isn't clear enough in practice, and it surfaces too late

## What happened

`references/kickoff-design.md`'s bootstrap language question is already
correctly scoped in its own wording — it asks specifically "Which language
should the PRD, Spec, and this project's working documents use", not the
language of the project's own deliverable/content. In both the Claude and
the Codex 0.5.4 happy-path re-test runs on the same day, the actual session
still hit friction over language: the Codex run restarted at least once
partly over language-selection confusion (losing its session context in the
process — see the sibling resume-hint items), and the Claude run needed one
or two repair cycles via the documented
`PO-GATE-PRD-LANGUAGE-MISMATCH` → `projection-drift` two-step repair path
(`po-gate-profile-repair.mjs`).

The scope being correct in the reference text is not the same as it being
communicated clearly and early enough in practice: a documented repair path
for the drift it can cause is a mitigation for the friction, not a removal
of it.

## Direction

Two independent angles, not mutually exclusive:

1. Surface the document-vs-deliverable language distinction explicitly and
   earlier in the bootstrap flow — before the question is asked, not only as
   a lazily-loaded reference an agent may read at a different point than
   when it actually asks the question.
2. Investigate whether the question's current phrasing and timing (loaded
   from `references/kickoff-design.md`, itself lazily loaded per
   `SKILL.md`'s typed-lazy-loading section) reliably reaches the agent
   before it needs to ask — a timing gap here would explain repair cycles
   after the fact rather than a clean ask up front.

## Related

- `2026-08-09-bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection.md`
  (closed, fixed by GF-063 same day) — a related but distinct class of
  "learned only by live rejection" bootstrap gap; this item is scoped
  specifically to the language question's clarity/timing, not the general
  pattern.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
