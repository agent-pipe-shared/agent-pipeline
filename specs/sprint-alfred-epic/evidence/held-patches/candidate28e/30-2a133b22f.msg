docs(adr): accept ADR-0095, a Spec correction during implementation is a signed addendum

PO tiles 2026-11-13 (one 28e; the Spec addendum as its own file). A
Critic finding against the approved Spec had only reopen-design as a
route, which voids the design approval; the guard now reserves that
verb for the PO.

- docs/adr/0095: the addendum file under specs/<feature>/, its strict
  three-line header (base Spec digest, Critic packet, finding ids), no
  criterion change in v1, one PO approval per addendum in the
  gates.human_approval mode, the approval as committed evidence, the
  delta round over it, the one reader every consumer uses, stacking,
  and the distinct name
- docs/adr/README.md: index row
- docs/state.md: register entry D245

AI-Assisted: true
Dispatch: stage-0 (elephant)
