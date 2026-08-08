---
schema: pipeline.backlog-item.v1
id: pipeline.b3-inventory-missed-agent-facing-documents-under-docs-deploy
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-09-07
source: "Critic out-of-scope observation, Phoenix gate-integrity full review round 1, 2026-08-08: docs/deploy/README.md carries live operating-model section citations and appears in neither B3 inventory."
---

# The B3 citation inventory missed agent-facing documents under `docs/deploy/`

## Description

R3's B3 sweep repaired every `§N` reference to `docs/operating-model.md` across
the 39 files its inventory listed, and AC-P4 is satisfied against that list.
`docs/deploy/README.md:8,23` still carries live `docs/operating-model.md §3.5`
and `§3.1/§3.5` citations — the exact defect class the sweep exists to remove —
and it appears in neither inventory half
(`phx-r3-b3-inventory-c1-c5.md`, `phx-r3-b3-inventory-c6-c8.md`).

So the sweep is complete against its inventory, and the inventory was not
complete against the repository. The criterion cannot catch this, because AC-P4
is scoped to "B3's 39 files" — it measures the sweep, not the census.

## Triggering situation

Found by the Critic during the full review of the gate-integrity phase
(2026-08-08) and reported as an out-of-scope observation rather than a finding,
correctly: it is outside the diff's review boundary. It is filed here so the
observation does not die with the report.

Worth noting alongside: the same phase already recorded a related lesson — the
stage-0 consolidation was scoped three times by directory and three times too
narrowly, and the rule drawn from it was "measure repository-wide first, then
cut". The B3 inventory *did* measure repository-wide and still missed this, so
the rule alone was not sufficient; whatever produced the census had a blind spot
of its own.

## Affected artifact

- `docs/deploy/README.md:8,23` — the carriers.
- `specs/sprint-phoenix-epic/evidence/phx-r3-b3-inventory-c1-c5.md` and
  `-c6-c8.md` — the inventory that did not list it.
- `backlog/items/2026-08-07-no-check-validates-prose-section-citations.md` — the
  already-filed structural item; a prose-citation lint is what makes this class
  non-recurring, and this item is evidence for its priority rather than a
  competing proposal.

## Proposal

Two steps, deliberately separate:

1. **Repair the carriers.** Repoint `docs/deploy/README.md`'s two citations by
   heading title, the same transformation the B3 sweep applied everywhere else.
   Small, mechanical, and needs no new decision.
2. **Find out why the census missed it**, before trusting the next one. The
   useful question is not "which other files are missing" but "what did the
   inventory's search bound exclude" — a `docs/` subdirectory, a filename
   pattern, or a scope class that was never enumerated. Answering it is what
   turns this from one repair into a bounded guarantee.

Acceptance test: a repository-wide search for `docs/operating-model.md` followed
by a section sign returns only archival documents that quote the defect
deliberately, and the reason the previous census missed `docs/deploy/` is stated.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
