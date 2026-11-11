feat(close): route a declined acceptance back into a correction round

- finish-feature --human-decline "<literal answer>" (exclusive with
  --human-acceptance) records the human's words with the candidate and
  the time under specs/<feature>/evidence/, never read as an acceptance,
  retires the bound Result and returns status declined with the commit,
  the correction dispatch, a Critic delta round and the identical close
  as next steps (held patch C28-DECLINED-ACCEPTANCE-ROUTE, Goldfish-built).
- Only the one fixed yes form counts as acceptance; any other answer
  stops ONESHOT-ACCEPTANCE-NOT-YES and records nothing.
- pipeline-state continuity-result-retire-plan / -apply: the Result
  binding moves into continuity.resultRetirements, result.md returns to
  its text before the bootstrap block, the package is reconciled
  result-only; on the owner route in a catalogue project (six entries).
- reopen-design with a bound Result refuses PLAN-REOPEN-RESULT-BOUND and
  names the decline route instead of ending in PLAN-SUBMIT-CONTINUITY-BUSY.
- Elephant: owner-route comments and the close-feature skill name six
  entries.

AI-Assisted: true
Dispatch: stage-0 (elephant)
