---
schema: pipeline.backlog-item.v1
id: pipeline.full-verify-on-windows-takes-hours
type: defect
owner: pipeline
status: open
created: 2026-10-17
source: "Sprint Alfred Claude continuation 2026-10-17, stopped candidate Full Verify on native Windows; PO decision 2026-10-17 (after the 0.7.0 local candidate)."
sprint: alfred
done_when: manual
---

# Full Verify on native Windows takes hours and is unusable for daily work

## Description

The candidate Full Verify of 2026-10-17 on native Windows (1036 registered
suites, commit `ab5fefbbc`) was stopped after about 50 minutes. By then it had
finished only 49 suites. Measured from the run's receipts and progress
journal:

- In the concurrent phase a new suite started only every 50 to 53 seconds,
  at a steady pace, although the Windows pool allows 4 parallel suites.
  Extrapolated, that is about 15 hours for one run.
- Suites with a tiny log (under 2 kB, 24 of 49) still took a median of 133
  seconds. The cost is a fixed overhead per suite, not test work. The
  suspected but unmeasured source is the Windows Verify journal: native DACL
  checks and durable writes around every suite.
- The PO recalls 5 to 10 minutes after the last optimization. That run was
  under WSL, with pool width 8 and no Windows journal cost. The figure was
  not re-measured.
- 22 of the 49 finished suites were red, mostly Windows host classes:
  symlink EPERM, POSIX mode bits, ancestor ACL refusals, unborn-HEAD git
  calls, and a 60-second gitleaks timeout.

A Full Verify that takes hours cannot gate daily work, so it is skipped and
the evidence weakens.

## Proposal

1. Measure first: per-suite journal overhead on win32 against the child's
   own run time, the ratio of pool waits to serial and exclusive lanes, and
   the top suites by duration.
2. Remove the fixed per-suite overhead on win32: batch or cache the native
   authority observations per run, and keep one helper process for many
   checks.
3. Run the regular Full Verify under WSL in a Linux-filesystem clone that is
   synced to the exact candidate commit without a push. On native Windows,
   run only a lean set of Windows pins (ACL, ancestor, controller smoke).
4. Reduce the test count: merge duplicate pins, share expensive fixtures,
   and move logic suites that mostly re-run the Windows authority layer to
   WSL with typed host-limitation skips, as the PO decided for
   `session-cleanup-binding`.

## Evidence

- Stopped run `verify-1792256197476-71401bf79aea5d2c` (private run directory
  under the Git common directory; summary scripts in ignored scratch).
