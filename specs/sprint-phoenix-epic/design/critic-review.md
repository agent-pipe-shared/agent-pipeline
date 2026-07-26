# Sprint Phoenix independent review record

Status: correction in progress after failed initial review

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
