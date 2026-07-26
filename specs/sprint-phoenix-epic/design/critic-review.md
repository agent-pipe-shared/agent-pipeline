# Sprint Phoenix independent review record

Status: initial design and privacy findings corrected; fresh re-reviews pending

Date: 2026-07-26

## Initial fixed candidate

| Field | Value |
| --- | --- |
| Candidate commit | `e9f742d1ceeadf6c39b6e67ec149c4d33285b63f` |
| Candidate tree | `c60a03da5383393a529f9d86b1b26ef90ffbecd2` |
| Base | `9d1b3dc108eb77629ace5b82002120f5539abd8d` |
| Ruleset | `9d1b3dc108eb77629ace5b82002120f5539abd8d` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Dispatch | paths/refs only; uncontaminated |
| Reviewer mutation | none |
| Verdict | FAIL |

The selected external host-bridge attempt was denied by the environment
approval boundary before a child or export. It was not retried or bypassed.
The Product Owner-authorized functional-equivalent lane then ran one fresh
higher-capability Critic with no chat history, no delegation, and no invoked
write tool. Effective model identity and OS isolation are not asserted.

## Findings and dispositions

| ID | Severity | Finding | Required disposition |
| --- | --- | --- | --- |
| PHX-CR-01 | blocker | Event-digest preimage was undefined and a replaceable head could not prove suffix completeness. | Define the exact domain-separated preimage and require an independently retained candidate-bound checkpoint; prefix-only verification is never gate-capable. |
| PHX-CR-02 | blocker | Direct mutable authority readers were omitted and the dual-read window had no owner/expiry. | Inventory every direct plan/push/deploy/release/override reader, require ledger-first dual evaluation, name the owner, and expire the window. |
| PHX-CR-03 | blocker | Configured privacy review was pending with no independent sign-off target. | Add the complete privacy processing/flow/fixture contract and obtain a separate fixed-candidate read-only privacy verdict. |
| PHX-CR-04 | major | The recovery authority named a command absent from the public operation contract. | Add the closed `governance-event recover` request, authority, journal, pre/postimage, readback, and no-delete contract. |
| PHX-CR-05 | major | Phoenix had no lifecycle manifest and #22 provided no writer. | Add a valid current manifest and make transactional manifest-writer closure the first blocking Phoenix delivery. |
| PHX-CR-06 | major | The supplied design evidence was authored Markdown rather than machine-bound evidence. | Retain exact Verify/Security evidence, pass those files directly on re-review, and record their candidate/tree/hash binding. |

No finding is accepted as residual design debt. Every row must be fixed and
freshly re-reviewed. The initial report also confirmed that no existing test
was weakened, no dependency was added, no private path/secret/raw transcript
was committed, the 145 criteria were unique/contiguous, and all eight live
issues remained in scope.

## Re-review contract

The correction re-review receives only the corrected fixed diff, this prior
finding record, the normative Spec, calibration/governance paths, exact
machine Verify/Security evidence, and the required assurance metadata. It
checks only these findings, their fixes, and direct regressions.

## Independent privacy review — first verdict

| Field | Value |
| --- | --- |
| Candidate commit | `1b7860616c16c3879fc67dd964f1dd48a4a58100` |
| Candidate tree | `374248edea18bea452532771821cf6e669949b9f` |
| Contract | `design/privacy-review.md` |
| Assurance | `functional-equivalent-read-only; OS isolation not asserted` |
| Dispatch | paths/refs only; uncontaminated |
| Reviewer mutation | none |
| Machine trajectory | consistent; exact Verify/Security candidate binding confirmed |
| Verdict | FAIL |

The privacy reviewer reported:

1. **PHX-PR-01 / blocker:** ordinary repository/Git reads bypassed the
   claimed per-stream access policy because the three canonical streams were
   ordinary files in one repository.
2. **PHX-PR-02 / major:** immutable portable human records could include
   personal/pseudonymous attribution and free-form rationale, while the
   operation and implementation inventory had no erasable restricted store,
   deletion, or key-destruction contract.

Both findings are accepted without waiver. The corrected design now:

- declares Git to be one coarse repository-wide access/retention trust zone,
  and describes the query service only as the sanctioned semantic source;
- admits portable records only when the complete bytes are proven
  `repository-public-safe`, non-personal, and compatible with repository
  retention;
- rejects natural-person identifiers, joinable pseudonyms, free-form
  rationale, uncertain contextual identifiability, and finite-erasure or
  narrower-access requirements before any portable temporary/final file;
- defines a separately protected machine-local profile for the complete
  restricted event, with no portable counterpart or join handle;
- closes the restricted schema/store/CLI inventory and exact
  expiry/erase/key-destruction/readback/limitation tests.

A fresh privacy re-review receives only the privacy correction diff, this
prior finding record, configured governance paths, and exact machine evidence.
It checks PHX-PR-01/02, their corrections, and direct regressions.
