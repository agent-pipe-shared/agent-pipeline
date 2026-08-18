---
schema: pipeline.backlog-item.v1
id: pipeline.reconcile-lock-reuse-regression-test-needs-a-tp5-window
type: requirement
owner: pipeline
status: open
created: 2026-08-18
source: "PHX-WP-RECONCILE-LOCK-REALPATH dispatch (2026-08-18), stop condition: harness/scripts/pipeline-state.test.mjs is a TP-5 protected test path"
---

# Add the symlinked-`--root` regression test for the reconcile lock-reuse fix

## Description

`backlog/items/2026-08-11-reconcile-lock-reuse-uses-lexical-not-real-path-comparison.md`
was fixed and closed 2026-08-18 (commit landed same day): `defaultFeaturePackageReconcileApproval`'s
`reuseLock` computation in `plugins/pipeline-core/scripts/pipeline-state.mjs`
now compares `realpathSync`-resolved paths via `holderLock.path` instead of a
lexical `resolve()` comparison. The fix itself is verified against the full
existing suite (504/506 pass, the 2 failures are the unrelated, already-known
FTP-ARTIFACT-2 digest-drift finding).

What is still missing: a dedicated regression test proving the fixed
behavior — a symlinked `--root` that resolves to the same real directory as
the caller's `dir`/`projectDir()` correctly reuses the lock (no
`PS-CONTINUITY-LOCKED`/`FTP-RECONCILE-APPROVAL-REJECTED` self-collision)
where it previously would have collided. The dispatch that landed the fix
drafted this test (modeled on the existing `RGs` self-governing-reentrancy
fixture, using `fs.symlinkSync` in a temp directory) but could not commit it:
`harness/scripts/pipeline-state.test.mjs` is a TP-5 protected test path, and
both the `Edit` tool and a shell write were refused, requiring an external
Ed25519-signed human override (`HGO-EXTERNAL-ADAPTER-BOUNDARY`) not
obtainable from an agent session.

## Affected artifact

`harness/scripts/pipeline-state.test.mjs` (TP-5 protected).

## Proposal

Once a TP-5 signed maintenance window is available (or bundled into an
already-planned guard-kernel change window), dispatch a small, fully-scoped
Goldfish task to add one regression test (`RGt` or similar) mirroring the
existing `RGs` fixture, with a symlinked `--root`. The exact test shape was
already drafted once (2026-08-18 dispatch) and can be handed to the next
dispatch as a concrete reference rather than designed from scratch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
