fix(design): make lib/spec-addendum.mjs a leaf module (ADR-0095)

spec-addendum.mjs imported critic-accepted-contract.mjs, which imports
pipeline-state.mjs, which imports po-human-approval.mjs, which reads
SPEC_ADDENDUM_KIND at module load. With an entry point that loads
spec-addendum.mjs first (the Goldfish briefing generator) the cycle left
the constant uninitialized and every such command died with a
ReferenceError, --help included.

The module now imports node built-ins only. The criterion id pattern
and the receipt canonical JSON are restated; SA-07 pins both equal to
their owners and pins the import list to node: built-ins.

Tests: spec-addendum.test.mjs (SA-07 added); dispatch-briefing and
prepare-dispatch 203/203 (6 failed before); cli-help, po-human-approval,
po-approval-gate, signing ceremony, signing hand-off and the signature
round-trip 273/273.

AI-Assisted: true
Dispatch: stage-0 (elephant)
