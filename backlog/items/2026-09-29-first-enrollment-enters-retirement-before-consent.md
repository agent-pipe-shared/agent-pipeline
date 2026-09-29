---
schema: pipeline.backlog-item.v1
id: pipeline.first-enrollment-enters-retirement-before-consent
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
source: "Actual public fresh-root onboarding qualification after delivery of the signed retirement writer."
---

# Keep first enrollment separate from retained enrollment retirement

Actual public portable plan/apply in an empty disposable root produced a ready
plan followed by `rollback-failed`. The caller started a retirement generation
before the first scaffold and attempted activation before fresh intake consent.
The writer correctly refused `ER-FRESH-CONSENT`; rollback then found a changed
Git control tree. The same route must work without supplying fixture consent
before the first public portable call.

Failure evidence: `scratch/0.7-final-source-patch-guard-qualification-20260929/manifest.json`,
SHA `03aea4efa4adbf81a850a967fcd8b7f89aa95bf2d5671d4174993dd9b4646d36`.
The correction observes selected-root history before mutation, skips retirement
for a genuinely fresh enrollment, and names explicit recovery/consent routes
for retained history. Writer consent/CAS/rollback protections remain required.

Correction evidence:
`scratch/0.7-fresh-onboarding-retirement-boundary-fix-20260929/successor-activation/manifest.json`,
SHA `1bf48f9999b5a00252752d028f116716a040df552fae95537535e9609d91ba3e`.
Four fresh-boundary regressions and a selected-root history regression have
directed receipts. The extended retained-history control follows real public
runtime initialization, decline/retire, explicit fresh consent, a named and
guard-admitted activation action, and actual active enrollment. It does not
claim full Source or installed acceptance.

## Direct activation route follow-up

The complete 23-case governance-scope suite after the non-Git reader repair
still has six original fresh-enrollment controls receiving `declined` where
the public explicit enrollment contract requires `active`. The current
`applyDecision` writes `declined` and begins retirement even when the selected
root has no transactional enrollment history. The earlier portable-caller fix
does not correct this separate caller. Frozen actual Source receipt:
`scratch/0.7-nongit-retirement-scope-reader-fix-20260929/manifest.json`, SHA
`b74c12812444d1f53dcfa0cc1ecb14d3412c0e022a2cbf95c901c3453b735933`.
Its result is 16 PASS and 7 FAIL, not an accepted Source candidate. The seventh
failure concerns authenticated onboarding of projection-only history and is
being checked against the retained-history contract separately.

An explicit enrollment of a genuinely fresh root must reach active scope
without granting plan approval. Existing transactional or corrupt history
must retain the retirement, fresh-consent, root identity, CAS and lock checks.
Preserve the original active assertions; accepting an unintended decline is
not a repair.

## Acceptance

- First portable apply succeeds in empty and already initialized Git roots
  without a retirement generation or a manufactured consent checkpoint.
- Retained non-Git history refuses before mutation with explicit recovery.
- Retired enrollment remains declined without fresh consent, then has a
  reachable public activation route after valid fresh consent.
- Old approval remains invalid; foreign shared-worktree history is not adopted.
- Rollback preserves foreign concurrent Git bytes and removes only owned data.
- The complete committed suite includes OBC298 and FRB001–FRB004; qualify the
  installed candidate separately. Keep the item open until combined acceptance.
