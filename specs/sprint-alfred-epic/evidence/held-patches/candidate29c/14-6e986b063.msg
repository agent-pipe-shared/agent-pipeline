fix(close): stop on an earlier blocker or major marked fixed without a reviewed code change

Claude greenfield run 3 (L1): a feature closed with two round-1 majors
open. Round 2 changed only the Spec and passed, and the retained lineage
marks every open finding of the parent fixed on any pass. The acceptance
question named none of them. PO tile 2026-11-13: block and list,
mechanical route, no Critic re-pin.

- lib/close-commit-split.mjs: isProductCodePath, narrower than a product
  commit path (Spec, docs, architecture, project, agent configuration and
  evidence are not code).
- lib/critic-lapsed-findings.mjs (new, read-only): reads the retained
  course and names each earlier blocker/major marked fixed when neither
  that round nor any reviewed round after it changed product code or
  tests. A lapsed major is settled only by a PO residual acceptance of
  its origin round with the uncorrectable-past-authorship class; a
  blocker never. The lineage records stay as they are.
- close-coordinator: the close check refuses with
  CLOSE-CRITIC-EARLIER-FINDINGS-OPEN; critic-standing reports
  earlier-findings-open (with the repair) or passed with the settled
  findings.
- finish-feature --one-shot: stops with
  ONESHOT-CRITIC-EARLIER-FINDINGS-OPEN before anything runs, naming each
  finding, its round and both routes; the acceptance question names an
  earlier major the PO accepted as uncorrectable.
- Tests: lineage test block (path class, lapse, later code round,
  failed round, settling, unreadable course); finish-feature stop and
  question cases.

Checkpoint-Intent: candidate 29c, Claude run 3 L1
AI-Assisted: true
Dispatch: stage-0 (elephant)
