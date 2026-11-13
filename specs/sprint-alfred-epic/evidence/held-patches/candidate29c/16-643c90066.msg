fix(close): settle earlier Critic findings by addendum, verified residual and carried-open state

Follow-up to the L1 close check, after review of the first cut:

- A finding named by an applied, registered Spec addendum (ADR-0095) is
  dispositioned: that is the sanctioned correction of a Spec defect and
  changes no code, so the first cut would have stopped it for good.
- The correction path follows the PO tile wording: any path that is
  not evidence or administration (the shared set) and not Spec text
  (isCorrectionPath replaces the narrower code/test rule).
- A blocker/major still carried open by the latest round is named too:
  a later round that failed only on its own minors, accepted by the PO,
  no longer ends the course past it. critic-standing reports it on a
  failed round as earlierOpen; the one-shot stops on it.
- A residual acceptance settles a major only when it verifies through
  the configured approval mode, and is matched through the origin
  round's raw finding: the lineage and the residual acceptance hash the
  same finding with different canonical forms, so the first cut's
  direct comparison could never match.
- critic-standing judges the course only when the bound round is the
  last registered one; otherwise it leaves it to the close's own check.
- Tests: a real retained course (preflight fixture rounds): spec-only
  passing round leaves both earlier majors unresolved, a later code
  round clears them, the bound-round gate; unit cases for the addendum,
  carried-open, verification and digest join; one-shot carried-open stop.

Checkpoint-Intent: candidate 29c, Claude run 3 L1
AI-Assisted: true
Dispatch: stage-0 (elephant)
