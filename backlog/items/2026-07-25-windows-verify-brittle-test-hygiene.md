---
schema: pipeline.backlog-item.v1
id: pipeline.windows-verify-brittle-test-hygiene
type: defect
owner: pipeline
status: open
created: 2026-07-25
source: Decision-D native-Windows verify baseline investigation, 2026-07-24 (docs/state.md "Root-cause classification of the 11 reds").
---

# pipeline.windows-verify-brittle-test-hygiene

## Description

Two of the eleven suites that fail on a native-Windows `verify` run are not
real Windows-portability defects but stale/brittle test assertions that
happen to be sensitive to this host/tree:

1. `license-contract` asserts a hard-coded JS-source count (`384`) while the
   current tree has `438` sources — yet the real `license-contract-check`
   itself is GREEN ("349 sources; SUL-1.0"). The suite's own fixture count
   drifted out of sync with the tree, unrelated to any platform behavior.
2. `feature-package-topology` crashes on `false !== true` while reading
   package topology, sensitive to the legacy `sprint-sentinel-epic` specs
   still present in-tree.

Both are test-hygiene fixes (update stale fixtures/assertions), not
product-code changes, and are explicitly *not* part of the real native-Windows
DACL/durability or trusted-tool-resolution scope.

## Triggering situation

Found during the decision-D native-Windows verify-baseline root-cause
classification (`docs/state.md`, entries around "Root-cause classification of
the 11 reds (this decides scope)" and the later correction "brittle tests
(feature-package-topology, license-contract)"), 2026-07-24.

## Affected artifact

The `license-contract` and `feature-package-topology` verify suites
(exact file paths per `harness/scripts/verify.mjs` suite registration — not
yet enumerated here; the next Elephant scoping this fix should locate the
concrete fixture files first).

## Proposal

Update the `license-contract` suite's hard-coded source count to be derived
from the same source-of-truth the real `license-contract-check` already uses
(or otherwise made self-consistent) rather than a second hard-coded number.
Fix `feature-package-topology`'s package-topology read so it does not assume
the absence of archived/legacy spec directories. Bundle both fixes into the
Windows/sandbox-assurance slice as a low-risk, high-confidence quick win —
they do not depend on the DACL/durability or path-canonicalization work and
can land first. No fix applied yet.
