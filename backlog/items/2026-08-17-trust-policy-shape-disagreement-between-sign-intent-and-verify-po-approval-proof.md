---
schema: pipeline.backlog-item.v1
id: pipeline.trust-policy-shape-disagreement-between-sign-intent-and-verify-po-approval-proof
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "this session's own feature-package-reconcile ceremony for R-AC-06's acceptance.md digest drift"
---

# trust-policy.json shape disagreement between po-human-approval.mjs and po-approval-proof.mjs

## Description

Two consumers of the PO's external `trust-policy.json` disagree on its
required shape:

- `plugins/pipeline-core/scripts/po-human-approval.mjs`'s `setup`/`sign-intent`
  commands write and require the 3-key named shape `{keyReference,
  publicKeySha256, humanName}` (the `SETUP-1` capability — the human's name
  recorded once at key creation).
- `plugins/pipeline-core/lib/po-approval-proof.mjs`'s `verifyPoApprovalProof`
  (line 34) does a STRICT `own()` check requiring EXACTLY the 2-key legacy
  shape `{keyReference, publicKeySha256}` — a 3-key file with `humanName`
  fails this check outright with `PO-APPROVAL-PROOF-INVALID`, even though the
  key, signature, and every other field are genuinely valid.

Running `setup --human-name "<name>"` to add the missing name (needed because
`sign-intent` refused an older, un-named `trust-policy.json`) silently breaks
every subsequent `feature-package-reconcile` / critical-action proof
verification that reads the SAME file as `--proof-authority`, because that
verification path still enforces the old 2-key shape.

## Triggering situation

This session's `feature-package-reconcile` ceremony (resyncing
`lifecycle.json`'s drifted `acceptance.md` digest after the R-AC-06
amendment) hit `sign-intent`'s name requirement, ran `setup --human-name` to
fix it, and then had every subsequent `feature-package-reconcile` attempt
fail with the generic `FTP-RECONCILE-APPROVAL-REJECTED` message (which
deliberately masks the underlying code except for `CRITICAL-PROOF-REPLAY`).
Root-caused via a debug copy of `pipeline-state.mjs` with one added
`console.error` before the generic message, tracing the failure through
`verifyCriticalHumanProof` → `verifyCriticalActionApprovalRequest` →
`verifyPoApprovalProof`, landing on the strict `own()` check.
**Workaround used:** `setup` writes a `trust-policy.json.pre-humanname`
backup before upgrading a file — passing that 2-key backup as
`--proof-authority` instead of the upgraded file made verification succeed.
This is a real workaround for an operator, not a fix for the underlying
inconsistency: the backup file happens to exist only because `setup`'s own
upgrade path creates it, and a future PO whose key was created directly in
the named shape (no legacy file, no backup) would have no 2-key file to fall
back to at all.

## Affected artifact

`plugins/pipeline-core/lib/po-approval-proof.mjs` (`verifyPoApprovalProof`,
line 34's `own()` check), `plugins/pipeline-core/scripts/po-human-approval.mjs`
(the `setup`/`sign-intent` commands that write/require the 3-key shape).

## Proposal

Either (a) `verifyPoApprovalProof`'s `own()` check should accept the 3-key
named shape too (treat `humanName` as optional on the trust-policy side, the
same way it is already optional/additive everywhere else in
`po-human-approval.mjs`), or (b) `setup`'s upgrade path should not mutate the
SAME file every other consumer reads as `--proof-authority` — write the
`humanName` addition to a separate file, or version the trust-policy schema
explicitly so consumers can tell which shape they are looking at instead of
one silently rejecting the other's valid output.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** discovered and worked around mid-ceremony this session
  (reconcile succeeded using the pre-upgrade backup file); the underlying
  inconsistency is real but narrow in blast radius (only affects operators
  who ran `setup --human-name` on an already-verifying key), not urgent
  enough to fix same-session alongside unrelated Phoenix acceptance work.
- **Assignment (if accepted):** a future increment; owner `pipeline`, no
  expiry set.
- **Date:** 2026-08-17
