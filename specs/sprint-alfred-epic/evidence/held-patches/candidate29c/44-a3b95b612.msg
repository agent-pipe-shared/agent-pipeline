feat(maintenance): red observation, red-before proofs and the PO acknowledgement (ADR-0097)

First part of the K-28 maintenance dispatch route.

- lib/maintenance-delivery.mjs:
  - the closed maintenance binding;
  - the narrow write scope: test- or tooling-shaped paths, never a
    gate-strength path, never under specs/;
  - the private red observation per check and candidate. It is written
    once, so the first result at a commit stands;
  - the receipt route: a sealed red suite receipt, `project-<id>` or
    `configured-verify`, at or before the commit that added the plan
    approval's anchor file;
  - the acknowledgement route and the one subject builder at the clean
    HEAD: the red observations that have no proof yet.
- New critical kind acknowledge-maintenance-red-check:
  - `pipeline-state.mjs approve-maintenance-red-check --by <label>`
    prints the PO's signing line and records the signed proof. The
    record is labelled "red before the feature acknowledged by the PO".
  - The signing terminal rebuilds the same subject, refuses --subject
    and shows the PO the checks.
- Tests:
  - lib suite on real git histories;
  - library, printed and verb round-trip legs, plus a consumer leg:
    print, sign, record once, then the proof reader finds the record,
    and a replay is refused;
  - the kinds list and the off-happy-path verb pin.
- The fork-disposition negative loop of po-human-approval.test now
  excludes the two kinds that prepare-critical composes on purpose and
  pins them positively. The ADR-0096 kind had broken that loop since
  571ac03f0.

AI-Assisted: true
Dispatch: stage-0 (elephant)
