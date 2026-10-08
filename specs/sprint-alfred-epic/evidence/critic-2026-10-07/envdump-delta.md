# Critic — ENVDUMP delta over the staged tranche-1 lane (lane f03cfa195 → 93aad15d0; pins 189e6a33e)

Route claude-opus-5-5, functional-equivalent-read-only. PARTIAL (the Critic's data-only probe aborted the Node process
with a fatal out-of-memory on an adversarial `env` chain; then the budget checkpoint). Pass/fail withheld. T1-F1
resolved by code reading and `evidence/t1-f1.txt` (50/50).

## Findings

- ENV-D1 (blocker by consequence): the delta made `dumpRule` recurse on the `env` operand (and `envCommandOperand`
  recurses on `-S`/`--split-string`) with no depth or length bound and O(n²) slicing (`lib/guard/env-dump-lane.mjs`
  ~270-274); the call site in `lib/guard/evaluate.mjs` ~83-87 has no try/catch and runs before the grammar gate. A long
  `env env … printenv` chain crashes the hook process; a PreToolUse hook that crashes (exit other than 2) does not block,
  so the refusal fails open. QG-09.
- ENV-D2 (minor): `withRebaseAuthorityDisclosure` (`evaluate.mjs` ~49-60) appends rebase-route text to every exit-2
  verdict, including this "nothing is advertised" refusal. Informational only.

## Dispatcher disposition (2026-10-08)

Ruling 51: the `env` operand recursion is bounded (nesting depth 32; beyond it the command is refused as a dump,
label `env-nesting-limit`), operand slicing is index-based (linear), and `evaluate.mjs` wraps the env-dump classification
so any exception yields the `GUARD-ENV-DUMP` refusal (fail closed). Pins T1-T3 first, then the fix inside the lane;
dispatcher self-verifies (this was the delta round). ENV-D2 accepted (no lift results). PO decision AY moves ENVDUMP to
tranche 2; the staged lane travels as `../../signed-package/tranche-1/envdump-staged-2026-10-08.patch`.
