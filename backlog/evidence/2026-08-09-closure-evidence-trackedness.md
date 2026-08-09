# The closure contract now binds its evidence to the index, and the sweep it asked for returned zero

Date: 2026-08-09
Closes: `pipeline.over-broad-ignore-rule-swallows-closure-evidence`
Closing commit: `f9d52fe33b7797c7c86eea1bd93c35b0458d26a0`
Anchoring commit (leg 1, earlier): `4be63c87bb43d09139ffd9480f40aa53d04d9c1d`

## The three legs the item named, and where each one landed

**1. Anchor the rule.** `.gitignore:34` reads `/evidence/`. The unanchored
`evidence/` matched a directory of that name at any depth, so it swallowed
`backlog/evidence/` — the one location the closure contract requires — and
`specs/*/evidence/`. Done before this session, in `4be63c87`, with the reasoning
left in the file above the rule.

**2. Make the gate check trackedness, not presence.** Done in `f9d52fe3`. The
item called this "the half that prevents recurrence; the anchoring alone does
not," and that is exactly the split: anchoring stops `git add` from refusing,
while nothing stopped a closure from citing a file that was simply never staged.
That direction was the silent one. The local run stayed green because the file
existed on the closing machine's disk; every other checkout got a closure bound
to evidence it could not read.

`repositoryTrackingState(root, repoPath)` in
`plugins/pipeline-core/scripts/check-backlog-state.mjs` is the single owner of
the answer. `reconcile-backlog-ledger.mjs` imports it instead of carrying its own
copy — a producer and its consumer each holding a private copy of the other's
assumption is the recurring defect shape this repository recorded twice in
GF-057, and it is avoidable here for the cost of one import.

It is three-valued: `absent` / `untracked` / `tracked` / `indeterminate`.
`git ls-files` cannot answer outside a work tree or without a git binary, and a
project that keeps a backlog without Git must not be told that all of its
citations are broken — there the question is unavailable, not answered no. Only
`untracked` becomes a finding.

Four call sites:

| Site | Why it is there |
|---|---|
| `checkBacklogState`, closed-item loop | The standing sweep. Re-reads every closed item on every run, so a bad citation cannot be recorded once and then never looked at again. One `git ls-files` call covers all of them. |
| `applyBacklogTransition`, closure branch | Refuses before the append-only ledger is written — the last moment a refusal is still cheap. |
| `applyBacklogEvidenceAmendment` | Same, for an amendment's replacement evidence. |
| `reconcile-backlog-ledger.mjs`, `closureFindings` | The path this repository's own closures actually take. |

Trackedness is index membership, not `HEAD` membership. The ordinary flow —
write the evidence, stage it, reconcile, commit everything in one commit — is
therefore unchanged; only never staging it at all is refused. `RBL14` pins that
property directly, because binding to `HEAD` would have broken the workflow
while looking equally correct.

The refusal names the command that clears it (`git add <path>`), and `RBL13`
asserts on that text rather than only on the refusal, per the standing check this
block earned: not only "does it refuse correctly" but "where does the refusal
send the reader, and is that route open in this state".

**3. Sweep the existing closures.** Done, and the count is **zero**: 27 closed
items, none citing an absent or untracked path. The item guessed "it may well be
zero" and it was. The sweep is not preserved as a script — the checker's
closed-item loop is now that sweep, and it runs on every Verify rather than once.

## What was measured, at the closing commit

- `plugins/pipeline-core/scripts/reconcile-backlog-ledger.test.mjs` — **15/15**,
  exit 0. New: `RBL13` (present-but-untracked is blocked and nothing is
  written), `RBL14` (staging alone clears it, no commit required), `RBL15` (the
  reader is three-valued; outside a work tree it answers `indeterminate`).
- `plugins/pipeline-core/lib/backlog-state.test.mjs` — **31/31**, exit 0. New:
  `BS24` (the checker refuses an untracked citation and the projection writer
  refuses with it; staging the file clears both).
- `plugins/pipeline-core/scripts/check-backlog-state.mjs` — green on this
  repository: "Backlog state, transition ledger, closure evidence, and generated
  projections are valid."
- Not-broken checks on the modules that import the checker:
  `backlog-delivery-reconciliation.test.mjs` 20/20,
  `reconcile-backlog-delivery.test.mjs` 6/6,
  `migrate-backlog-state.test.mjs` 2/2.

`RBL01` ("this repository needs no reconciliation") passing is a second,
independent confirmation of the leg-3 result: it runs the real reconciler,
including the new trackedness branch, against the real backlog.

## What this closure does not decide

Whether onboarding should append `scratch/` to a consumer project's `.gitignore`
is still open and unrelated to this item; it is carried in its own backlog item.
