docs(adr): state ADR-0097 as built

- The red observation is maintenance-red-check.mjs observe, with its
  refusals; dispatch-briefing.mjs binding --maintenance only reads.
- The item id is <spec folder>.<item>; the check identity is what runs,
  never the dispatch id or the dependency list; a document check is
  never a maintenance check.
- The PO acknowledgement holds for each listed check for the rest of the
  feature under that plan approval.
- The deferred verify:configured row is checked at the close
  (CLOSE-MAINTENANCE-VERIFY-NOT-GREEN).
- The Critic packet does not list maintenance slices yet; the ADR no
  longer claims it does and names it as a known limit.

AI-Assisted: true
Dispatch: stage-0 (elephant)
