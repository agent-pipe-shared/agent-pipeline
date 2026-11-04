# w160 — the ARA suite gets its case-completion registry row and policy, and the registry pins follow the measured counts (candidate 19)

Delta on w159. Elephant-built, in a clone that carries the whole chain. Found by running the real `harness/scripts/check-verify-case-completion.mjs` on the full-chain clone, not by the `cc-changed` helper (whose REJECTED verdicts were a tool artifact for suites with a declarative policy).

## Why

`analysis-run-command-admission-tests` (w148) registers its cases ARA001 to ARA003 with `registerTestCaseCompletion`, but it never got a completion-registry row or a `caseCompletion` policy. On the unchanged main tree the checker prints `valid: 388 entries`; on the full-chain clone it failed with `VULNERABLE-UNREGISTERED analysis-run-command-admission-tests`.

Running the checker's own test on the chain clone also showed that `VCR01` pins counts that the chain had already outgrown: the guard trailer refusal change (`27a57f72d`) adds one top-level assertion to `devplan-shell-lane-recovery-tests` (13 to 14). The same test is green on the unchanged main tree, so this is a chain defect, not a main-tree one.

## What it changes

- `harness/config/verify-case-completion.v1.json`: a `required` row for `analysis-run-command-admission-tests`.
- `harness/verify-suites.json`: the suite's `caseCompletion` policy (ARA001 to ARA003, `maxBytes` 65536).
- `harness/scripts/check-verify-case-completion.test.mjs` (QG-04, restated in its own hunk with the reason in the comment, nothing weakened): `registryCount` 388 to 389; the sites count of `devplan-shell-lane-recovery-tests` 13 to 14; the new suite added to `newlyCounted` (measured by the unchanged classifier: `top-level-assertions`, 14 sites) and to the post-R5 exclusion set. The pinned R8 identity digest and baseline count are unchanged.

## Checks

- Clone: `check-verify-case-completion.mjs` valid with 389 entries; `check-verify-case-completion.test.mjs` 32/32; `analysis-run-command-admission.test.mjs` green. `git apply --check` against the chain clone: exit 0.
- The registration checker still reports `control-plane-script-scan-tests` in the work clone; that is the w155 finding and the work clone does not carry w155. The chain rehearsal decides.

## Not proven

- No Full Verify; no independent Critic review (suspended by the PO).
- The rehearsal proves only that the patch applies and the two checkers pass on the resulting tree.
