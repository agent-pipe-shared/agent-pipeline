# Recorded baseline: the guard-lifecycle-ready suite, 2026-10-22

Backlog item: `pipeline.guard-suite-fails-60-tests-on-native-windows` (Proposal, second bullet: "Keep a recorded baseline
count so a later change can be attributed without a staging experiment"). This file is that record. It does not close
the item: the 60 native-Windows failures of 2026-10-04 were not re-measured here.

## Command

```
node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
```

Run in a fresh local clone, TMPDIR set to a private directory outside every repository, other agents running their own
suites on the same machine (so the duration is an upper bound, not a budget).

## Baseline (Linux, WSL2)

Measured on commit `f3a9f02cb613f3c0b978bf48dddff81273b6379c` (the guard hook, its library and its test file are
byte-identical in the clone head the run used; only pin tests and a backlog item text were added after that commit).

| Cases | Pass | Fail | Cancelled | Skipped | Todo | Duration |
|---|---|---|---|---|---|---|
| 392 | 389 | 0 | 0 | 3 | 0 | 537 s |

The three skipped cases are typed native-Windows skips, each naming why:

- `QP3-2a G8 on native Windows the signed-package lane admits backslash path words only as their canonical rendering`
- `QP3-2d F-B on native Windows a letter-case variant of the real script is admitted because it is the same physical file`
- `QP4-2 R5 on native Windows a double-quoted drive path of plain path characters is admitted; protected and mixed-quote spellings stay refused`

```json
{
  "schema": "pipeline.suite-baseline.v1",
  "suite": "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs",
  "platform": "linux-wsl2",
  "commit": "f3a9f02cb613f3c0b978bf48dddff81273b6379c",
  "cases": 392,
  "pass": 389,
  "fail": 0,
  "cancelled": 0,
  "skipped": 3,
  "todo": 0
}
```

## How to attribute a later change

A later run on the same platform with a different failure count is attributable to the commits between the two. The
comparison needs no staging experiment: run the command above before and after, and compare the row. A changed case
count with an unchanged fail count means cases were added or removed; the skipped list above names the only expected
skips on Linux.

## Not established here

- The native-Windows baseline. The item records 273 cases, 213 pass, 60 fail on 2026-10-04 (and 194 pass, 79 fail with a
  guard change staged, which the item attributes to staging artefacts). The suite has since grown to 392 cases; the
  Windows count at this commit has to be measured on the native host and recorded beside the Linux row.
- The classification of those 60 failures (stale fixture assumption, platform difference, real defect). The Linux run
  shows no failing case, which says the Linux side is not affected; it does not classify the Windows failures.
