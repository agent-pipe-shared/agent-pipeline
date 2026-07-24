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

The Sentinel Windows private-state implementation adds a separate local trust
boundary: a repository-private authority directory on Windows is trusted only
after the fixed system-PowerShell adapter proves its concrete current owner,
owner-only DACL, and absence of a reparse point. POSIX-looking Node mode bits
are not evidence on Windows. A recursively created private path is a sequence
of distinct boundaries: each newly created component must have inherited ACLs
removed and be re-observed; a raced-in component is assessed and fails closed
instead of being treated as newly owned.

## Threats, controls, and residual risk

| Threat | Control | Detection | Residual risk |
| --- | --- | --- | --- |
| A caller substitutes another source document or admission date. | The writer compares both fields with fixed approved constants. | `backlog-state.test.mjs` rejects changed source and date inputs. | A new approved scope still requires a reviewed code and authority update; it cannot be admitted by configuration alone. |
| A caller adds, removes, or reorders blocker IDs. | The writer requires the exact five-ID ordered list. | The focused suite rejects a substituted ID and reversed order. | The hard-coded set deliberately does not discover later Issues automatically. |
| A caller upgrades status or changes a record type. | Every admitted record must be exactly `open` and `defect`. | The focused suite rejects altered status and type. | The writer does not decide whether the five records are eventually implementable or closable. |
| A caller bypasses the writer and edits the backlog state directly. | The canonical checker validates item files, transition ledger, and generated projections. | `check-backlog-state` and Full Verify fail on inconsistent state. | A reviewer can still approve a malicious direct change; this control is a fail-closed consistency check, not an authorization signature. |
| Scope admission is mistaken for native-Windows or release evidence. | The scope document, matrix, and generated records retain `open` status and prohibit closure claims. | Full Verify, Critic review, and candidate-bound evidence are required before any later transition. | Native Windows host evidence remains absent for #33 and the other blockers. |
| A needed admission must be rolled back. | Use an ordinary revert commit; never rewrite evidence, status, or ledger files by hand. | The documented rollback runs `check-backlog-state` and Full Verify on the revert candidate. | Existing external Issues and host evidence are not reverted or reinterpreted. |
| A Windows private-state directory inherits a non-owner ACL or is a reparse point. | The adapter uses a fixed system PowerShell path, removes inherited ACLs only for a newly created component, sets the concrete current owner, and accepts no other DACL principal. Existing or raced-in components are assessed and unavailable proof blocks the authority write. | `windows-private-state.test.mjs`, advisory-receipt assurance tests, Full Verify, and required native-Windows evidence exercise the typed secure/unavailable boundary. | Native Windows evidence remains required; the adapter deliberately does not infer DACL safety from POSIX mode bits or a successful rename. |
| A recursive private-directory creation hardens only its leaf while an inherited intermediate directory remains writable. | The private-boundary creates one component at a time and applies the owner-only DACL contract to every newly created component before it can contain authority state. | The focused test records every created component and refuses a raced-in component without DACL proof. | An interruption can leave an empty hardened directory; it cannot authorize a record, and a subsequent run re-assesses it. |
| A host adapter returns an arbitrary advisory answer without a selected sandbox, child receipt, or observed identity. | `advisory-host-bridge` validates the closed route first and treats an unbound host adapter as `selected-sandbox-required`; it starts no child and persists only typed no-child status. | `advisory-host-bridge.test.mjs`, Full Verify, and the candidate-bound Host-Advisor status expose the unavailable outcome. | Advisory remains unavailable until the exact selected-duty bridge supplies selection, child, identity, and cleanup evidence; no host fallback is permitted. |
| A project-authority cutover mixes neutral and legacy state or is interrupted between files. | The migration is preview-first and explicit, rejects source/destination drift, journals staged/preimage bytes, and recovers only through a digest-bound recovery preview. | `project-authority.test.mjs`, `project-authority-migration.test.mjs`, and Full Verify exercise rollback, interruption, drift, and recovery. | Legacy readers remain a compatibility boundary until their separate migration; neutral authority is read first and a mixed state fails closed. |

## Review and change control

The Sentinel Elephant owns these records. The PO/Human review of missing
native Windows host evidence, allowed tool roots, and wrapper policy is due by
2026-08-31. Any change to this authorization set is a trust-boundary change:
update this model, the approved scope authority, focused rejection tests, and
the candidate-bound Verify and Critic evidence together.
