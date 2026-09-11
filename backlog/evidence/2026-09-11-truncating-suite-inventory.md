# Verify suite early-truncation inventory

Date: 2026-09-11

The current `harness/scripts/verify.mjs` registers 520 steps. Of these, 490
test entries reference 488 distinct `.test.mjs` files. Six additional scoped
or Windows assurance suites are registered through arrays and were counted
separately from the static entries.

A conservative syntax scan classified 166 vulnerable registrations in 165
files:

| Category | Registrations | Syntactic sites |
|---|---:|---:|
| direct `check(name, fn)` wrapper that throws/does not continue | 82 | 1,330 check calls |
| top-level assertions without `node:test` or a callback wrapper | 77 | 5,058 assertion sites |
| one `node:test` registration containing multiple assertions | 7 | 52 assertion sites |

Catch-and-continue wrappers were inspected and excluded because an assertion
there does not prevent later cases from running. Assertion-site totals are
syntactic measurements and do not claim one semantic case per assertion.

Largest registered surfaces include `project-onboarding-v3-tests` (1,473
assertion sites), `runner-profile-migration-v3-tests` (448),
`scripts-pipeline-state-tests` (276), `project-authority-tests` (198),
`onboarding-continuity-tests` (193 direct checks), `codex-critic-host-tests`
(87), and `po-gate-authority-fixture-tests` (71). The same
`harness/lib/plan-spec-state-v2.test.mjs` file is registered twice under two
step names.

The scan extracted static `{ name, file: join(...) }` registrations, counted
`assert` and `check` call syntax, required a real `node:test` import, inspected
direct wrapper execution/catch behavior, and then manually checked wrapper
definitions and call locations. This is a triage inventory; a production
completion detector needs a declared protocol rather than these heuristics.

The smallest next conversion is
`plugins/pipeline-core/lib/local-worker-pool.test.mjs`: six compact direct
checks adjacent to the already corrected supervisor suite.
