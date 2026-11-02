# w97 — a routine repair keeps a pointer from the moved record to the commit (candidate 18, C18-18B)

Applies after w76, w90, w95 and w96-c18-1e, in that order: the patch is the delta on that chain (it edits the same files) and does not apply to a checkout without it. Criterion binding: AC-253 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/native-goldfish-host-state.mjs`: the settle classification is split into an internal scan that also records the integrating commit per slice. `readOrchestratorCommitIntegratedSlices` keeps its signature and returns the same slice-id array (a fresh copy, as before). A new exported sibling `readOrchestratorCommitIntegratedCommits` returns a `Map` of slice id to the 40-hex commit found by direct evidence. Only that function and its new sibling changed; the host-commit chain regions are untouched. A slice released as a superseded stopped attempt has no commit of its own and is absent from the map.
- `scripts/session-authority-repair.mjs` `reservationReport`: each row gains `commit` (the 40-hex id when the settle reason is `integrated-by-commit`, else `null`).
- `lib/routine-repair.mjs`: `planSettledPending` carries `dispatchId`, `sliceId` and `commit` per retired entry (so `retiredPending` in the result has them), and the ledger record (`pipeline.routine-repair-record.v1`, schema id unchanged) gains an added key `retiredPending` with `{name, settled, dispatchId, sliceId, commit}` per moved pending record, present only when a pending record was moved. Keys are added only; which records move or stay is unchanged.
- `skills/critic-review/SKILL.md`: one sentence at the dispatch gate stating the call shape of the preflight.
- New case in `lib/routine-repair.test.mjs`: an integrated-by-commit settled pending yields a `retiredPending` entry and a ledger entry with dispatch id, slice id and the 40-hex commit; a cancelled settle has `commit: null`. It failed before the production edit and passes after it.

Callers of `readOrchestratorCommitIntegratedSlices` (all keep working unchanged): `lib/close-authorship-record.mjs`, `scripts/session-authority-repair.mjs`, four sites inside `lib/native-goldfish-host-state.mjs` (admission memo, cancel guard, readiness, prescan), and `lib/native-goldfish-host-state.test.mjs`.

## Deviation to know about

The briefing asked SKILL.md to name the "positional grammar of the critic-dispatch-preflight call" and to say the key-value form is not accepted. In the code, `critic-dispatch-preflight.mjs` is flag based (`--root --base --candidate --spec`, and `--range` is refused); the positional grammar belongs to the skill's own `$ARGUMENTS`. The added sentence therefore states both facts accurately instead of describing the preflight as positional.

## Not changed / not proven

- No RR-* code, heal behaviour, settle rule or moved/retained decision changed. The ledger gains a key; readers of the older shape are unaffected.
- Not proven here: the full Verify, and a live run against a real settled pending state with a real commit (the case uses a stub inspect result with a 40-hex commit).
