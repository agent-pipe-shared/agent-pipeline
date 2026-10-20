---
schema: pipeline.backlog-item.v1
id: pipeline.an-elephant-cannot-dispatch-a-small-fix-during-implementation
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "PO decision D60, 2026-10-20 (Q16): the fixes found while finishing the 0.7.0 Alfred test candidate had no admitted Goldfish route"
sprint: none
done_when: manual
---

# An Elephant cannot dispatch a small fix during implementation

## Description

During implementation, every productive Goldfish dispatch needs item admission: the item needs an
acceptance row in the signed Spec that names its backlog file (`dispatch-briefing.mjs`,
`DBG-AC-ROW-MISSING`), and the guard then requires that item's delivery (`SQ-DELIVERY-REQUIRED`).
A defect found while finishing a candidate, a small addition, or a correction outside a Critic
finding has no such row. Adding one changes the signed Spec and needs a new PO approval.

So the Elephant either asks for a recorded EL-01 exception and builds the fix itself, or it folds
the fix into an unrelated item whose row exists. Both were used on 2026-10-19 and 2026-10-20
(D51 (4), D55 Q11, D57 Q14). The PO's call (D60): "Ein Elephant muss in implementation auch
dispatchen können wenn kleine sachen dazu kommen oder fixes nötig sind."

D56 (1) already names the missing part: a dispatch route for cross-cutting work without a Spec
criterion comes later.

## Proposal

The PO suggests "eine zusatz datei zur spec die nicht so guarded ist aber referenziert, oder gerne
noch besser umsetzen". One shape: the signed Spec names one supplement file by path. The
supplement holds dispatchable fix rows (id, scope paths, acceptance, source). Adding a row needs no
new signature, but every row is bounded (paths, size), audited, Critic-reviewed with its batch, and
listed at close, so a supplement cannot widen the approved product scope unseen. The mechanism is a
PO design decision before it is built.

## Acceptance

- During implementation the Elephant can dispatch a Goldfish for a fix or small addition that has
  no row in the signed Spec, through a typed route that names its scope and records its source.
- The route cannot change the signed product scope without the PO: what it may admit is bounded
  and visible in the close report.
- A test covers an admitted supplement fix and a refused out-of-bounds one.
