# w96 — the attempt-terminal binding accepts the typed moved-HEAD lineage (candidate 18, C18-1E)

Source binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

**Apply order.** This patch is a delta on top of w76, w90 and w95 (it edits files they edit). Apply w76, then w90, then w95, then this patch. It does not apply to a checkout that lacks them, and its check test therefore does not run `git apply` against the repository.

## What it adds

- **The failing operand, identified by inspection of the condition against the NGHF36 receipt shape and confirmed by the finalizer run (NGHF36 ends `NGHF-AUTHORED-RECORD-VERIFIED` after the change); the live fixture was not instrumented.** In `writeNativeGoldfishAttemptTerminalAssociation` (`dispatch-record-write.mjs`) the operand `receipt.schema !== ...observation.v3 && receipt.parent !== binding.candidateCommit` compared the receipt parent with the original briefing candidate. A Claude receipt on a moved HEAD is not a v3 schema and its parent is the admitted sibling HEAD, so the check raised `attempt-terminal-binding` / `original admission lineage changed`. Every other operand of the condition holds for that receipt (the receipt `candidateCommit` is still the briefing candidate) and was left exactly as it was.
- **New exported predicate `nativeAttemptTerminalParentBound({ receipt, binding, root })`**, used in place of that single operand. It is true for a v3 receipt or a receipt whose parent equals the briefing candidate (unchanged behaviour), and otherwise only when the receipt carries `movedHead` with exactly `{ admittedHead, baselineCommit }`, `baselineCommit === binding.candidateCommit`, `admittedHead === receipt.parent` (a 40-hex OID) and the candidate is an ancestor of the parent (`git merge-base --is-ancestor`). Anything else keeps the same refusal and message.
- **Test.** DRW45 in `dispatch-record-write.test.mjs` (real temporary git repository): original parent accepted; descendant parent without evidence refused; typed descendant accepted; wrong admitted head, wrong baseline, incomplete or extra evidence keys refused; a parent that is not a descendant of the candidate refused. It was RED against the original code (the predicate did not exist) before the production edit. The corpus count assertion moves from 44 to 45 for the added case; no existing case was changed.
- The finalizer suite (NGHF36 asserting `NGHF-AUTHORED-RECORD-VERIFIED` with the sibling HEAD as parent, NGHF37-NGHF40) is not edited.

## Checks (clone, serial)

See the dispatch report for the printed counts of the dispatch-record-write, finalizer, return, admission and consumer-safe-path suites.

## Not changed / not proven

- `native-goldfish-host-state.mjs`, the observation validator, the admission and every refusal code are untouched.
- Not proven against a real consumer run with several parallel Goldfish. The full Verify was not run.
