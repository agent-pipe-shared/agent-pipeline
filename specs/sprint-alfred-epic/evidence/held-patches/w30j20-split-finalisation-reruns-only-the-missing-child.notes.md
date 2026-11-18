# w30j20 — a split Critic run that lacks one child names that child and the step that dispatches only it (candidate 30j)

Applies AFTER the integrated 30i tree: it is a delta on that state (the clone base) and does not apply to the real checkout before it. Order: 30i tree, then J20.

## What it changes

- `session-critic-finalizer.mjs`: the refusal `SCF-SPLIT-CHILD-MISSING` now carries a first line that fits the CLI cut (the CLI keeps the first line, 200 characters, and turns anything that starts with a slash into `<path>`): the missing entry ids (all of them; when the list would not fit, the first ones and "and N more"; one id longer than the room is clipped, never the step), then `repair: dispatch ONLY those Critics (split.entries of critic-dispatch-preflight.mjs), then critic-split-merge.mjs --packet <id>, finalize`. The old alternative (release the packet, open the next round with a new packet id) moves to a second line, so the library message still carries it. New export `splitChildMissingMessage(ids)` builds the text; the refusal code and the check that raises it are unchanged.
- Tests (`session-critic-finalizer.test.mjs`, two new cases, RED first on the original code):
  - a split of three children with two Source returns is refused naming exactly the missing child and the step, none of the returned ones, and no `<path>` mangling;
  - the second action after the error: the preflight still prints the missing entry (`split.entries`, scope marker), only that child returns inside the same packet, `critic-split-merge.mjs --packet` merges, and the identical finalize completes as `source-issued-origin` (the refusal wrote nothing; the packet of a split stays open for every child);
  - two missing children are both named; a list of 40 ids and one 120-character id keep the whole step inside 200 characters.
- `session-critic-finalizer-read.mjs` is in the write list but needed no change.

## Why

Consumer report: one Critic group of a split round was dispatched three times (about 400000 output tokens, about 2 hours) because the finalisation stopped with SCF-SPLIT-CHILD-MISSING and named no way to rerun only the missing child. Recon: the missing ids were already derived from the bound records (`context.split.entries` against the records), but the old first line was already about 200 characters and its repair ("run that entry's Critic") named no command. No verb dispatches a Critic by itself (a dispatch is an agent call built from the template), but `critic-dispatch-preflight.mjs` prints every entry (`split.entries`: reviewerInput, batchScopeLine, scopeMarker) and the packet stays open for every child (the stop issues one record per returning child), so the named step uses existing verbs only. Nothing is stored; the text is derived from the records on every refusal.

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- `session-critic-finalizer.test.mjs`: RED on the original code, 127 of 129 pass (the two new cases failed on the old wording and on the missing export); GREEN after the change, 129 of 129 (run in the clone with the clone-slice test helper).
- The check test of this patch asserts only that the patch exists and touches only the three briefed files.

## Not changed

- No change to what counts as a passed Critic receipt, to a digest, a record shape, a key byte or an independence check; no stored status; the caller-authored fallback flag stays refused as before. No gate, signature, approval or evidence semantics.
- `SPLIT_NEXT_ROUND_REPAIR` (`lib/critic-split.mjs`), `CSM-CHILD-MISSING` of the merge and the SPLIT notice of `critic-dispatch-preflight.mjs` are outside the write list and untouched.

## Not proven

- Integrated Verify, Critic review and PO acceptance are pending (Coordinator).
- The tests simulate the child's return through the Source stop hook; a real Critic dispatch into an already-admitted packet is not exercised.
- Report only: the SPLIT notice of `critic-dispatch-preflight.mjs` offers a hand merge (`--split` and `--child`) "only for a child without a Source return". Finalize then refuses a round that mixes Source returns with a hand-merged child, which is probably how a round reaches this refusal; that wording is outside the write list.
- Report only: a child that returned without a Source return (no scope marker, no schema-shaped verdict) leaves a reason in the packet (`readCriticReturnProblems`); the merge prints it, the finalize refusal does not. Left untouched (library file outside the write list).
