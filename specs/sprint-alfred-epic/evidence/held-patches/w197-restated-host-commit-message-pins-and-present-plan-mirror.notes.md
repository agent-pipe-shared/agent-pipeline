# w197 — three pins restated after w170 and w180 (candidate 19c, QG-04)

Found by the first Full Verify of the whole 19c chain. All three suites are green in the main tree and red on the chain; the production logic is kept, the pins follow it.

- `native-goldfish-host-commit-execution.test.mjs` (NGHC04) and `native-goldfish-host-finalizer.test.mjs` (NGHF01-DEEP): w170 replaced the "Interim route ... Dispatch: <dispatchId> (goldfish) trailer" advice of the pending-unavailable message with the `goldfish-host-commit-recover.mjs plan/apply` route. The pins now require the recover helper, "one ordinary commit with the dispatch trailer", the typed orchestrator-attested record and the sentence that `dispatch-record-write.mjs` still refuses a v4 authored-commit Claude record. The `not host-observed evidence`, `no NGHS- code` and `does not recommend the record writer` assertions are unchanged.
- `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs`: w180 added a `prepare-seal` branch to `sanctioned-args-scripts.mjs` that spells the duplicate-receipt check exactly like `present-plan`, and it comes first. The mutant mirror of the "without the duplicate check" case replaced only the first occurrence and so mutated the wrong branch; it now removes every occurrence.
- Evidence on the work clone: 7/7, 48/48 and 24/24.
