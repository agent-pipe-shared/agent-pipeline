---
schema: pipeline.backlog-item.v1
id: pipeline.governance-product-verify-suites-deregistered
type: defect
owner: pipeline
status: open
source: merge report section 4 finding 3 and section 7.3 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
due: 2026-09-06
---

# ~30 Phoenix governance-product test suites are on disk but no longer run by Verify

## Description

The 0.5.2 merge (`75b8361`, local only) resolved `harness/scripts/verify.mjs`
to main's version, which does not register roughly 30 Phoenix-only
governance-product test suites (mostly `phoenix-*-tests`, plus
`codex-host-plugin-list-tests`) in its `TEST_SUITES` array. The `.test.mjs`
files themselves were untouched by the merge and still exist on disk — they
simply stop running as part of `node harness/scripts/verify.mjs`.

The same loss surfaced independently in
`docs/product-capability-inventory.json`: `check-product-capability-inventory.mjs`
(which dynamically parses `verify.mjs`'s live `TEST_SUITES` array) flagged 34
stale `verify-phase` surface references under the `deterministic-verification`
capability during the merge's union-resolution pass; those 34 entries were
removed from `capabilities[2].surfaceIds` so the inventory checker would pass
again — a metadata fix, not a functional one. The underlying suites are still
un-registered.

## Triggering situation

Merge conflict resolution on `harness/scripts/verify.mjs` (28-file code-
conflict batch, origin/main taken verbatim per PO's same-function policy).
Confirmed by running the full 341-file direct test sweep against the merged
tree: the suites in question execute fine standalone, they are just absent
from the orchestrator's registration list.

## Affected artifact

`harness/scripts/verify.mjs` (`TEST_SUITES` registration),
`docs/product-capability-inventory.json` (`capabilities[2].surfaceIds`), and
the ~30 orphaned `.test.mjs` files themselves (paths not yet enumerated here
— see the merge report's linked sub-report for the per-file list).

## Proposal

No proposal yet. Depends on the same PO decision as
[[pipeline.ledger-backed-plan-and-push-authority-absent-on-merged-base]] and
the other redesign-round items: for each orphaned suite, decide whether the
functionality it tests is being carried forward (re-register the suite and
restore its inventory surface entry) or retired (leave deregistered, and
delete the dead test file rather than leaving it as silent dead weight).

## Triage — 2026-08-18

- **Decision:** accept-open, mostly resolved but not closed.
- **Rationale:** Commits `123d09c0` and `63fd8ce9` re-registered the bulk of the ~30 orphaned suites this item names, and `63fd8ce9`'s own commit message asserts `check-verify-suite-registration.mjs` confirmed 0 unregistered at that time. Running that same checker today still fails: `plugins/pipeline-core/scripts/phoenix-authority-approval.test.mjs` is unregistered in `harness/scripts/verify.mjs`'s `TEST_SUITES`. This is a newer/missed suite, not a sign the original ~30 are still orphaned, but the item's acceptance bar (all governance-product suites registered or deliberately retired) is not yet met.
- **Assignment (if accepted):** Bounded Goldfish dispatch: register `phoenix-authority-approval.test.mjs` in `verify.mjs`'s `TEST_SUITES` (or record a deliberate, dated exclusion in `check-verify-suite-registration.mjs` if intentionally not run), then re-run the checker to confirm 0 unregistered before closing this item.
- **Date:** 2026-08-18
