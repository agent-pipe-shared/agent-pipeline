# Remaining candidate review and correction progress

The external terminal run returned a completed native review process for
candidate `f0e1f5b17c888d374bcdd905a0d4d86995c5868f`, tree
`70ab7db873d3797f1acc53f5e58344ced7967062`. The actual
[verdict and receipt](2026-09-10-remaining-candidate-critic-partial.json)
are retained unchanged. The report is partial, `pass: false`, with three
major and two minor findings. It reached the default 24-call review budget;
its 54-file scope was too large for complete coverage within that budget.
This is a dispatcher scoping failure, not a candidate approval.

## Receipt integrity and existing evidence

- Raw result SHA-256:
  `91fa2ccaf04bc929f93d94ca8860ce4705a80f9cef371c8ac74ed8cbcaa9ba4d`.
- Canonical execution receipt SHA-256:
  `e4a616e384341404c67d3b70e7e819cb9a7d7ad905a5a705222e4ffb7e717de5`.
- The verdict digest matches the receipt. The child exited zero without a
  signal; cleanup completed. All 54 named source blobs were bound to the
  reviewed tree. Effective model identity remains unverified.
- Exact clean full Verify at the reviewed candidate passed 517/517 steps,
  with no reuse: `verify-1788999328347-b2ae127599874ff9`. This existing result
  must not be attributed to later source changes.

## Corrections

| Finding | Correction | Actual focused evidence |
|---|---|---|
| Archive-directory symlink escape | `ee7aa80c`, `14c82b8a` and `c3de6d00` address the directory, missing-directory and dangling-filename variants found during parent inspection, including a lexically internal target reached through an external parent symlink. Correction review remains pending. | Real CLI RED and green captures: `evidence/NVA-ARCHIVE-CONTAINMENT-FIX-1-*.txt`; permanent tests snapshot the complete handover/acknowledgement and external trees. |
| Obsolete Claude Fable instructions | `18a37515` describes native Opus and the V3 repeated-failure consult fallback; its existing contract test is aligned. | `evidence/NVA-ADVISOR-ROUTE-TEXT-FIX-1-advisor-route-text-fix.txt`, exit 0. The worker reported observing RED, but did not retain that output. |
| Advisory commentary treated as a final answer | `3b47536a` distinguishes commentary, final answers and legacy absent phases, retaining invalid/duplicate-final refusal. | `evidence/NVA-ADVISORY-PHASE-FIX-1-advisory-test.txt`, four tests passed, including actual child execution with a fake App-Server. `evidence/NVA-ADVISORY-PHASE-FIX-1-counterfactual.txt` subsequently confirms the unchanged new regression fails with `protocol-error` against exact pre-fix child bytes. This is retrospective evidence, not a retained pre-edit RED run. No live consultation is claimed. |
| Repeated advisory for one pending plan set | `babdae8d` deduplicates sorted pending entries, ignoring explanation, plan ordering and completed-item changes. | `evidence/NVA-PLAN-DEDUP-FIX-1-red.txt` and `evidence/NVA-PLAN-DEDUP-FIX-1-native-slicing.txt`; permanent real-hook input sequence. |
| Stale close instructions | `d5764361` documents section/content-bound acknowledgement and the 30,000-byte default. | `evidence/NVA-CLOSE-INSTRUCTION-FIX-1-consumer.txt`, exit 0; documentation diff inspected. |

The focused consumer-safe-path checks passed for each package. Machine
captures and live dispatch records belong to ignored `evidence/`; the
accidentally tracked close and plan records are returned to that ignored
location without deleting their local contents. Historical commits remain
unchanged. Durable review conclusions and provenance remain in this file
and the retained result.

## Remaining review boundaries

The local packet plan at
`scratch/NVA-CANDIDATE-REVIEW-COMPLETION-1/packets.json` separates unfinished
lifecycle/override, advisory/host and compatibility/bootstrap coverage,
plus corrected handover/plan artifacts. It is coordinator control, not
reviewer briefing or evidence. The full partial report is retained for
round accounting; completed migration and native-adapter cycles are not
reopened. A correction verdict must not be inferred from focused tests.

The separate nineteen-artifact correction still needs its first completed
correction verdict. Its two interrupted attempts supplied no verdict or
proven termination cause. Inventory attestation, the fresh two-stage reader
exercise, final build identity, exact final Verify/security and local test
handover remain completion dependencies. Nothing here establishes live
Alfred readiness, installed plugin replacement, push or release.
