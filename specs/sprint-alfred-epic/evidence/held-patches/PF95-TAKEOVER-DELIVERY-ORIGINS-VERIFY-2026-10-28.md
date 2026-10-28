# PF-95 takeover moves the delivery-target origin entries, verification and PO apply blocks (2026-10-28)

One patch, applied and committed as ONE commit on the installed candidate (`0.7.0+claude.20261028185243.fa30ba2`, stamp `44356a575`):

`w7-pf94-takeover-moves-delivery-origins-c22.patch` (4 files). This is a HELD PATCH: nothing in it is applied, stamped, installed, reviewed or accepted
until the PO has done so.

## The defect (my fault, found by a real consumer run)

After `inspect-course-takeover` (`refusalCode: null`) and `supersede-course-takeover` (`superseded`), the next `admit` on the course path ended in
`CGB-CONFLICT`. The old batch owns TWO kinds of origins index entry: the feature-course origin and, from `writeMember`, the delivery target of every member
(`authored-delivery`, task id, dispatch record, source candidate). The takeover moved only the logical work-id entries and the feature-course origin. The
reserve step (`reserveFeatureCriticReviewUnitOwnership`) refuses when the packet's own delivery target is indexed under a different batch, so the same task
could not be admitted again, and another task id is impossible (PF-89 demands a dispatch record for the task).

In bundle v3 I had seen that the delivery-target entry stayed and wrote the case `PF94 TAKEOVER (5)` to say that this was legitimate. That assertion pinned
the defect; the real run needs the same task and the same delivery target to be admitted again. It is corrected here with a written justification.

## What changes

- **`critic-generic-batch.mjs`:** a read-only helper lists every origins entry of a batch. `takeoverState` adds `originEntries` (kind and file, sorted) to
  the facts and therefore to the inspection digest; `inspect-course-takeover` prints them. The supersede moves the logical entries and ALL origins entries of
  the batch (the feature-course entry is one of them). The replay of an existing audit keeps the moves stored in it. The delivery-target `CGB-CONFLICT`
  carries a detail naming the colliding batch and the takeover verbs.
- **Tests:** `CGB035` (inspect lists both kinds and they enter the digest); `PF94 TAKEOVER (5)` corrected (no live origins entry of the old batch remains,
  all moved); new `PF94 TAKEOVER (6)`: after the supersede the SAME task id and delivery target is admitted again (RED before, GREEN after), and an
  untaken-over batch still refuses it. VCR01 pin of `critic-generic-batch-tests` 74 to 79.

## Test evidence (fresh clone of HEAD, the patch applied as ONE commit)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 35 | 35 | 0 |
| `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` | 81 | 80 | 1 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 65 | 65 | 0 |
| `plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` | 24 | 24 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |

`generate-architecture-overview.mjs --check`: current. The one finalizer failure is the pre-existing `private task snapshot binds uppercase delivered-v3
bytes without exporting record prose`; it is the only failing name and fails identically on the unchanged baseline.

## Named gaps (not done)

- **The refusal text does not reach the operator.** The detail of `CGB-CONFLICT` is set in the library, but the `admit` layer of the finalizer still prints
  only the generic `Generic Critic batch is unavailable or refused.` The case that asserted the text at the finalizer layer was removed by the Goldfish
  (deviation, written down). Surfacing the detail in `admit` is a separate small slice.
- **An already-superseded consumer state is not repaired by this patch.** There the logical entries are gone, so a corrected `supersede` finds nothing to
  take over. The one leftover file `origins/<sha>.json` of the old batch must be moved by hand into `superseded/<digest>/origins/` (same store). Nothing is deleted.
- Full Verify, batch Critic, native Windows, D31 native qualification, the real retests and PO acceptance stay open.

## PO apply blocks (from the repository root)

`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-takeover-moves-delivery-origins-c22.patch`
`git status --short` (expect 4 changed paths)
`git add -A -- plugins/pipeline-core harness`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf95.txt`

Then tell the Elephant: new stamp, install, hooks refresh.
