# Handover archive -- Off-machine follow-up (WSL PC re-entry, 2026-10-26)

> Rotated from `docs/state.md` on 2026-10-31 by `plugins/pipeline-core/scripts/handover-rotate.mjs` (ADR-0066).
> Section(s) archived: Off-machine follow-up (WSL PC re-entry, 2026-10-26).
> Summary: WSL PC re-entry 2026-10-26: two metadata-only commits from the original machine (64dbc35d0, 6f089c41b) to merge normally, never reset; P1 item push-approval-record-always-trails-the-signed-commit (AC-37) documented not fixed; one-time operator push exception not approved; chat:member-source-drift cleared by the sanctioned move-aside after PO confirmed workers stopped.
> Append-only once written; never edited by hand.
> Content below is byte-for-byte identical to its original `docs/state.md` text at the time of rotation.

## Off-machine follow-up (WSL PC re-entry, 2026-10-26)

The PO relayed a handover written on the original machine after the push of
`1addf4dd9`. Two metadata-only commits exist ONLY there and are not in this
checkout: `64dbc35d0` (actual push/audit custody, transfer defect reopened) and
`6f089c41ba56a25e1adfeecdd92ab824bdbe9255` (regular State autofold). They change
no product code. Their matrix adds one row at25: 208 items, 184 at75, 17 at50,
7 at25; 24 below75, index71.27%. Before adopting them, compare current branch
and remote OIDs and merge normally; never reset or discard work done here.
The new row is P1 `pipeline.push-approval-record-always-trails-the-signed-commit`
(backlog/items/2026-08-26-push-approval-record-always-trails-the-signed-commit.md,
AC-37; signature bounds AC-28/AC-36/AC-172 unchanged): `approve-push` writes a
further local State audit entry after the frozen signed commit, so every normal
approve/push cycle leaves the same trailing entry; no regular immediate close
with a clean tree and fully transferred audit exists. Documented, not fixed.
A proposed one-time human operator exception for the metadata push was NOT
approved or executed; derive no hook bypass or signature reuse from it. An
aborted signing attempt there caused `chat:member-source-drift`; after explicit
PO confirmation that all workers had stopped, the registry was archived with
the sanctioned move-aside command, and signing then worked (no key change, no
manual registry repair).
PO observation on this PC: in a new session whose first request is a fetch
from origin, the fetch ran before `pipeline-start` (see PO list Q18).

