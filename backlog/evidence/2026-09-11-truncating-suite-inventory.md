# Verify suite early-truncation inventory

Date: 2026-09-11

The current `harness/scripts/verify.mjs` registers 520 steps. Of these, 490
test entries reference 488 distinct `.test.mjs` files. Six additional scoped
or Windows assurance suites are registered through arrays and were counted
separately from the static entries.

A first conservative syntax scan classified 166 vulnerable registrations in
165 files. It parsed only the main Verify array and missed mixed
`node:test`/throwing-wrapper shapes. The closed registry checker now accounts
for every Verify array and classifies 170 vulnerable registrations in 169
files:

| Category | Registrations | Syntactic sites |
|---|---:|---:|
| direct `check(name, fn)` or `run(name, fn)` wrapper that throws/does not continue | 85 | 1,288 wrapper calls |
| top-level assertions without `node:test` or a callback wrapper | 77 | 5,058 assertion sites |
| one `node:test` registration containing multiple assertions | 8 | 141 assertion sites |

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

The production checker parses the main, scoped and Windows assurance arrays,
rejects registrations outside its closed literal grammar, applies the
versioned registry schema, and conservatively classifies wrapper, top-level and
single-test shapes. Its 172-entry registry also retains two already-migrated
files that still use a special self-probe rather than the normal descriptor
path. Every entry remains `legacy-process-only` until the shipped helper is
bound to its ordinary Verify invocation.

The local worker pool and supervisor source conversions are complete. The next
step is their normal Verify descriptor integration, followed by incremental
migration of the remaining registry entries.
