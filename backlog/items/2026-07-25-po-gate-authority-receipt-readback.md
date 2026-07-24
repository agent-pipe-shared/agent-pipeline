---
schema: pipeline.backlog-item.v1
id: pipeline.po-gate-authority-receipt-readback
type: defect
owner: pipeline
status: open
created: 2026-07-25
source: Self-observation during Sprint Cyborg CYB-0 follow-up (approve-plan dispatch), 2026-07-24/25; unconfirmed, root cause not isolated.
---

# pipeline.po-gate-authority-receipt-readback

## Description

Immediately after a successful `setup.mjs --publish-po-profile` run (exit 0,
"Repository-scoped PO profile receipt published for language en."), the very
next `harness/scripts/check-po-gate-authority.mjs` invocation in the same
session rejected the just-written receipt as `PO-PROFILE-RECEIPT-INVALID`
("missing, unsafe, noncanonical or malformed"). This is a second, distinct
anomaly from `pipeline.po-gate-authority-path-canonicalization` — it surfaced
only after that path-canonicalization issue was sidestepped by running the
publish step from a correctly-cased PowerShell session.

## Triggering situation

Observed once during the Sprint Cyborg design phase, 2026-07-24/25, while
attempting to record `planApproved` for `sprint-cyborg-epic`. Deliberately not
chased further in that session to respect the Elephant/Goldfish role boundary
(no live production-code debugging as Elephant, EL-01). Root cause is
**unconfirmed** — plausibly related to the same DACL/directory-durability gap
class already catalogued for afk-ledger, advisory-host-bridge and
codex-isolated-critic-contract (`backlog/items/2026-07-22-windows-directory-durability.md`,
`backlog/items/2026-07-22-windows-private-state-assurance.md`) — e.g. a
receipt read racing ahead of a DACL-hardening step that has not yet settled,
or a write/read path mismatch distinct from the sibling item above. Not
reproduced a second time; needs a dedicated repro attempt before scoping a
fix.

## Affected artifact

`plugins/pipeline-core/lib/po-gate-profile-publisher.mjs` (`publishPoGateProfileReceipt`
and its DACL-hardening calls into `windows-private-state.mjs`) and
`plugins/pipeline-core/lib/po-gate-authority.mjs` (the validating read side
consumed by `check-po-gate-authority.mjs`).

## Proposal

First reproduce deterministically (publish → immediate validate, repeated N
times, isolated worktree) to confirm this is real and not a one-off artifact
of that diagnostic session's specific command sequence. If confirmed, trace
whether the write-then-read window has an ordering/flush gap around the
Windows DACL-hardening step. No fix applied yet; this item only records the
observation for the Windows/sandbox-assurance slice scope decision in
`docs/state.md`.
