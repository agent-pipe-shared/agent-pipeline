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
2. **Find out why the census missed it**, before trusting the next one.
   **Answered 2026-08-08 — see below.** What remains of this step is deciding
   what to do about the cause, not discovering it.

Acceptance test: a repository-wide search for `docs/operating-model.md` followed
by a section sign returns only archival documents that quote the defect
deliberately.

## Why the census missed it (measured 2026-08-08)

The inventory's method was prescribed and, as prescribed, structurally unable to
find this file. `phx-r3-b3-inventory-c6-c8.md:15-16` states it:

> For every file in scope: `rg -n "§" <path>` and `rg -n "OM §" <path>` … **never
> `rg` for the string `operating-model`**.

So the search ran *per file of a given list*, over the section sign, and was
explicitly forbidden from searching the repository for the cited document's
name. A file that was not already in the class list could not surface, however
many citations it carried. The class list itself came from a design document's
enumeration (`design/part-a-residuals-and-dispatch-template-drift.md` §II.1.3),
authored rather than re-derived from the tree.

That is the whole cause: **the sweep was measured, the scope was asserted.** The
lesson the phase already recorded — "measure repository-wide first, then cut" —
was applied to counting citations *within* the scope and never to establishing
the scope.

A repository-wide search run now (`rg -ln "operating-model\.md.*§"`, excluding
the deliberate archival carriers `docs/state.md`, `specs/**`, `backlog/**`,
`docs/adr/**`) returns seven files. Six of them are false positives of the
obvious form: they cite `harness/review-protocol.md §2.1` on the same line where
they name `docs/operating-model.md` by heading title, which is the correct
post-sweep shape. Only `docs/deploy/README.md:8,23` genuinely carries
`docs/operating-model.md §3.5` and `§3.1/§3.5`.

**One adjacent instance, and the first reading of it here was wrong.**
`roles/elephant.md:105` cites `docs/deploy/README.md §7.1`. This item first
recorded that as "the same class, different target", which overstates it:
`### 7.1 Evidence schema` **exists** in that document, so the citation currently
resolves. It is a numeric citation and therefore carries the same *fragility* —
a renumbering of the deploy README would silently break it — but it is not a
broken citation today and is not part of this defect. Corrected rather than left
standing, because an item that inflates its own scope is harder to triage than
one that states it narrowly.

**Carriers repaired 2026-08-08** (`162c30c`, dispatch `PHX-DEPLOY-CITE`): both
`docs/deploy/README.md` citations now read `` `docs/operating-model.md` — *The
lifecycle* ``, matching the `roles/elephant.md:105` precedent for the same
Release/Promotion subject matter. `check-doc-contracts.mjs` green; a
repository-wide search for the pattern now returns only the six false positives
described above. **Step 1 of the proposal is done; step 2 is the open part.**

**Consequence for the proposal:** step 1 stays a two-line repair. Step 2 is no
longer an investigation but a choice — whether a census may ever be authored
rather than derived, which is the same question
`2026-08-07-no-check-validates-prose-section-citations.md` answers structurally
with a lint. That item is the durable fix; this one is its evidence.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
