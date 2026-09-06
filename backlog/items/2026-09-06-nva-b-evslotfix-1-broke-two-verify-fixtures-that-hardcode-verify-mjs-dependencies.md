---
schema: pipeline.backlog-item.v1
id: pipeline.evslotfix-1-broke-verify-fixture-module-lists
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — discovered running the first full verify.mjs gate of this session (last known-green was 7cc0b649, 2026-09-02; many commits landed since across the whole day). Blocks A-C of NVA-B-EVSLOTFIX-1 (commits 61dc7fc5/d30273d3) added a new import to harness/scripts/verify.mjs (harness/scripts/verify-evidence-writer.mjs). Two test fixtures that copy verify.mjs and a hardcoded list of its dependencies into an isolated sandbox to test its behavior were never updated to also copy the new file, so the copied verify.mjs now fails to even load in those sandboxes."
done_when: manual
source: "Elephant, 2026-09-06, running `node harness/scripts/verify.mjs` for the first full-gate pass this session and diagnosing the two resulting failures directly."
---

# `NVA-B-EVSLOTFIX-1` broke two verify fixtures that hardcode `verify.mjs`'s dependencies

## The gap

Two suites fail:

- `scoped-verify-registration-tests` (`plugins/pipeline-core/lib/scoped-verify-registration.test.mjs`), test `SVR28`: the fixture's `scopedRegistrationFailureFixture()` copies `harness/scripts/verify.mjs` plus an explicit list of its sibling dependencies into a fresh sandbox, runs it, and asserts specific evidence-file content. It now returns `false` (test fails) — the copied `verify.mjs` cannot load, because `harness/scripts/verify-evidence-writer.mjs` (added by `NVA-B-EVSLOTFIX-1`, commits `61dc7fc5`/`d30273d3`) is not in the fixture's copy list.
- `windows-assurance-verify-registration-tests` (`plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs`), test `WAVR19`: the same shape, with an explicit diagnostic this time —
  `WAVR19-FIXTURE-MODULES-STALE: the copied verify.mjs imports a module FIXTURE_MODULES does not carry, so the child died at import` — `Cannot find module '.../harness/scripts/verify-evidence-writer.mjs'`.

Both fixtures hardcode the set of files `verify.mjs` needs to load standalone; neither was updated when `NVA-B-EVSLOTFIX-1` added a new dependency.

## Why this is not a NVA-B-READCONTAIN-1/2/NVA-B-TILDEFIX-1 regression

None of those three dispatches touched `harness/scripts/verify.mjs` or either fixture file. Confirmed via `git log --oneline -- harness/scripts/verify.mjs`: the last change is `d30273d3` (`NVA-B-EVSLOTFIX-1` Block C, landed earlier the same day via its own PO signature ceremony, unrelated to the read-containment work).

## Acceptance criteria

- `scoped-verify-registration.test.mjs`'s fixture copy-list includes `harness/scripts/verify-evidence-writer.mjs` (and any other file `verify.mjs` now imports that the list is missing — check exhaustively, not just this one file, since Blocks D/E are still pending their own registration and may introduce more).
- `windows-assurance-verify-registration.test.mjs`'s `FIXTURE_MODULES` gets the same fix.
- Both suites pass: `node --test plugins/pipeline-core/lib/scoped-verify-registration.test.mjs` and `node --test plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs`.
- A regression test or comment ties the fixture's module list to `verify.mjs`'s actual import statements, so the next new `verify.mjs` dependency doesn't silently break these fixtures again the same way (a mechanical cross-check, if cheap; otherwise a durable comment naming the risk is acceptable).
