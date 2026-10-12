# ADR-0087 — Owning verification through an authenticated controller test channel

## Status

Accepted architecture choice, 2026-10-11, attributed to the explicit PO chat approval recorded in the companion approval preview. Publication and compilation remain Root-owned; implementation and qualification status are separate.

## Date

2026-10-11

## Context

Actual owner/member/requester handles and the default Verify journal are constructive existing mechanisms. Current FD4 requester identity does not prove a suite-to-owning-course authorization to a fresh guard. ADR-0050 grants recovery evidence continuity, not lifecycle execution authority.

## Decision

Implement a specific Source-issued verification-only controller test channel, following the frozen OSV001–008 requirements and the carrier design refinement. The genuine I03 producer derives the owning course, registered suite, candidate/tree, source bytes and fixed executable/argv/cwd from authenticated owner/execution/member/current-requester bindings. A fresh guard independently authenticates the live original issuer and one-use attempt before dispatch. Serialized JSON, PID, cleanup records, filenames, caller flags or FD4 identity alone are insufficient.

Use real default Verify child execution, journal and official FD3 completion. Close synchronous Registry boundaries before awaiting the child, retain the original requester Promise lifetime, and freshly recheck at terminal. Verification admits only existing journal effects and sanctioned disposable fixtures; it grants no State/approval/public-authority write, member release, another-suite permission or general interpreter exemption.

Select and freeze the exact production protocol, genuine course-to-suite data fields, child/guard ownership ports, bounded attempt/claim durability and result schema before Source posts. The refinement rejects shared-capability HMAC alone as live-parent freshness proof. Activate the narrowly scoped guard admission only after independent issuer/transport/consumer qualification.

## Consequences

Unknown, foreign, stale, malformed, drifted, expired or replayed attempts refuse before dispatch and conserve active authority. Child failures and incomplete FD3 evidence remain failures. OSV001–008 remain unchanged in the companion requirements copy. Implementation approval does not itself prove qualification or activate execution authority. This decision joins the common Design package with no extra ADR signature or terminal, HGO grant, planSignature, protected executor or item closure.

## Affected Contracts

I03 verification issuer; Registry synchronous genuine member inspections; Source-owned requester lifetime and authenticated fixed child/guard channel; default Verify journal and official FD3 terminal. ADR-0050, ADR-0076 and ADR-0085 remain in force.
