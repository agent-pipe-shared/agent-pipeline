---
schema: pipeline.backlog-item.v1
id: pipeline.nine-test-suites-run-in-no-verify-invocation
type: defect
owner: pipeline
status: closed
created: 2026-08-27
closed_at: "2026-08-27"
closure_repository: "self"
closure_commit: "4630dd26395c713432c378298e68f3e119b4e369"
closure_evidence: "harness/scripts/verify.mjs"
source: "SUITEGAP-1, scratch/SUITEGAP-report.md, 2026-08-27 — measurement via node plugins/pipeline-core/scripts/check-suite-registration.mjs"
---

## Closed — 2026-08-27

The item's own same-day correction reduced the real count from nine to
three — `check-adr-consistency.test.mjs`, `check-critic-contract-citations.test.mjs`,
`check-doc-reconciliation.test.mjs`. All three are now registered, in a
TP-3-protected path, so the registration went through a signed human guard
override. Re-run confirms no unregistered suites:
`node plugins/pipeline-core/scripts/check-suite-registration.mjs` →
`OK: 451 suite file(s) enumerated against 478 TEST_SUITES/SCOPED_VERIFY_SUITES/WINDOWS_ASSURANCE_VERIFY_SUITES entries; all registered or opted out with a reason.`

# Three test suites exist in the tree but run under no `verify.mjs` invocation

> **Correction, 2026-08-27 (same day, after re-verification against the live
> `verify.mjs`).** The count in this item's original title and body — nine — is
> wrong. It is **three**. Six of the nine are false positives: they ARE
> registered and demonstrably run, in a *scoped* registration block
> (`verify.mjs:146-180`) that `check-suite-registration.mjs` does not read.
> Confirmed green in the full run at `5fd963fc`:
> `scoped-verify-registration-tests`, `workflow-preflight-tests`,
> `interaction-continuity-tests`, `trusted-tool-resolution-tests`,
> `advisory-receipt-assurance-tests`, `toolchain-preflight-tests`.
>
> The three that genuinely never run: `check-adr-consistency.test.mjs`,
> `check-critic-contract-citations.test.mjs`, `check-doc-reconciliation.test.mjs`
> — zero matches for any of their names in `verify.mjs`. The first of those is
> the direct cause of the ADR-numbering collisions this item was filed to explain,
> so the traceability purpose stands; only the number was wrong.
>
> The checker disagreement itself is tracked separately as
> `pipeline.the-two-suite-registration-checkers-disagree`.
>
> Also note: `verify-suite-registration-check`, the checker that IS wired into
> Verify, reports 0 unregistered on the same tree — it did not surface these
> three either.

## Description

`node plugins/pipeline-core/scripts/check-suite-registration.mjs` (exit 1)
names nine `*.test.mjs` suites present in the repository that are not
registered in `verify.mjs`'s `TEST_SUITES` and are not listed as a
deliberate `DELIBERATELY_UNREGISTERED` exception either — they simply never
run as part of Verify. This is offered as the explanation for how six
ADR-numbering collisions landed unnoticed: coverage gaps of this shape are
exactly the kind of drift nothing catches until something else forces a
manual look.

## Measurement, 2026-08-27 (HEAD `027a5721`)

All nine suites were run individually (`node --test <path>`), all green, all
well under the 90-second slow-suite flag threshold, and `git status --short`
was clean after the run (no suite mutated the tree):

| Suite | Result | Companion CLI checker | Recommendation |
|---|---|---|---|
| `harness/scripts/check-adr-consistency.test.mjs` | 12 pass | `check-adr-consistency.mjs` exists | register |
| `harness/scripts/check-critic-contract-citations.test.mjs` | 21 checks pass | none separate; suite exercises the live corpus in-process | register |
| `harness/scripts/check-doc-reconciliation.test.mjs` | 22 pass | `check-doc-reconciliation.mjs` exists, needs `--base`/`--candidate` | register (confirm arg wiring during the ceremony) |
| `plugins/pipeline-core/lib/advisory-receipt-assurance.test.mjs` | 9/9 pass | library only, no CLI | register (tests-only) |
| `plugins/pipeline-core/lib/interaction-continuity.test.mjs` | 1 pass (32 subchecks) | library only | register |
| `plugins/pipeline-core/lib/scoped-verify-registration.test.mjs` | 35 pass | library only | register (see note below) |
| `plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs` | 15/15 pass | library only, fixture-based | register |
| `plugins/pipeline-core/lib/workflow-preflight.test.mjs` | 4/4 pass | library only | register |
| `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs` | 27/27 pass | `toolchain-preflight.mjs` exists but was not run directly (plausibly environment-mutating; TCP27 proves the load-bearing derivation function itself is mutation-free) | register the test suite now; CLI-script pairing is a separate, deliberately deferred question |

No suite in the batch is red; none needs `DELIBERATELY_UNREGISTERED`.

**Note on `scoped-verify-registration.test.mjs`:** its own SVR19–21 checks
assert that the *already-registered* SNT-7 scoped allowlist (three suites:
`scoped-verify-registration`, `workflow-preflight`, `interaction-
continuity`, fixed order) is exactly those three. That is a different
mechanism from this item's gap — registering this suite in `TEST_SUITES`
does not touch SNT-7, and the two should not be conflated during the
registration ceremony.

## Open wiring questions for the registration ceremony (not resolved by this item)

1. Exact `--base`/`--candidate` argument supply for
   `check-doc-reconciliation.mjs`'s companion `-check` registration.
2. Whether `toolchain-preflight.mjs`'s standalone CLI script (distinct from
   its test suite, and not itself one of the nine gap suites) should also
   get a `-check` pairing — that script was not run in this read-only
   measurement pass.

## Triage

- **Decision:** open, unassigned. Resolves once the maintenance window that
  installs the registration is run — this item exists for traceability
  (why the ADR-numbering collisions went unnoticed), not as new design work.
