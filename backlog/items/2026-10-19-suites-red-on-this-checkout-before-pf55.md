---
schema: pipeline.backlog-item.v1
id: pipeline.suites-red-on-this-checkout-before-pf55
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PF-55 baseline comparison: each case below fails identically on an export of d769449e8 (before PF-55) and on the PF-55 tree (2026-10-19)"
sprint: none
done_when: manual
---

# Three suites red on this checkout before PF-55

## Description

Measured during the PF-55 suite runs, sequentially with a private TMPDIR outside the checkout
(`scratch/run-quiet.mjs`). Each failure is identical before and after PF-55, so none is caused
by it. All three look environmental, but none is classified yet.

| Suite | Cases | Failure |
|---|---|---|
| `lib/native-goldfish-host-state-regression.test.mjs` | NGHS06, NGHS07, NGHS08 | The fixture's own setup asserts `WT-GIT-FAILED` (line 60) |
| `scripts/slice-queue.test.mjs` | SC15 | `validate` without `--queue` exits 3, not 2: the sandbox lies under this repository's `scratch/`, and this repository has an approved governed course, which the CLI resolves instead of reporting a usage error |
| `lib/agy-session-dispatch.test.mjs` | "actual Agy S2 S4 S5 native callers …" | `MODEL-FAMILY-NATIVE-REQUEST-REFUSED` where the case expects `AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED` |
| `hooks/guard-dispatch-native-worker.test.mjs` | GDW01 | Red on both; not yet read in detail |

Separately, `lib/native-goldfish-host-state.test.mjs` exceeds `run-quiet.mjs`'s 15-minute
per-file timeout once NGHS37 is added. It is run with `scratch/run-long.mjs` (one hour).

## Acceptance

- Each case is classified (fixture environment or product defect) and either fixed or bound
  to an owner in the delivery status.
