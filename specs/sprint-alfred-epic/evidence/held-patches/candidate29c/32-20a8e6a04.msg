docs(adr): ADR-0096 a gate-definition change needs a bound proof at commit and at close (D248)

- PO tiles L4 (Claude test run 3): boundary-policy and fitness-model join the
  gate-strength table; the close walks the gate-definition set of the feature
  range, derives a proof per change and refuses an unproven one with no
  cut-off; the repair is one PO acknowledgement of the unproven list per range.
- Register line D248 in docs/state.md and the ADR index row.

AI-Assisted: true
Dispatch: stage-0 (elephant)
