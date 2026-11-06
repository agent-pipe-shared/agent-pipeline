# w249: the new test suites of candidate 19k are registered

Elephant-built (2026-11-06), on the chain clone with w245, w246, w247 and w248 applied (clone base 3fb91c3ad on 7f33ff928).

## Found

- The registration checker reported `UNREGISTERED plugins/pipeline-core/scripts/agent-guidance-w247.test.mjs` (w247's new cross-cutting guidance suite).
- The stop-pair suite now declares 13 case ids (NGSP1 to NGSP9D, the new ones from w245 and w246), while its row policy listed only the six from 19j.
- VCR01 failed because the stop-pair suite's measured top-level assertions grew from the pinned 32 to 66.
- The classifier does not count the w247 suite (it emits no case stream), so it needs no case-completion policy and no new VCR01 row.

## What it changes

- `harness/verify-suites.json`:
  - New entry `agent-guidance-w247-tests`.
  - The stop-pair row's `caseIds` gain NGSP6, NGSP7, NGSP8, NGSP9, NGSP9B, NGSP9C and NGSP9D.
  - Its `invariantPinned` names the w245 and w246 invariants.
- `docs/product-capability-inventory.json`: the new suite's `verify-phase` surface, in alphabetical position.
- `harness/scripts/check-verify-case-completion.test.mjs` (QG-04, restated in place with equal strictness): the stop-pair pin goes from 32 to 66, the count the unchanged classifier measures now. Nothing else changed, and no assertion was weakened.

## Checks (chain clone)

- `check-verify-suite-registration.mjs`: complete, 1183 registered, 0 unregistered.
- `check-verify-case-completion.mjs`: valid, 392 entries.
- `check-verify-case-completion.test.mjs` together with `agent-guidance-w247.test.mjs`: 36/36.
- Stop-pair suite run the Full Verify way (descriptor 3): exit 0, 13/13 pass, and the stream is accepted against the 13-id row policy.
- `git apply --check` against the repository: exit 0. The three files are untouched by w245 to w248.

## Not proven

- No Full Verify of the applied state.
- An earlier stop-pair run under parallel load once failed NGSP7 at release (`native-managed-unknown-native-entry`); repeat runs were green. That flake is still open.
