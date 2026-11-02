# w96 — the runner capability table states the honest observation boundary, and the carrier refusal prints the prepare command (candidate 18, A18-M6 and the rest of A18-M3)

Binding: AC-239 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- One row, "Observation boundary", in `config/runner-capabilities.json`, with one sentence per runner (claude, codex, antigravity), and the same row with the same sentences in the guide table of `skills/pipeline-start/references/happy-path.md`.
  Each sentence says the boundary is tool-level (the guard judges the runner's own tool calls) and that an admitted `node` script can still read outside the repository. Where a runner's behaviour is not known (codex worker scripts, antigravity scripts) the sentence says "not measured". No sentence claims containment.
- The refusal `DISPATCH-WRITE-CARRIER-REQUIRED` in `hooks/guard-dispatch.mjs` appends the Antigravity prepare command `node <plugin-root>/scripts/antigravity-native-dispatch-prepare.mjs prepare --root <repo> --request <file>`, matching the script's real argv. All earlier text is unchanged.
- Tests: a new case in `scripts/runner-capabilities.test.mjs` (row exists, no 'hermetic' / 'sandbox' / 'isolated', each sentence states its level or "not measured", guide carries the same row); a new case in `hooks/guard-dispatch.test.mjs` (refusal names the prepare command) and the corpus count pin raised from 81 to 82 to register it.

## Checks (inside the slice clone)

- `runner-capabilities.test.mjs`: 5 of 5 (new case red before the row existed, green after).
- `guard-dispatch.test.mjs`: 82 of 82.
- `greenfield-machine-output-and-skill-budget.test.mjs`: 15 of 15. `check-consumer-safe-paths.test.mjs`: 9 of 9.
- `w96-...check.test.mjs`: patch exists, applies to the repository root, touches only the five named files.

## Not changed / not proven

- No guard admits anything different; the observation boundary itself is unchanged, only described.
- The "not measured" cells are not measured here either; nothing was run on Codex or Antigravity.
- The full Verify run was not made.
