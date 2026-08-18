---
schema: pipeline.backlog-item.v1
id: pipeline.test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-17
source: "PO, 2026-08-17, mid-candidate-stamp: 'wundere mich warum die pipeline immer noch so viel tmp nutzt obwohl wir dafür eigentlich scratch erfunden haben' — asked after this session's local /tmp filled to 100% inode usage (1,038,060 of 1,048,576) and started making `git` itself fail with ENOSPC, blocking work until the PO manually remounted tmpfs with a higher inode count and cleared stale entries."
---

# Test suites use `os.tmpdir()`/host `/tmp` for their own fixtures, bypassing the repo's own `scratch/` convention

## Description

This repository already has a deliberate convention — `scratch/` (gitignored,
inside the project root) — specifically so that agents and tooling never need
a host-temp path; `pipeline-start`'s own skill text states this explicitly:
"Never a host-temp path... `scratch/` is the only location the guard needs no
exception for." In practice, that convention covers agent-authored ad hoc
files (dispatch notes, Critic scratch subdirectories, held fixtures) but NOT
this repository's own Node test suites, which use the idiomatic
`mkdtempSync(join(tmpdir(), "<prefix>-"))` pattern pointing at the HOST
`/tmp`, not `scratch/`.

## What happened

2026-08-17: over roughly 28 hours of test runs on one development host, `/tmp`
accumulated 35,535 top-level directories — 13,265 alone with the prefix
`onboarding continuity` (from `onboarding-continuity`-related test fixtures),
plus hundreds more from `pipeline-state-inspection-contract` tests and
thousands of individually-named single-run directories from other suites
(`project-authority.test.mjs`, etc., including deliberately-not-cleaned-up
crash-simulation fixtures). This drove `/tmp`'s tmpfs inode count from
1,048,576 to 100% used, which first surfaced as `ENOSPC` failures in
`project-authority-tests` and `product-capability-inventory-tests`, then
escalated to `git` itself failing ("unable to create temporary file: No space
left on device") — a genuine block on committing further work, not just a
test-suite inconvenience. Resolved only by the PO manually remounting tmpfs
with `nr_inodes=10000000` and clearing stale non-today entries — a host-level
intervention outside this repository's own tooling.

## Why this is a defect, not just host hygiene

The whole point of `scratch/` was to make agent/tooling temp usage bounded,
inspectable, and cleanable via ordinary repo mechanisms (`git clean`, a sweep
script, session cleanup descriptors) instead of accumulating invisibly in a
host directory shared across every repository and session on the machine.
Test suites using `os.tmpdir()` directly opt out of all of that — including
crash-simulation tests that intentionally leave fixtures behind to prove
recovery-from-interruption, which by design never clean up on their own and
therefore accumulate fastest.

## Proposal

Not designed here. Candidates, explicitly not a commitment:

1. **Point test fixtures at a repo-local temp root under `scratch/`** (e.g.
   `scratch/test-tmp/`), via a shared test helper, instead of
   `os.tmpdir()`/`mkdtempSync(tmpdir())` directly — inherits `scratch/`'s
   existing gitignore coverage and makes `git clean -fdx -- scratch/` (or a
   narrower sweep) an effective, low-risk cleanup path.
2. **A periodic or session-close sweep** of `scratch/test-tmp/` (or
   equivalent), parallel to the existing `session-cleanup-recovery.mjs`
   descriptor-based sweep for agent scratch — bounded by age or by "no longer
   referenced by a live process."
3. **Leave crash-simulation fixtures as the deliberate exception** (they need
   to survive a crash to prove recovery), but scope even those under a
   repo-local root so they're at least inspectable/cleanable in bulk rather
   than lost among unrelated host `/tmp` content.
4. **Independent of the choice above:** an inode/size budget check, similar in
   spirit to the existing `bootstrap-payload-budget.mjs`/`HANDOVER_MAX_BYTES`
   pattern, that fails loudly (in `verify.mjs` or a dedicated hygiene check)
   well before host exhaustion, rather than the first symptom being `git`
   itself refusing to write.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, bounded scope for this release: Proposal
  options 1+4 combined — a shared `scratch/test-tmp/` helper as the
  sanctioned pattern for NEW/touched suites going forward, plus a
  lightweight size/count budget check surfaced through `verify.mjs`
  (mirroring `bootstrap-payload-budget.mjs`'s pattern) so the next
  accumulation fails loudly long before host exhaustion. A full
  repo-wide migration of every existing `mkdtempSync(tmpdir())` call
  site (option 1 taken to its limit) is explicitly OUT of this release's
  bounded scope — too large and too risky (dozens of suites, including
  deliberately-non-cleaning crash-simulation fixtures) to land safely in
  one dispatch; tracked as a follow-up once the helper/guard exist and
  the highest-offender suites (`onboarding-continuity`,
  `pipeline-state-inspection-contract`) have proven the pattern.
- **Rationale:** the PO already worked around the acute symptom (tmpfs
  remount); the root cause is real and will recur, but the safe fix is a
  new shared helper + guard, not a same-day mass rewrite of every test
  suite's fixture setup — that class of change needs its own dispatch
  and its own Critic review (test-authorship, `goldfish-deep` tier), not
  a same-breath decision-plus-implementation.
- **Assignment (if accepted):** queued for a `goldfish-deep` dispatch
  this release (test-infrastructure/guardrail-adjacent work) — helper
  module + budget check + the two highest-offender suites migrated as
  the worked example; remaining suites tracked separately, not silently
  dropped.
- **Date:** 2026-08-18
