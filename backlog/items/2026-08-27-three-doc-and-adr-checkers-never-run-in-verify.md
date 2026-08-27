---
schema: pipeline.backlog-item.v1
id: pipeline.three-doc-and-adr-checkers-never-run-in-verify
type: defect
owner: pipeline
status: open
created: 2026-08-27
source: "SUITEGAP-1 measurement 2026-08-27, re-verified against the live verify.mjs the same day; three of the nine reported suites are genuinely absent, six were false positives"
---

# Three doc and ADR consistency checkers have never run in Verify

## Description

`harness/scripts/check-adr-consistency.test.mjs`,
`harness/scripts/check-critic-contract-citations.test.mjs` and
`harness/scripts/check-doc-reconciliation.test.mjs` appear nowhere in
`harness/scripts/verify.mjs` — verified by direct search, zero matches on any of the
three names. Neither the suites nor their companion CLI checkers are invoked by the
gate.

This is the concrete explanation for a symptom that had been noticed without a cause:
six ADR number collisions landed unnoticed. The checker that would have caught them
exists, is green today, and has simply never been wired in.

All three were measured on 2026-08-27: each passes against the real corpus, each
completes in under a second, and none mutated the working tree.

## Triggering situation

A registration audit on 2026-08-27 (`scratch/SUITEGAP-report.md`) reported nine
unregistered suites. Re-verified the same day against the live `verify.mjs`, the count
is three, not nine — see the companion item on the two disagreeing registration
checkers for why the other six were false positives. This item covers only the three
that are genuinely absent.

## Affected artifact

- `harness/scripts/verify.mjs` — the `TEST_SUITES` registration array (**TP-3**, a
  protected test path)
- `harness/scripts/check-adr-consistency.{mjs,test.mjs}`
- `harness/scripts/check-critic-contract-citations.test.mjs`
- `harness/scripts/check-doc-reconciliation.{mjs,test.mjs}`

## Proposal

Register all three. Two details make this less mechanical than it looks:

1. `check-doc-reconciliation.mjs` requires `--base` / `--candidate` git-range
   arguments. Its own suite exercises the CLI with explicit args and fixtures, so the
   invocation form has to be settled during registration rather than assumed — this is
   a wiring question, not a suite defect.
2. `check-critic-contract-citations.test.mjs` has no separate companion CLI; the suite
   itself asserts that the live corpus is clean, so registering the suite alone is the
   complete fix for that one.

`verify.mjs` is TP-3, so a session cannot apply this. The established route is
`harness/scripts/apply-pending-protected-edits.mjs`, whose step A already carries the
registration mechanism, including the anchored insertion and the
write-then-verify-or-revert guarantee. Adding three entries there and having the
operator run it is the whole change.

Registering the ADR consistency checker should be sequenced first: it is the one with
a known, already-realised cost.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
