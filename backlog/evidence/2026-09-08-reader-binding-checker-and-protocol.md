# Reader-binding checker and protocol implementation

This artifact records the bounded implementation package only. It creates no
reader verdict, live reader-review record, or phase report for the repository.

The checker reads only committed Git objects and verifies that a fixture or a
future feature-owned closure record binds final reviewed state `Y` to candidate
`C`. Its assurance is explicitly limited to committed-state equality and
evidence presence. The separate protocol defines the two fresh reader stages,
immutable reports, and a closed disposition schema.

Verification: `node --test harness/scripts/check-doc-contracts.test.mjs` ran
with 65 passing tests, including the final `open` disposition-status rejection
and the valid nonempty disposition with a real ancestor resolution commit plus
a no-change/null finding. The machine output is stored at
`evidence/NVA-B-READER-BINDING-CHECKER-1-doc-contracts.json`. That ignored,
machine-generated file is the exact command output; this tracked note is its
durable readable pointer.
