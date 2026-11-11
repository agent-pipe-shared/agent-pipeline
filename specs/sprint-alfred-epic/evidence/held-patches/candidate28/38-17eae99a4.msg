feat(ledger): print a run timeline for all three runners

- usage-ledger.mjs --timeline <file> [--json] reads one Claude, Codex or
  Antigravity transcript and prints human turns, turn durations, human
  wait, net run time, per-response usage with actor and refusals per code
  (held patch C28-FORENSICS-TIMELINE, Goldfish-built).
- Checked by the Elephant on the real candidate-27 runs and corrected:
  a Claude compact summary or task notification is no human turn; a
  message written before any answer leaves no wait instead of voiding the
  total; a Codex rollout records human input as a provenance-user
  response item; a refusal code is taken from the guard's own denial or a
  typed refusal, never from a success or warning code in output text.
- transcript-forensics.md names the admitted read route (Explore with a
  model, or the Elephant running --timeline).

AI-Assisted: true
Dispatch: stage-0 (elephant)
