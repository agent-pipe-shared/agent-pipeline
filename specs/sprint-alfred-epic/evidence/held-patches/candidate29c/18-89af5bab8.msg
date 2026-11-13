feat(design-review): delta rounds until pass, and no presentation over an open review

Claude test run 3, finding L3: a design approval was signed over a
readiness review that still had findings open. PO tiles 2026-11-13:
delta rounds until pass (the two-round cap of ADR-0085 falls, as the
Critic cap did with D190), and present-plan refuses until a round passes.
ADR-0085 is amended (D246).

- Receipt: a delta follows any round (round = previous + 1);
  DESIGN_REVIEW_MAX_ROUNDS is 64, only the structural chain bound.
  nextRound of a source drift is the round plus one.
- Consistency check: the chain is checked pair by pair (kind, round =
  position, link by path and digest). A delta over unchanged sources
  that withdraws findings (PO 2026-11-09) is now a valid link: its
  summary key was refused before, so such a chain never bound.
- Binding: up to 64 receipts; decision Z applies after any delta round.
  Bindings over one or two receipts are byte-identical.
- present-plan: new entry-gate check PLAN-DESIGN-REVIEW-OPEN names the
  open ids and the delta route and writes no request. Presentation gate
  only: an approval already signed over open findings keeps verifying.
- The whole chain is passed: present-plan, prepare-seal and their guard
  grammar take up to 64 receipts (REVIEW_CHAIN_MAX_RECEIPTS, pinned
  equal to the receipt bound); repair texts, runbook and the design
  course say so.
- Tests: three-round chain, withdrawn delta, skipped and misnumbered
  links, the bound, Z after round 3, the e2e refusal (DABX015); the pins
  that held the cap now hold the new rule.

Checkpoint-Intent: candidate 29c, Claude run 3 L3
AI-Assisted: true
Dispatch: stage-0 (elephant)
