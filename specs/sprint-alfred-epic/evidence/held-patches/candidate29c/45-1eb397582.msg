feat(maintenance): observe, bind and admit a maintenance delivery (ADR-0097)

Second part of the K-28 maintenance dispatch route. A consumer can now
repair a check that was red before the feature and that no Spec
criterion covers, with shipped commands only.

- The check identity is what runs: verify:configured, command:<id> or
  the .test file. The dispatch id and the dependency list are not part
  of it, so a check observed before any binding exists is the check the
  binding later names. A document check is never a maintenance check.
- New scripts/maintenance-red-check.mjs observe:
  - runs the check on the clean HEAD the way the host's targeted checks
    run it (the configured verify with a 30-minute timeout);
  - records the first result at that commit;
  - refuses, recording nothing, for an untracked test file, a dirty
    tree, no active feature, a timeout, a command the shell cannot run
    (126/127) and a run that changes the tree;
  - its help flags are in the guard's help list.
- dispatch-briefing.mjs binding --maintenance:
  - binds `maintenance` instead of a criterion locator, item id
    <spec folder>.<item>;
  - admits check verify:configured, bound like a command check to the
    calibration, which is never writable;
  - refuses a criterion, a document check, a non-test or specs/ path, a
    missing or green observation and a missing red-before proof, each
    with its repair. It only reads; it runs no check.
- Host admission:
  - the item delivery validator takes exactly one of criterionLocator
    or maintenance (one check);
  - the queue validator takes the maintenance delivery with the
    host-derived redProof (receipt, or the labelled PO
    acknowledgement);
  - prepareGovernedItemQueue refuses the scope, an unobserved check and
    an unproven one;
  - every binding comparator reads the maintenance binding with its
    check identity, so two maintenance deliveries of different checks
    never compare equal;
  - a scope amendment keeps the narrow scope;
  - a verify:configured row is recorded deferredTo close-verify (the
    close check follows separately).
- The PO's acknowledgement text now states its scope: each listed check
  for the rest of this feature under this plan approval.
- Tests:
  - the library, script and briefing suites;
  - an end-to-end leg in the consumer pin: observe, refused binding,
    chat acknowledgement (HEAD and tree unchanged), binding, host
    admission with the derived proof, a refused product path, and a
    green host-run check after the repair.
  - The library and script suites are registered in verify-suites.json.
    The inventory categories follow at the stamp.

AI-Assisted: true
Dispatch: stage-0 (elephant)
