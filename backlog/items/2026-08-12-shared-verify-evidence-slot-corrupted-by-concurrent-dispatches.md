---
schema: pipeline.backlog-item.v1
id: pipeline.shared-verify-evidence-slot-corrupted-by-concurrent-dispatches
type: defect
owner: pipeline
status: open
created: 2026-08-12
sprint: nova-b
source: "Independently reported by three separate goldfish dispatches (NVA-BL-40-FIX, NVA-BL-42-FIX, NVA-BL-64) in one wave, 2026-08-12, each hitting the same shared-single-slot evidence artifact while running their own closing `verify.mjs`."
done_when: manual
---

# `evidence/verify-latest.json` is a single shared slot; concurrent dispatches on one checkout overwrite each other's closing evidence

## What happened, three times independently

In one wave of parallel goldfish dispatches sharing one checkout (no
worktree isolation for this task class), three separate dispatches each ran
`node harness/scripts/verify.mjs` as their own closing-evidence step and
each hit the same failure shape:

- **NVA-BL-40-FIX:** its own candidate commit (`05e6f1fe`) ran clean through
  all 269 suites, then failed only at the final `candidate-binding` meta-step
  with `VERIFY-CANDIDATE-DRIFT`, because another concurrent dispatch
  committed on top of it mid-run (HEAD moved `05e6f1fe` → `4f8b1291` while
  the ~5-minute suite was still executing).
- **NVA-BL-42-FIX:** its background verify run's resulting
  `evidence/verify-latest.json` turned out to bind an entirely different
  candidate range (`05e6f1fe` → `4f8b1291`) than its own commit
  (`fcc195e0`) — a concurrent dispatch had overwritten the single-slot file
  mid-run with its own run's result.
- **NVA-BL-64:** could not observe its own invocation's exit code at all —
  it exceeded the foreground timeout, was moved to background, and by the
  time it checked back HEAD had moved twice more from concurrent sessions,
  so the shared artifact no longer necessarily reflected its own commit.

All three dispatches handled this correctly: none fabricated a clean
result, all disclosed the contention honestly as an evidence limitation.

## Why this is a defect rather than expected friction

`evidence/verify-latest.json` is a single file, written by one script
invocation, read by the same script to assert `candidate.binding`. Nothing
about its design anticipates more than one `verify.mjs` invocation running
concurrently against the same checkout — which is exactly the operating
mode this session's own parallel-dispatch wave used, and which
`docs/operating-model.md` does not discourage.

The practical effect: in a wave of N concurrent goldfish dispatches, at
most one can obtain a genuinely clean, uncontaminated closing-evidence
verify run per checkout — the others either see drift, see another
dispatch's unrelated candidate range, or lose track of their own
invocation's result entirely. This is a distinct failure from the
already-filed shared-git-index race
(`2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md`,
about `git add`/`git commit` colliding on the index) — this one is about
the verify *evidence artifact* being a shared single slot, not the commit
mechanism itself.

## Direction, not a design

Not designed here. Candidates worth considering, not a commitment:

1. Per-run evidence files (e.g. `evidence/verify-<runId>.json`), with
   `verify-latest.json` as a pointer/symlink updated only by whichever run
   finishes last — preserves every run's own record instead of one run
   clobbering another's.
2. Worktree isolation for any task class expected to run its own closing
   `verify.mjs` invocation, so concurrent dispatches never share one
   checkout for this specific step even if they share one for editing.
3. A serialization discipline at the Elephant/orchestrator level: closing
   verify runs are queued and run one at a time against a quiescent tree,
   never dispatched to run concurrently across parallel goldfish briefings
   in the same wave.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Alfred ("Agent-first
  architecture, mechanical governance, measurable rigor, and control
  integrity" — ADR-0043's 2026-08-17 amendment). Candidate 1 (per-run
  evidence files, `verify-latest.json` as a pointer updated only by whichever
  run finishes last) is the recommended direction to pick up when Alfred
  starts; candidates 2/3 are session-discipline mitigations already partly
  in effect (this session runs its own dispatches sequentially rather than
  concurrently on one checkout for exactly this reason).
- **Rationale:** real and reproduced three times independently, but not
  currently blocking — this session's own practice already avoids the
  triggering condition (concurrent closing-verify runs on a shared
  checkout), and the fix is infrastructure hardening rather than a live
  defect in front of anyone today.
- **Assignment (if accepted):** next available Alfred slot, unassigned.
- **Date:** 2026-08-17

## Progress, 2026-09-04 — reproduced, severity bounded, blocked on TP-3

NVA-B-EVSLOT-1 was dispatched against this item under a reproduce-first
instruction. It reproduced the defect, bounded its severity, and then stopped at
the protected boundary without changing `verify.mjs`. Commit `d27edb7a` carries
the evidence only.

**Reproduced.** A bounded synthetic repro — two real child processes performing
`writeEvidence()`'s exact write shape against a scratch fixture — ends with the
shared slot holding writer B's commit while writer A's own process has already
exited 0. RED capture:
`backlog/evidence/2026-09-04-nva-b-evslot-1-repro-red.txt`.

The premise is confirmed at source rather than inferred: `writeEvidence()` is a
bare `mkdirSync` + `writeFileSync` with no run identity, no lock and no
compare-and-swap, and `verify.mjs`'s own header states the design outright —
"ONE canonical path, overwritten each run — no registry (#2 CUT)".

**How often it has actually bitten, measured.** Four real `verify.mjs` runs are
recorded under `.git/agent-pipeline/verify/runs/` for 2026-09-04. None overlap
in wall-clock time; they read as sequential with one interrupted mid-flight. So
the defect is live by construction and was not hit today. That is a bound, not
an all-clear. Scan:
`backlog/evidence/2026-09-04-nva-b-evslot-1-forensic-scan.txt`.

**What it does not endanger, established by grep.** The only real consumers are
`guard-push.mjs` and `push-prepare.mjs`, and both re-check `commit` against the
actual target when they read. A raced slot therefore cannot slip a stale verdict
past the push gate. The cost is a dispatcher trusting the file mid-run and
reading another run's result — confusing and wasteful, not a security hole.

That bound matters for triage: this stays infrastructure hardening rather than
becoming urgent, which is what the 2026-08-17 decision above already assumed
without yet having the measurement.

**Blocked on TP-3, with the exact change recorded.** `verify.mjs` is the sole
owner of the single-slot write and is protected with no in-session override.
`verify-journal.mjs` was read and is *not* the corrupted layer — it already
isolates per-suite evidence under unique-runId private directories.

The narrowed change is staged in
`backlog/evidence/2026-09-03-suite-registration-ceremony-package.md` for the same
signature window as the three registration lines and the `hooks.json` comment:
write `evidence/verify-<runId>.json` at both `writeEvidence()` call sites using
the run id already available as `runVerifyJournal`'s default `runId`, with an
atomic temp-file-plus-rename write matching `verify-journal.mjs`'s own
`atomicJson` rather than a second mechanism, leaving
`evidence/verify-latest.json`'s schema unchanged.

**One unrelated finding, recorded rather than dropped:** a TOCTOU
check-then-write on `listActiveSessionDescriptors` in
`establishSessionLessCleanupBinding`. Outside this item's scope, not filed
separately yet.
