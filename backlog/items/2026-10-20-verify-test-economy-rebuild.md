---
schema: pipeline.backlog-item.v1
id: pipeline.verify-test-economy-rebuild
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-20
source: "PO decision D69 (2026-10-20) and ADR-0088, after the Full Verify measurement of c1771bc98 (138 red steps, about 13 000 cases, 5 h)."
sprint: none
done_when: manual
---

# Rebuild Verify around a fast gate, a fresh full run and a runtime budget

## Description

ADR-0088 fixes the test-economy rules; this item builds what the 0.7.0 candidate leaves out.
It bundles `2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md`,
`2026-09-01-verify-runtime-is-concentrated-in-ten-suites-not-spread-across-many.md` and
`2026-10-17-full-verify-on-windows-takes-hours.md`.

## Acceptance

- Verify has a fast tier (under 10 minutes on WSL) used at commit and push boundaries and a full
  tier (under 60 minutes on WSL) used nightly and before a candidate; each suite has a runtime
  budget and an overrun is reported as a finding.
- A candidate is refused without a full run within the freshness bound (ADR-0088 rule 2).
- Quarantined cases are counted and reported separately, each with owner and expiry; an expired
  quarantine is a red result; the red-or-quarantined count may not grow between full runs.
- The `lib/pins/*` suites are merged into their owner suites where they pin the same contract, and
  superseded cases are removed, each with its reason and a Critic review.
- The calibration accepts optional `verify.quick` and `verify.full`; a project without them keeps
  one command for every boundary.

## Merged from `2026-10-17-full-verify-on-windows-takes-hours` (created 2026-10-17; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: Windows-specific content the canonical's acceptance lacks: (a) measure per-suite journal overhead on win32 (native DACL checks and durable writes) against child run time, pool-wait ratio and top suites by duration; (b) remove the fixed per-suite overhead on win32 by batching or caching native authority observations per run and using one helper process; (c) run the regular Full Verify under WSL in a Linux-filesystem clone synced to the exact candidate commit, with only a lean Windows pin set (ACL, ancestor, controller smoke) on native Windows; (d) evidence run verify-1792256197476-71401bf79aea5d2c (49 suites in about 50 minutes, 22 of 49 red from Windows host classes). Add these as explicit acceptance points to the canonical before closing the duplicate. Note the canonical's own mention in its Description is the only link, and the date order (duplicate older) is overridden because the canonical was written as the bundling item.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.full-verify-on-windows-takes-hours
type: defect
owner: pipeline
status: open
created: 2026-10-17
source: "Sprint Alfred Claude continuation 2026-10-17, stopped candidate Full Verify on native Windows; PO decision 2026-10-17 (after the 0.7.0 local candidate)."
sprint: alfred
done_when: manual
```

#### Description

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

#### Proposal

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

#### Evidence

- Stopped run `verify-1792256197476-71401bf79aea5d2c` (private run directory
  under the Git common directory; summary scripts in ignored scratch).
