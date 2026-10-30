# w7-heal-moves-every-authority-sibling-and-orphan (Elephant, PO exception 2026-10-30)

Live on 0.7.0+claude.20261030114801.c23df26 in this repository: `routine-repair run heal` moved 246 settled pending states aside,
then every dispatch was refused before launch with SDC-AUTHORITY-UNAVAILABLE native-authority-orphan-prefix; `move-aside`
(D203) did not help because it retains the registry, not the host directory records.

Root cause: `planSettledPending` moved only two fixed sibling kinds (`authority-terminal`, `authority-integration`). The host
state reader (`native-goldfish-host-state.mjs` line 500) refuses any `authority-*` record whose `pendingSha256` names no pending
file. A read-only probe with the fixed planner on the live directory: 246 files, 0 pending, 246 `authority-owner-*` orphans
(one per retired pending state), nothing unreadable.

Fix:
- every `authority-<kind>-<sha>.json` and `authority-<kind>-<sha>-<n>.json` of a retired pending state travels with it
  (owner, terminal, integration, check, scope, recheck, checkpoint, any later kind);
- `planOrphanAuthority`: authority records whose `pendingSha256` names no pending file of the directory (the reader's own
  condition) are moved into the same retained aside directory, in `heal` and in `settled-pending-aside`; an unreadable record or
  one without a sha256 is kept with a reason, a symlink is never moved; if a pending file cannot be read nothing is classified.

Tests (routine-repair.test.mjs 30/30): seven sibling kinds of a settled state and two orphans leave, the records of a live
pending state stay, an unreadable record is kept, and afterwards no authority record names a missing pending file (the
reader's condition); heal moves orphans with nothing settled. Revert of the production file: exactly the two new cases fail,
restored byte-equal. Patch 2 files +89/-8, apply-check 0.
Open: Full Verify, Critic, a live heal after apply (expected: 246 orphans retained aside, dispatch admitted), PO acceptance.
