---
schema: pipeline.backlog-item.v1
id: pipeline.verify-registration-check-fixtures-lack-real-git-topology
type: defect
owner: pipeline
status: closed
created: 2026-08-19
source: "Found by PHX-WP-VERIFYREG-TRIAGE while diagnosing verify-suite-registration-tests, windows-assurance-verify-registration-tests, scoped-verify-registration-tests, and verify-evidence-root-tests failures from a full clean-candidate Verify run, 2026-08-18/19."
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "e61b05924c38b246abee65ef2cb4d91dcee11c77"
closure_evidence: "backlog/items/2026-08-19-verify-registration-check-fixtures-lack-real-git-topology.md"
---

# Several verify-registration check fixtures fail structurally: no real git topology in their test root

## Description

`verify-suite-registration-tests`, `windows-assurance-verify-registration-tests`,
and `scoped-verify-registration-tests` all fail with the identical
`VERIFY-GIT-COMMON-DIR-UNAVAILABLE` class of error inside a full clean-candidate
Verify run. Root cause (confirmed by PHX-WP-VERIFYREG-TRIAGE): each fixture
(`buildVerifyFixtureRoot`, and the WAVR19/SVR28 equivalents) copies
`harness/scripts/verify.mjs` into a plain `mkdtempSync(tmpdir())` root with
**no `.git` directory at all**, so `verify.mjs`'s own `git rev-parse
--git-common-dir` call (added by commit `0136b29f`'s evidence-root fix) fails
before any evidence write — a structural gap in the fixtures' own design (they
were built before that call existed and never claimed to need real git
topology). `verify-evidence-root-tests` could not be reproduced failing in
isolation and may be a downstream symptom of the same class inside a full
batch run rather than an independent bug.

## Affected artifact

The fixture-building helpers inside `harness/scripts/check-verify-suite-registration.test.mjs`
and its Windows-assurance/scoped-registration siblings (exact file names to be
confirmed by whoever picks this up — PHX-WP-VERIFYREG-TRIAGE's own dispatch
record has the precise paths).

## Proposal

Redesign the affected fixtures to build their test root as a real (even if
minimal) git worktree — mirroring the pattern `verify-evidence-root.test.mjs`
itself already uses successfully — rather than a bare `mkdtempSync(tmpdir())`
directory, so `gitCommonDirectory()`'s `git rev-parse --git-common-dir` call
succeeds inside the fixture the same way it does in real use. This is a
fixture-design change, not a production-code change; `verify.mjs`'s real
behavior is correct and unaffected.

## Triage — 2026-08-19

- **Decision:** accept-open, dispatch-ready — the fix shape is already known
  (mirror `verify-evidence-root.test.mjs`'s own git-worktree fixture
  pattern), just not yet implemented across the 3 affected fixture files.
- **Rationale:** Structural, narrow, low-risk once scoped; does not affect
  real verify.mjs behavior, only these specific tests' own isolated
  environment.
- **Assignment (if accepted):** Goldfish, deep tier (test-fixture authorship).
- **Date:** 2026-08-19

## Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** All 3 named fixtures (`check-verify-suite-registration.test.mjs`, `windows-assurance-verify-registration.test.mjs`, `scoped-verify-registration.test.mjs`) rebuilt to `git init --quiet` their own fixture root instead of a bare `mkdtempSync`, commit `e61b0592` — mirroring `verify-evidence-root.test.mjs`'s real-git-topology pattern without tripping `verify.mjs`'s dirty-candidate fast-exit. All 3 suites pass (96/96 combined, up from 91/93); confirmed in a full clean-candidate Verify re-run.
- **Date:** 2026-08-19
