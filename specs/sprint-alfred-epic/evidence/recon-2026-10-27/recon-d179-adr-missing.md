# Recon note: W6-D179-MISSING-ADR-DIRECTORY-C1-20261027

Earlier attempts bound to the item `sprint-alfred-epic.2026-10-26-brownfield-architecture-gate-never-passes`
(D167, D169, D170, D170B-C3) were cancelled as wrong-premise. Those cancellations concern other defects
(diagnostic evidence location, Windows dispatch lane, design folder rule). This slice does not continue any of them.
The item binding exists only because the briefing generator needs an item with an accepted criterion (AC-127); the real
defect is `pipeline.missing-docs-adr-directory-blocks-implementation-entry` (finding D8 of the same consumer handover,
and D4 of the brownfield gate item).

What the code shows (read before this briefing was written):
`plugins/pipeline-core/lib/architecture-effective-decisions.mjs` `inspectStructuralArchitectureDecisions` treats every
failure of the `docs/adr` directory check, an absent directory included, as `ARCH-DECISION-SOURCE-UNAVAILABLE`
(blocked). The backlog item names this as the cause and offers two repairs; this slice implements the first
(an absent directory means no recorded decisions) and keeps an unsafe directory blocked.

Corrected premise: the slice does not claim the whole brownfield gate is repaired, only the absent-directory half of D8.
Callers of the unavailable code may depend on the old behaviour; the briefing makes the goldfish read them and stop if
a test pins the old behaviour for an absent directory.
