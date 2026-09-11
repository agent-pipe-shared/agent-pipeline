# Deferred-backlog visibility closure

Commit `22944b8250bc4523e2c8760019c1819a72fe9176` added the read-only deferred
defect report, its focused tests and both standard Verify registrations.

Fresh coordinator readback on 2026-09-12:

- `node plugins/pipeline-core/scripts/check-deferred-backlog.test.mjs` — 4/4
  tests passed.
- `node plugins/pipeline-core/scripts/check-deferred-backlog.mjs` — exit 0;
  reported five deferred defects, all five overdue, and one missing revisit
  condition.
- `harness/scripts/verify.mjs` contains the registered
  `deferred-backlog-tests` and `deferred-backlog-check` entries.

The report remains nonblocking for overdue or incomplete revisit metadata and
fails closed for malformed/unreadable backlog input, matching the accepted
option 1. The five reported defects retain their own statuses and remediation
obligations.
