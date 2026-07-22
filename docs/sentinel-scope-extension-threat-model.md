# Sentinel scope-extension authorization threat model

## Scope and authorization boundary

This document covers the one sanctioned writer that admits the five Sentinel
Windows blocker records. Its input is untrusted until
`applySentinelScopeExtension` validates it. The writer may create only the
five `open` defect records named in
`specs/2026-07-19-sprint-sentinel-epic/windows-blockers-scope.md`, using that
exact path and the approved `2026-07-22` admission date.

The boundary is between a caller-supplied scope-extension object and the
canonical backlog, transition ledger, and generated projections. Admission is
not implementation, verification, native-Windows evidence, issue mutation, or
closure authority.

## Threats, controls, and residual risk

| Threat | Control | Detection | Residual risk |
| --- | --- | --- | --- |
| A caller substitutes another source document or admission date. | The writer compares both fields with fixed approved constants. | `backlog-state.test.mjs` rejects changed source and date inputs. | A new approved scope still requires a reviewed code and authority update; it cannot be admitted by configuration alone. |
| A caller adds, removes, or reorders blocker IDs. | The writer requires the exact five-ID ordered list. | The focused suite rejects a substituted ID and reversed order. | The hard-coded set deliberately does not discover later Issues automatically. |
| A caller upgrades status or changes a record type. | Every admitted record must be exactly `open` and `defect`. | The focused suite rejects altered status and type. | The writer does not decide whether the five records are eventually implementable or closable. |
| A caller bypasses the writer and edits the backlog state directly. | The canonical checker validates item files, transition ledger, and generated projections. | `check-backlog-state` and Full Verify fail on inconsistent state. | A reviewer can still approve a malicious direct change; this control is a fail-closed consistency check, not an authorization signature. |
| Scope admission is mistaken for native-Windows or release evidence. | The scope document, matrix, and generated records retain `open` status and prohibit closure claims. | Full Verify, Critic review, and candidate-bound evidence are required before any later transition. | Native Windows host evidence remains absent for #33 and the other blockers. |
| A needed admission must be rolled back. | Use an ordinary revert commit; never rewrite evidence, status, or ledger files by hand. | The documented rollback runs `check-backlog-state` and Full Verify on the revert candidate. | Existing external Issues and host evidence are not reverted or reinterpreted. |

## Review and change control

The Sentinel Elephant owns these records. The PO/Human review of missing
native Windows host evidence, allowed tool roots, and wrapper policy is due by
2026-08-31. Any change to this authorization set is a trust-boundary change:
update this model, the approved scope authority, focused rejection tests, and
the candidate-bound Verify and Critic evidence together.
