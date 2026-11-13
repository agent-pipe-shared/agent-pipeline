feat(close): require the repaired configured verify green at close (ADR-0097)

Third part of the K-28 maintenance dispatch route. The host cannot run
the configured verify at finalize, so it records that row deferred to
the close. The close now checks it.

- maintenance-delivery.mjs:
  - greenAfterDeliveryReceipt finds a sealed green configured-verify
    receipt whose commit lies strictly after the slice's red base commit
    and is contained in the close candidate;
  - maintenanceSlicesLackingGreenVerify walks the delivery course and
    names every non-cancelled maintenance slice with a verify:configured
    check that has no such receipt;
  - the receipt walk is shared with the red-before lookup.
- close-coordinator.mjs: plan-transition --phase feature-close-prepared
  refuses with CLOSE-MAINTENANCE-VERIFY-NOT-GREEN, on the plain and the
  audited route alike, naming the slice and the Verify command that
  produces the receipt. It only reads the Verify receipts.
- Tests:
  - the library suite: green at the base, green off the candidate, red
    after the repair and another suite are not the proof; a cancelled
    slice and a test-file check are not asked for one;
  - the close pin: the course fixture validates, the close refuses
    without the proof and leaves State and the coordinator
    byte-identical, and a green receipt at the repaired candidate lets
    the close plan.

AI-Assisted: true
Dispatch: stage-0 (elephant)
