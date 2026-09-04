# A1 privacy verification

Status: exact-candidate evidence summary. This report records observed
artifacts only; it is not a publication or a Critic review.

## Candidate-bound Verify evidence

Full Verify run ID: `verify-1788512887230-2e462c25bde78284`.

The candidate commit is
`c4b9c1dced87aafd4a4392710356218c7b1c482e` and its tree is
`6806f7ea61910be2e6c0cc4a40753df711ae4dc5`. The evidence records a clean
start at that exact commit/tree and a clean finish at the same exact
commit/tree, with binding `exact`.

Verify registered 506 suites and produced 506 terminal receipts. The overall
exit was 2, with exactly one failed step: `verify-suite-registration-check=2`.
Its registration readback reported:

```text
UNREGISTERED plugins/pipeline-core/scripts/enforcement-conformance.test.mjs is a *.test.mjs suite under a registered root with no verify.mjs registration entry
Verify suite registration check failed: 1 finding(s) (1 unregistered, 4 honoured exclusion(s), 0 malformed, 0 expired).
```

The deterministic Verify chain is therefore not green. The A1 suite was
rerun directly after the full run and passed 11/11 on unchanged candidate code
bytes; that direct result is separate and is not represented as an in-Verify
execution.

## Security evidence

The candidate-bound security evidence reports `security-scan=0`:

- Gitleaks: 0 findings, PASS.
- Semgrep: PASS.
- License check: PASS.
- OSV scanner: not applicable because no package sources were found.

## Consequence and remaining decisions

No Critic claim or Critic dispatch exists for A1. The deterministic Verify
chain must become green through the PO TP-3 registration act before that
review prerequisite is met. The remaining PO decisions are recorded in the
[A1 decision queue](a1-po-decision-queue.md) and [registration preparation](a1-registration-preparation.md);
this report does not decide them.
