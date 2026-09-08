# ADR-0050 Governs: commit-bound reconciliation proof

`node scratch/NVA-B-ADR-GOVERNS-BINDING-PROOF-1/check.mjs` exited 0 in a
disposable Git repository below `scratch/`. The driver copied the then-current
bytes of ADR-0050 and changed only its declared
`harness/scripts/verify.mjs` path in fixture commits. It invoked the real
`checkDocReconciliation` API with fixture refs; it did not use a source-repo
candidate, source-repo ref, or the source reconciliation ledger.

The machine result records the hashes of the source ADR and checker read by the
driver, the fixture-only commit identities, and the exact findings:

- absent committed record, uncommitted otherwise-correct record, and a record
  for an older candidate each produced `UNRECONCILED-ADR`;
- a record ref outside the candidate's descendant history produced both
  `RECORD-UNAVAILABLE` and `UNRECONCILED-ADR`;
- an exact candidate entry committed in a descendant record ref passed; and
- that newer-candidate entry could not reconcile the older candidate.

The fixture driver removed its disposable Git repository before returning. The
sanitized terminal capture is
`scratch/NVA-B-ADR-GOVERNS-BINDING-PROOF-1/check-capture.txt`; the driver’s
machine-written result is `scratch/NVA-B-ADR-GOVERNS-BINDING-PROOF-1/result.json`.
This is an isolated checker acceptance proof, not a candidate review or release
receipt.
